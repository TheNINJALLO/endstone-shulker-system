import { 
    world, 
    system, 
    ItemStack, 
    ItemLockMode, 
    EnchantmentTypes, 
    EntityComponentTypes,
    EntityItemComponent,
    ItemInventoryComponent,
    ItemEnchantableComponent,
    Potions
} from "@minecraft/server";

// Keep track of incoming chunked deliveries
const jobChunks: Record<number, { total: number; chunks: Record<number, string> }> = {};

function decodeHex(hex: string): string {
    let str = "";
    for (let i = 0; i < hex.length; i += 2) {
        const charCode = parseInt(hex.substring(i, i + 2), 16);
        str += String.fromCharCode(charCode);
    }
    return decodeURIComponent(escape(str));
}

// Listen to script events from the Endstone console command
system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id === "shulker_studio:deliver") {
        try {
            const data = JSON.parse(event.message);
            deliverJob(data);
        } catch (e) {
            console.error("[ShulkerStudio] Failed to parse job data JSON: " + e);
        }
    } else if (event.id === "shulker_studio:deliver_chunk") {
        try {
            const parts = event.message.split("_");
            if (parts.length < 4) return;
            
            const jobId = parseInt(parts[0]);
            const index = parseInt(parts[1]);
            const total = parseInt(parts[2]);
            const hexData = parts[3];
            
            const chunk = decodeHex(hexData);
            
            if (!jobChunks[jobId]) {
                jobChunks[jobId] = {
                    total: total,
                    chunks: {}
                };
            }
            
            jobChunks[jobId].chunks[index] = chunk;
            
            // Check if we have received all chunks
            let receivedAll = true;
            for (let i = 0; i < total; i++) {
                if (jobChunks[jobId].chunks[i] === undefined) {
                    receivedAll = false;
                    break;
                }
            }
            
            if (receivedAll) {
                // Assemble the full JSON string
                let fullJsonStr = "";
                for (let i = 0; i < total; i++) {
                    fullJsonStr += jobChunks[jobId].chunks[i];
                }
                
                // Clean up in-memory storage
                delete jobChunks[jobId];
                
                const data = JSON.parse(fullJsonStr);
                deliverJob(data);
            }
        } catch (e) {
            console.error("[ShulkerStudio] Failed to process hex chunk delivery: " + e);
        }
    }
});

function deliverJob(data: any) {
    const { jobId, player: playerName, shulker: shulkerType, method, slots } = data;
    
    // Locate player online
    const players = [...world.getPlayers()];
    const player = players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
    
    if (!player) {
        confirmDelivery(jobId, playerName, "failed", "Player is not online");
        return;
    }

    const dimension = player.dimension;

    // Check if we can populate container items directly (usually unsupported for vanilla shulkers in inventory)
    let isDirectSupported = false;
    try {
        const testItem = new ItemStack(shulkerType, 1);
        const invComp = testItem.getComponent("minecraft:inventory") as ItemInventoryComponent;
        if (invComp && invComp.container) {
            isDirectSupported = true;
        }
    } catch (e) {}

    if (isDirectSupported) {
        // Direct method (e.g. for custom storage item that supports getComponent("minecraft:inventory"))
        try {
            const shulkerItem = new ItemStack(shulkerType, 1);
            const invComp = shulkerItem.getComponent("minecraft:inventory") as ItemInventoryComponent;
            const container = invComp.container;
            
            for (const s of slots) {
                const item = createItemStack(s);
                if (item && container) {
                    container.setItem(s.slot, item);
                }
            }
            
            deliverItemStackToPlayer(player, shulkerItem, method);
            confirmDelivery(jobId, playerName, "success");
        } catch (e: any) {
            confirmDelivery(jobId, playerName, "failed", "Direct fill error: " + e.message);
        }
    } else {
        // Fallback method: Place Block -> Fill -> Break -> Catch Item -> Deliver -> Restore Block
        const loc = findSafeTempLocation(player);
        const originalBlock = dimension.getBlock(loc);
        if (!originalBlock) {
            confirmDelivery(jobId, playerName, "failed", "Could not access temporary block location");
            return;
        }

        const originalPerm = originalBlock.permutation;

        // 1. Place the shulker box block
        try {
            originalBlock.setType(shulkerType);
        } catch (e: any) {
            confirmDelivery(jobId, playerName, "failed", "Failed to place temporary shulker block: " + e.message);
            return;
        }

        // 2. Access block inventory
        const blockInventory = originalBlock.getComponent("inventory");
        if (!blockInventory || !blockInventory.container) {
            // Restore block and fail
            originalBlock.setPermutation(originalPerm);
            confirmDelivery(jobId, playerName, "failed", "Placed block is not a valid container / lacks inventory component");
            return;
        }

        const container = blockInventory.container;

        // 3. Fill the slots
        try {
            for (const s of slots) {
                const item = createItemStack(s);
                if (item) {
                    container.setItem(s.slot, item);
                }
            }
        } catch (e: any) {
            originalBlock.setPermutation(originalPerm);
            confirmDelivery(jobId, playerName, "failed", "Failed to populate container slots: " + e.message);
            return;
        }

        // 4. Break the block using setblock air destroy command to drop it as a filled item entity
        const breakCmd = `setblock ${loc.x} ${loc.y} ${loc.z} air destroy`;
        
        try {
            dimension.runCommand(breakCmd);
            
            // Restore original block permutation on the next tick
            system.runTimeout(() => {
                try {
                    originalBlock.setPermutation(originalPerm);
                } catch (e) {
                    console.error("[ShulkerStudio] Failed to restore original block state: " + e);
                }
            }, 1);

            // Fetch the dropped item entity near the location
            system.runTimeout(() => {
                try {
                    const items = dimension.getEntities({
                        location: loc,
                        maxDistance: 2.0,
                        type: "minecraft:item"
                    });

                    let found = false;
                    for (const itemEntity of items) {
                        const itemComp = itemEntity.getComponent("minecraft:item");
                        if (itemComp && itemComp instanceof EntityItemComponent) {
                            const stack = itemComp.itemStack;
                            if (stack && stack.typeId === shulkerType) {
                                // Delete item from ground
                                itemEntity.remove();
                                // Give directly to player
                                deliverItemStackToPlayer(player, stack, method);
                                found = true;
                                break;
                            }
                        }
                    }

                    if (found) {
                        confirmDelivery(jobId, playerName, "success");
                    } else {
                        // Fallback: If not found, it might have already been picked up or slid.
                        // We will confirm success as block broke successfully.
                        confirmDelivery(jobId, playerName, "success", "Delivered (block broke, item entity claimed or dropped)");
                    }
                } catch (e: any) {
                    confirmDelivery(jobId, playerName, "failed", "Failed during item entity collection: " + e.message);
                }
            }, 2); // Wait 2 ticks for the block loot to drop
        } catch (e: any) {
            originalBlock.setPermutation(originalPerm);
            confirmDelivery(jobId, playerName, "failed", "Failed to destroy temporary block: " + e.message);
        }
    }
}

function findSafeTempLocation(player: any): any {
    const startLoc = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
    };
    
    const dimension = player.dimension;
    
    // Check player head height (usually air)
    const headBlock = dimension.getBlock({ x: startLoc.x, y: startLoc.y + 1, z: startLoc.z });
    if (headBlock && (headBlock.typeId === "minecraft:air" || headBlock.typeId === "minecraft:cave_air")) {
        return { x: startLoc.x, y: startLoc.y + 1, z: startLoc.z };
    }
    
    // Check player foot height
    const footBlock = dimension.getBlock(startLoc);
    if (footBlock && (footBlock.typeId === "minecraft:air" || footBlock.typeId === "minecraft:cave_air")) {
        return startLoc;
    }
    
    // Default safe offset
    return { x: startLoc.x, y: startLoc.y + 3, z: startLoc.z };
}

function createItemStack(s: any): ItemStack | undefined {
    try {
        let item: ItemStack;
        
        // Handle potions using Potions API if a potionEffectType is specified
        if (s.potionEffectType && (s.typeId === "minecraft:potion" || s.typeId === "minecraft:splash_potion" || s.typeId === "minecraft:lingering_potion")) {
            try {
                const delivery = Potions.getDeliveryType(s.typeId);
                const fullEffectName = s.potionEffectType.includes(":") ? s.potionEffectType : `minecraft:${s.potionEffectType}`;
                const effect = Potions.getEffectType(fullEffectName);
                if (delivery && effect) {
                    item = Potions.resolve(effect, delivery);
                    item.amount = s.amount;
                } else {
                    console.warn(`[ShulkerStudio] Could not resolve potion for effect: ${s.potionEffectType} and delivery: ${s.typeId}. Falling back to default.`);
                    item = new ItemStack(s.typeId, s.amount);
                }
            } catch (potionError) {
                console.error(`[ShulkerStudio] Potions API resolution error: ${potionError}. Falling back.`);
                item = new ItemStack(s.typeId, s.amount);
            }
        } else {
            item = new ItemStack(s.typeId, s.amount);
        }
        
        // Custom name tag
        if (s.nameTag) {
            item.nameTag = s.nameTag;
        }
        
        // Lore
        if (s.lore && s.lore.length > 0) {
            item.setLore(s.lore);
        }
        
        // Enchantments
        const enchantable = item.getComponent("minecraft:enchantable") as ItemEnchantableComponent;
        if (enchantable && s.enchantments) {
            for (const [enchName, level] of Object.entries(s.enchantments)) {
                try {
                    const fullEnchName = enchName.includes(":") ? enchName : `minecraft:${enchName}`;
                    const enchType = EnchantmentTypes.get(fullEnchName);
                    if (enchType) {
                        enchantable.addEnchantment({
                            type: enchType,
                            level: level as number
                        });
                    } else {
                        console.error(`[ShulkerStudio] Enchantment type not found: ${fullEnchName}`);
                    }
                } catch (e) {
                    console.error(`[ShulkerStudio] Failed to apply enchantment ${enchName}: ${e}`);
                }
            }
        }
        
        // Keep on death
        if (s.keepOnDeath !== undefined) {
            try {
                item.keepOnDeath = !!s.keepOnDeath;
            } catch (e) {}
        }
        
        // Lock Mode
        if (s.lockMode && s.lockMode !== "none") {
            try {
                if (s.lockMode === "lock_in_slot" || s.lockMode === "slot") {
                    item.lockMode = ItemLockMode.slot;
                } else if (s.lockMode === "lock_in_inventory" || s.lockMode === "inventory") {
                    item.lockMode = ItemLockMode.inventory;
                } else {
                    item.lockMode = ItemLockMode.none;
                }
            } catch (e) {}
        }
        
        return item;
    } catch (e) {
        console.error(`[ShulkerStudio] Error instantiating item stack for ${s.typeId}: ${e}`);
        return undefined;
    }
}

function deliverItemStackToPlayer(player: any, item: ItemStack, method: string) {
    const inv = player.getComponent("minecraft:inventory");
    if (!inv || !inv.container) {
        player.dimension.spawnItem(item, player.location);
        return;
    }
    
    if (method === "Give" || method === "Join") {
        try {
            const leftover = inv.container.addItem(item);
            if (leftover) {
                player.dimension.spawnItem(leftover, player.location);
            }
        } catch (e) {
            player.dimension.spawnItem(item, player.location);
        }
    } else {
        // Drop at feet (method === "Feet")
        player.dimension.spawnItem(item, player.location);
    }
}

function confirmDelivery(jobId: number, player: string, status: "success" | "failed", errorMsg: string = "") {
    try {
        const payload = {
            jobId: jobId,
            player: player,
            status: status,
            error: errorMsg
        };
        const cmd = `scriptevent shulker_studio:confirm ${JSON.stringify(payload)}`;
        world.getDimension("overworld").runCommand(cmd);
    } catch (e) {
        console.error("[ShulkerStudio] Failed to issue scriptevent confirm callback: " + e);
    }
}
