import time
from typing import List, Dict, Any, Optional

def deliver_shulker(plugin, player_name: str, template_name: str, slots: List[Dict[str, Any]], shulker_type: str = "minecraft:purple_shulker_box"):
    db_id = plugin.db.create_delivery(
        player_name=player_name,
        template_name=template_name,
        shulker_type=shulker_type,
        slots_data=slots,
        method="Give"
    )
    
    player = plugin.server.get_player(player_name)
    if player:
        try:
            delivery_item = {
                "id": db_id,
                "player_name": player_name,
                "shulker_type": shulker_type,
                "delivery_method": "Give",
                "slots_data": slots
            }
            plugin._dispatch_delivery(delivery_item)
            plugin.logger.info(f"[ShulkerStudio] Dispatched Tebex reward '{template_name}' to online player {player_name}.")
        except Exception as e:
            plugin.logger.error(f"[ShulkerStudio] Failed to dispatch Tebex reward '{template_name}' immediately: {e}")
    else:
        plugin.db.update_delivery_status(db_id, "PENDING", "Queued for join. Player is offline.")
        plugin.logger.info(f"[ShulkerStudio] Queued Tebex reward '{template_name}' for offline player {player_name}.")

def add_coins(plugin, player_name: str, amount: int):
    cmd = f'scoreboard players add "{player_name}" Money {amount}'
    plugin.logger.info(f"[ShulkerStudio] Executing scoreboard command: {cmd}")
    plugin.server.dispatch_command(plugin.server.command_sender, cmd)

def add_tag(plugin, player_name: str, tag: str):
    cmd = f'tag "{player_name}" add {tag}'
    plugin.logger.info(f"[ShulkerStudio] Executing tag command: {cmd}")
    plugin.server.dispatch_command(plugin.server.command_sender, cmd)

def generate_warp_code(plugin, player_name: str, tag: str, display_name: str, duration: int):
    warp_plugin = plugin.server.plugin_manager.get_plugin("warp-codes")
    if not warp_plugin:
        warp_plugin = plugin.server.plugin_manager.get_plugin("warp_codes")
        
    if warp_plugin:
        try:
            # warp-codes plugin exposes generate_code() returning an 8-character string
            code = warp_plugin.generate_code()
            generation_time = time.time() * 1000
            code_data = {
                'type': tag,
                'typeName': display_name,
                'duration': duration,
                'generatedAt': generation_time,
                'generatedBy': 'TebexSystem',
                'generatorUUID': '00000000-0000-0000-0000-000000000000',
                'isMultiUse': False,
                'redeemed': False
            }
            warp_plugin.code_db.write(code, code_data)
            
            # Post code to Discord webhook if configured in the warp-codes plugin
            if hasattr(warp_plugin, "webhook_db") and hasattr(warp_plugin, "send_to_discord"):
                try:
                    webhooks = warp_plugin.webhook_db.read("webhooks") or {}
                    tag_hooks = webhooks.get(tag, {})
                    url = tag_hooks.get(str(duration))
                    if not url:
                        url = tag_hooks.get("default")
                    
                    if url:
                        import threading
                        # send_to_discord expects a list of codes
                        threading.Thread(
                            target=warp_plugin.send_to_discord, 
                            args=(url, tag, duration, [code]),
                            daemon=True
                        ).start()
                        plugin.logger.info(f"[ShulkerStudio] Posted generated warp code {code} ({tag}) to Discord webhook via warp-codes")
                except Exception as wh_err:
                    plugin.logger.error(f"[ShulkerStudio] Failed to post warp code to Discord webhook: {wh_err}")

            player = plugin.server.get_player(player_name)
            msg = f"§a[Tebex] Thank you for your support! Here is your Warp Code for §e{display_name} §a({duration} Days):\n§6§l{code}\n§r§aUse §b/redeem {code} §ain-game to claim it!"
            if player:
                player.send_message(msg)
                plugin.logger.info(f"[ShulkerStudio] Generated warp code {code} ({tag}) for online player {player_name}")
            else:
                plugin.logger.info(f"[ShulkerStudio] Generated warp code {code} ({tag}) for offline player {player_name} (Logged for lookup)")
            return code
        except Exception as e:
            plugin.logger.error(f"[ShulkerStudio] Error generating warp code in warp-codes plugin: {e}")
    else:
        plugin.logger.error("[ShulkerStudio] Could not generate warp code: warp-codes plugin not found on the server!")
    return None

def get_builder_sack_items(start_slot: int = 0) -> List[Dict[str, Any]]:
    items = [
        ("minecraft:scaffolding", 64),
        ("minecraft:scaffolding", 64),
        ("minecraft:scaffolding", 64),
        ("minecraft:crafting_table", 1),
        ("minecraft:anvil", 1),
        ("minecraft:stonecutter", 1),
        ("minecraft:grindstone", 1)
    ]
    slots = []
    for i, (item_id, amt) in enumerate(items):
        slots.append({
            "slot": start_slot + i,
            "typeId": item_id,
            "amount": amt
        })
    return slots

def get_gear_set(material: str, start_slot: int = 0, epic_enchants: bool = False, rare_enchants: bool = False) -> List[Dict[str, Any]]:
    armor = [f"minecraft:{material}_helmet", f"minecraft:{material}_chestplate", f"minecraft:{material}_leggings", f"minecraft:{material}_boots"]
    tools = [f"minecraft:{material}_sword", f"minecraft:{material}_pickaxe", f"minecraft:{material}_axe", f"minecraft:{material}_shovel"]
    
    slots = []
    slot_id = start_slot
    
    for item_id in (armor + tools):
        ench = {"mending": 1}
        if epic_enchants:
            ench["unbreaking"] = 3
            if "helmet" in item_id:
                ench["protection"] = 4
                ench["respiration"] = 3
            elif "chestplate" in item_id or "leggings" in item_id or "boots" in item_id:
                ench["protection"] = 4
            elif "sword" in item_id:
                ench["sharpness"] = 5
                ench["looting"] = 3
            elif "pickaxe" in item_id or "axe" in item_id or "shovel" in item_id:
                ench["efficiency"] = 5
        elif rare_enchants:
            ench["unbreaking"] = 2
            if "helmet" in item_id or "chestplate" in item_id or "leggings" in item_id or "boots" in item_id:
                ench["protection"] = 3
            elif "sword" in item_id:
                ench["sharpness"] = 4
            elif "pickaxe" in item_id or "axe" in item_id or "shovel" in item_id:
                ench["efficiency"] = 4
                
        slots.append({
            "slot": slot_id,
            "typeId": item_id,
            "amount": 1,
            "enchantments": ench
        })
        slot_id += 1
        
    return slots

def get_enchant_books(rarity: str, start_slot: int = 0) -> List[Dict[str, Any]]:
    if rarity == "common":
        books = [
            ("protection", 2), ("sharpness", 2), ("efficiency", 2), ("unbreaking", 2),
            ("fire_protection", 2), ("feather_falling", 2), ("looting", 1), ("fortune", 1)
        ]
    elif rarity == "rare":
        books = [
            ("protection", 4), ("sharpness", 4), ("efficiency", 4), ("unbreaking", 3),
            ("feather_falling", 4), ("looting", 2), ("fortune", 2), ("mending", 1)
        ]
    else: # epic
        books = [
            ("protection", 4), ("sharpness", 5), ("efficiency", 5), ("unbreaking", 3),
            ("feather_falling", 4), ("looting", 3), ("fortune", 3), ("mending", 1), ("silk_touch", 1)
        ]
        
    slots = []
    for i, (ench_name, lvl) in enumerate(books):
        slots.append({
            "slot": start_slot + i,
            "typeId": "minecraft:enchanted_book",
            "amount": 1,
            "enchantments": {ench_name: lvl},
            "nameTag": f"§dEnchanted Book: {ench_name.replace('_', ' ').title()} {lvl}"
        })
    return slots

def get_cracked_shulker_items() -> List[Dict[str, Any]]:
    slots = []
    # 9 stacks of E-Apples (slots 0-8)
    for i in range(9):
        slots.append({"slot": i, "typeId": "minecraft:enchanted_golden_apple", "amount": 64})
    # 7 stacks of Golden Carrots (slots 9-15)
    for i in range(7):
        slots.append({"slot": 9 + i, "typeId": "minecraft:golden_carrot", "amount": 64})
    # 5 stacks of fireworks (slots 16-20)
    for i in range(5):
        slots.append({"slot": 16 + i, "typeId": "minecraft:firework_rocket", "amount": 64})
    # Elytra (slot 21)
    slots.append({
        "slot": 21,
        "typeId": "minecraft:elytra",
        "amount": 1,
        "enchantments": {"unbreaking": 3, "mending": 1},
        "nameTag": "§6Cracked Elytra"
    })
    # 5 armor trims (slots 22-26)
    trims = [
        "minecraft:silence_armor_trim_template",
        "minecraft:spire_armor_trim_template",
        "minecraft:rib_armor_trim_template",
        "minecraft:snout_armor_trim_template",
        "minecraft:ward_armor_trim_template"
    ]
    for i, trim_id in enumerate(trims):
        slots.append({"slot": 22 + i, "typeId": trim_id, "amount": 1})
    return slots

def make_custom_shulker(index: int) -> List[Dict[str, Any]]:
    slots = []
    items_pool = [
        ("minecraft:diamond", 64),
        ("minecraft:netherite_ingot", 16),
        ("minecraft:emerald", 64),
        ("minecraft:experience_bottle", 64),
        ("minecraft:golden_apple", 32),
        ("minecraft:obsidian", 64),
        ("minecraft:shulker_shell", 4),
        ("minecraft:totem_of_undying", 1)
    ]
    enchants = [
        {"protection": 4},
        {"sharpness": 5},
        {"efficiency": 5},
        {"unbreaking": 3},
        {"mending": 1}
    ]
    
    for slot_idx in range(12):
        item_id, amt = items_pool[(slot_idx + index) % len(items_pool)]
        slots.append({"slot": slot_idx, "typeId": item_id, "amount": amt})
        
    for eb_idx in range(4):
        slots.append({
            "slot": 12 + eb_idx,
            "typeId": "minecraft:enchanted_book",
            "amount": 1,
            "enchantments": enchants[(eb_idx + index) % len(enchants)]
        })
        
    blocks = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:smooth_stone"]
    for b_idx in range(11):
        slots.append({
            "slot": 16 + b_idx,
            "typeId": blocks[(b_idx + index) % len(blocks)],
            "amount": 64
        })
        
    return slots

def process_tebex_package(plugin, player_name: str, package_name: str) -> bool:
    pkg = package_name.lower().strip()
    plugin.logger.info(f"[ShulkerStudio] Processing Tebex purchase of '{pkg}' for player '{player_name}'...")
    
    # 1. TP Rope Subscriptions
    if pkg in ("rope_level1", "rope_level1_year"):
        dur = 365 if "year" in pkg else 30
        generate_warp_code(plugin, player_name, "WARP1", "Level 1 TP Rope", dur)
        return True
    elif pkg in ("rope_level2", "rope_level2_year"):
        dur = 365 if "year" in pkg else 30
        generate_warp_code(plugin, player_name, "WARP2", "Level 2 TP Rope", dur)
        return True
        
    # 2. Armor Trims
    elif pkg == "trims_9":
        trims = [
            "minecraft:silence_armor_trim_template", "minecraft:spire_armor_trim_template",
            "minecraft:rib_armor_trim_template", "minecraft:snout_armor_trim_template",
            "minecraft:ward_armor_trim_template", "minecraft:eye_armor_trim_template",
            "minecraft:vex_armor_trim_template", "minecraft:tide_armor_trim_template",
            "minecraft:wild_armor_trim_template"
        ]
        slots = [{"slot": i, "typeId": trim_id, "amount": 1} for i, trim_id in enumerate(trims)]
        deliver_shulker(plugin, player_name, "Tebex: Armor Trims (9)", slots)
        return True
    elif pkg == "trims_18":
        trims = [
            "minecraft:silence_armor_trim_template", "minecraft:spire_armor_trim_template",
            "minecraft:rib_armor_trim_template", "minecraft:snout_armor_trim_template",
            "minecraft:ward_armor_trim_template", "minecraft:eye_armor_trim_template",
            "minecraft:vex_armor_trim_template", "minecraft:tide_armor_trim_template",
            "minecraft:wild_armor_trim_template"
        ]
        slots = []
        # Give 2 of each of the 9 templates to fill 18 slots
        for i, trim_id in enumerate(trims):
            slots.append({"slot": i * 2, "typeId": trim_id, "amount": 1})
            slots.append({"slot": (i * 2) + 1, "typeId": trim_id, "amount": 1})
        deliver_shulker(plugin, player_name, "Tebex: Armor Trims (18)", slots)
        return True
        
    # 3. Structure Move
    elif pkg == "structure_move":
        slots = [{
            "slot": 0,
            "typeId": "minecraft:paper",
            "amount": 1,
            "nameTag": "§aStructure Move Voucher",
            "lore": ["§7Bring this voucher to an admin", "§7to perform 1 Structure Move.", "§7Fits within 100x100 grid."]
        }]
        deliver_shulker(plugin, player_name, "Tebex: Structure Move Voucher", slots)
        return True
        
    # 4. The Vault (TK Coins)
    elif pkg == "vault_15k":
        add_coins(plugin, player_name, 15000)
        return True
    elif pkg == "vault_50k":
        add_coins(plugin, player_name, 50000)
        return True
    elif pkg == "vault_200k":
        add_coins(plugin, player_name, 200000)
        return True
    elif pkg == "vault_500k":
        add_coins(plugin, player_name, 500000)
        return True
    elif pkg == "vault_125m":
        add_coins(plugin, player_name, 1250000)
        return True
    elif pkg == "vault_3m":
        add_coins(plugin, player_name, 3000000)
        return True
        
    # 5. Creative Area Packs (generates build warp code + delivers structure move vouchers)
    elif pkg == "creative_3d":
        generate_warp_code(plugin, player_name, "build", "Build Mode", 3)
        slots = [{
            "slot": 0,
            "typeId": "minecraft:paper",
            "amount": 1,
            "nameTag": "§aStructure Move Voucher",
            "lore": ["§7Bring this voucher to an admin to perform 1 Structure Move."]
        }]
        deliver_shulker(plugin, player_name, "Tebex: Creative 3D Pack", slots)
        return True
    elif pkg == "creative_7d":
        generate_warp_code(plugin, player_name, "build", "Build Mode", 7)
        slots = [{
            "slot": 0,
            "typeId": "minecraft:paper",
            "amount": 1,
            "nameTag": "§aStructure Move Voucher",
            "lore": ["§7Bring this voucher to an admin to perform 1 Structure Move."]
        }]
        deliver_shulker(plugin, player_name, "Tebex: Creative 7D Pack", slots)
        return True
    elif pkg == "creative_15d":
        generate_warp_code(plugin, player_name, "build", "Build Mode", 15)
        slots = [
            {"slot": 0, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§aStructure Move Voucher", "lore": ["§7Structure Move 1"]},
            {"slot": 1, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§aStructure Move Voucher", "lore": ["§7Structure Move 2"]}
        ]
        deliver_shulker(plugin, player_name, "Tebex: Creative 15D Pack", slots)
        return True
    elif pkg == "creative_30d":
        generate_warp_code(plugin, player_name, "build", "Build Mode", 30)
        slots = [{"slot": i, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§aStructure Move Voucher", "lore": [f"§7Structure Move {i+1}"]} for i in range(4)]
        deliver_shulker(plugin, player_name, "Tebex: Creative 30D Pack", slots)
        return True
        
    # 6. The Ore Bag
    elif pkg == "ore_bag_ingots_4":
        slots = [
            {"slot": 0, "typeId": "minecraft:diamond", "amount": 64},
            {"slot": 1, "typeId": "minecraft:netherite_ingot", "amount": 64},
            {"slot": 2, "typeId": "minecraft:gold_ingot", "amount": 64},
            {"slot": 3, "typeId": "minecraft:iron_ingot", "amount": 64}
        ]
        deliver_shulker(plugin, player_name, "Tebex: Ore Bag (Ingots x4)", slots)
        return True
    elif pkg == "ore_bag_ingots_9":
        slots = []
        ores = ["minecraft:diamond", "minecraft:netherite_ingot", "minecraft:gold_ingot", "minecraft:iron_ingot", "minecraft:copper_ingot"]
        for i in range(9):
            slots.append({"slot": i, "typeId": ores[i % len(ores)], "amount": 64})
        deliver_shulker(plugin, player_name, "Tebex: Ore Bag (Ingots x9)", slots)
        return True
    elif pkg == "ore_bag_ingots_18":
        slots = []
        ores = ["minecraft:diamond", "minecraft:netherite_ingot", "minecraft:gold_ingot", "minecraft:iron_ingot", "minecraft:copper_ingot"]
        for i in range(18):
            slots.append({"slot": i, "typeId": ores[i % len(ores)], "amount": 64})
        deliver_shulker(plugin, player_name, "Tebex: Ore Bag (Ingots x18)", slots)
        return True
    elif pkg == "ore_bag_blocks_10":
        slots = []
        blocks = ["minecraft:diamond_block", "minecraft:netherite_block", "minecraft:gold_block", "minecraft:iron_block", "minecraft:emerald_block"]
        for i in range(10):
            slots.append({"slot": i, "typeId": blocks[i % len(blocks)], "amount": 64})
        deliver_shulker(plugin, player_name, "Tebex: Ore Bag (Blocks x10)", slots)
        return True
    elif pkg == "ore_bag_blocks_27":
        slots = []
        blocks = ["minecraft:diamond_block", "minecraft:netherite_block", "minecraft:gold_block", "minecraft:iron_block", "minecraft:emerald_block"]
        for i in range(27):
            slots.append({"slot": i, "typeId": blocks[i % len(blocks)], "amount": 64})
        deliver_shulker(plugin, player_name, "Tebex: Ore Bag (Blocks x27)", slots)
        return True
        
    # 7. The Armory
    elif pkg == "armory_5":
        add_coins(plugin, player_name, 5000)
        slots = get_gear_set("diamond", 0, epic_enchants=False, rare_enchants=False)
        deliver_shulker(plugin, player_name, "Tebex: Armory Pack ($5)", slots)
        return True
    elif pkg == "armory_10":
        add_coins(plugin, player_name, 25000)
        slots = get_gear_set("diamond", 0, epic_enchants=False, rare_enchants=False)
        slots += get_enchant_books("common", len(slots))
        deliver_shulker(plugin, player_name, "Tebex: Armory Pack ($10)", slots)
        return True
    elif pkg == "armory_15":
        add_coins(plugin, player_name, 100000)
        slots = get_gear_set("diamond", 0, epic_enchants=False, rare_enchants=True)
        slots += get_enchant_books("rare", len(slots))
        deliver_shulker(plugin, player_name, "Tebex: Armory Pack ($15)", slots)
        return True
    elif pkg == "armory_20":
        add_coins(plugin, player_name, 150000)
        slots = get_gear_set("diamond", 0, epic_enchants=True, rare_enchants=False)
        slots += get_enchant_books("epic", len(slots))
        deliver_shulker(plugin, player_name, "Tebex: Armory Pack ($20)", slots)
        return True
    elif pkg == "armory_25":
        add_coins(plugin, player_name, 200000)
        slots = get_gear_set("netherite", 0, epic_enchants=False, rare_enchants=True)
        slots += get_enchant_books("rare", len(slots))
        deliver_shulker(plugin, player_name, "Tebex: Armory Pack ($25)", slots)
        return True
    elif pkg == "armory_50":
        add_coins(plugin, player_name, 350000)
        slots = get_gear_set("netherite", 0, epic_enchants=True, rare_enchants=False)
        slots += get_enchant_books("epic", len(slots))
        deliver_shulker(plugin, player_name, "Tebex: Armory Pack ($50)", slots)
        return True
        
    # 8. Contractors Box
    elif pkg == "contractor_5":
        add_coins(plugin, player_name, 5000)
        # 9 stacks building blocks + builder sack
        slots = []
        blocks = ["minecraft:oak_log", "minecraft:cobblestone", "minecraft:smooth_stone"]
        for i in range(9):
            slots.append({"slot": i, "typeId": blocks[i % len(blocks)], "amount": 64})
        slots += get_builder_sack_items(len(slots))
        deliver_shulker(plugin, player_name, "Tebex: Contractors Box ($5)", slots)
        return True
    elif pkg == "contractor_10":
        add_coins(plugin, player_name, 25000)
        # 1 Shulker building blocks + builder sack (combining in 1 shulker)
        # builder sack is 7 items, meaning we have 20 slots of building blocks
        slots = []
        blocks = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:brick_block"]
        for i in range(20):
            slots.append({"slot": i, "typeId": blocks[i % len(blocks)], "amount": 64})
        slots += get_builder_sack_items(len(slots))
        deliver_shulker(plugin, player_name, "Tebex: Contractors Box ($10)", slots)
        return True
    elif pkg == "contractor_15":
        add_coins(plugin, player_name, 100000)
        # 5 Shulkers + builder sack
        # Deliver 4 full shulker boxes of blocks + 1 shulker containing builder sack + rest blocks
        blocks = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:brick_block", "minecraft:deepslate"]
        for sh_idx in range(4):
            slots = [{"slot": i, "typeId": blocks[(i + sh_idx) % len(blocks)], "amount": 64} for i in range(27)]
            deliver_shulker(plugin, player_name, f"Tebex: Contractors Box ($15) [Box {sh_idx+1}/5]", slots)
        # Last shulker contains builder sack + blocks
        slots = [{"slot": i, "typeId": blocks[i % len(blocks)], "amount": 64} for i in range(20)]
        slots += get_builder_sack_items(len(slots))
        deliver_shulker(plugin, player_name, "Tebex: Contractors Box ($15) [Box 5/5 + Sack]", slots)
        return True
    elif pkg == "contractor_25":
        add_coins(plugin, player_name, 200000)
        # 12 Shulkers + builder sack
        blocks = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:brick_block", "minecraft:concrete"]
        for sh_idx in range(11):
            slots = [{"slot": i, "typeId": blocks[(i + sh_idx) % len(blocks)], "amount": 64} for i in range(27)]
            deliver_shulker(plugin, player_name, f"Tebex: Contractors Box ($25) [Box {sh_idx+1}/12]", slots)
        slots = [{"slot": i, "typeId": blocks[i % len(blocks)], "amount": 64} for i in range(20)]
        slots += get_builder_sack_items(len(slots))
        deliver_shulker(plugin, player_name, "Tebex: Contractors Box ($25) [Box 12/12 + Sack]", slots)
        return True
        
    # 9. Shop Owners Only
    elif pkg in ("shop_5", "shop_10", "shop_15", "shop_20", "shop_25", "shop_50"):
        num_shulkers = {
            "shop_5": 1, "shop_10": 3, "shop_15": 4, "shop_20": 7, "shop_25": 9, "shop_50": 20
        }[pkg]
        
        # Populate each shulker with Restock Voucher + common premium shop items
        shop_items = ["minecraft:emerald", "minecraft:diamond", "minecraft:experience_bottle", "minecraft:golden_carrot", "minecraft:obsidian"]
        for idx in range(num_shulkers):
            slots = []
            # Voucher paper
            slots.append({
                "slot": 0,
                "typeId": "minecraft:paper",
                "amount": 1,
                "nameTag": "§dShop Restock Voucher",
                "lore": ["§7Give this voucher to an admin", f"§7to claim shop stock package details.", f"§7Shulker Box {idx+1}/{num_shulkers}"]
            })
            # Rest slots are filled with common stock items
            for i in range(26):
                slots.append({
                    "slot": i + 1,
                    "typeId": shop_items[(i + idx) % len(shop_items)],
                    "amount": 64
                })
            deliver_shulker(plugin, player_name, f"Tebex: Shop Restock Shulker ({idx+1}/{num_shulkers})", slots)
        return True
        
    # 10. Cracked pack Nation (Mixers)
    elif pkg == "cracked_50":
        add_coins(plugin, player_name, 100000)
        add_tag(plugin, player_name, "tag_cracked")
        # 15 Custom shulkers + 2 Pet Vouchers
        for sh_idx in range(15):
            slots = make_custom_shulker(sh_idx)
            if sh_idx == 0:
                # Add pet vouchers to the first shulker
                slots[0] = {"slot": 0, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§6Pet Voucher", "lore": ["§7Redeem this voucher with an admin for a free custom pet."]}
                slots[1] = {"slot": 1, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§6Pet Voucher", "lore": ["§7Redeem this voucher with an admin for a free custom pet."]}
            deliver_shulker(plugin, player_name, f"Cracked Pack ($50) [Box {sh_idx+1}/15]", slots)
        return True
        
    elif pkg == "cracked_100":
        add_coins(plugin, player_name, 800000)
        add_tag(plugin, player_name, "tag_super_cracked")
        # 15 Custom shulkers
        for sh_idx in range(15):
            slots = make_custom_shulker(sh_idx)
            if sh_idx == 0:
                slots[0] = {"slot": 0, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§6Pet Voucher", "lore": ["§7Free custom pet."]}
                slots[1] = {"slot": 1, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§6Pet Voucher", "lore": ["§7Free custom pet."]}
                slots[2] = {"slot": 2, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§aStructure Move Voucher", "lore": ["§71 Structure Move"]}
                slots[3] = {"slot": 3, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§aStructure Move Voucher", "lore": ["§71 Structure Move"]}
            deliver_shulker(plugin, player_name, f"Super Cracked Pack ($100) [Box {sh_idx+1}/15]", slots)
        # 1 Cracked shulker
        deliver_shulker(plugin, player_name, "Super Cracked Pack ($100) [Cracked Box]", get_cracked_shulker_items())
        return True
        
    elif pkg == "cracked_150":
        add_coins(plugin, player_name, 1250000)
        add_tag(plugin, player_name, "tag_cracked_king")
        # 35 Custom shulkers
        for sh_idx in range(35):
            slots = make_custom_shulker(sh_idx)
            if sh_idx == 0:
                slots[0] = {"slot": 0, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§6Pet Voucher", "lore": ["§7Free custom pet."]}
                slots[1] = {"slot": 1, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§6Pet Voucher", "lore": ["§7Free custom pet."]}
                slots[2] = {"slot": 2, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§aStructure Move Voucher", "lore": ["§71 Structure Move"]}
                slots[3] = {"slot": 3, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§aStructure Move Voucher", "lore": ["§71 Structure Move"]}
            deliver_shulker(plugin, player_name, f"Cracked King Pack ($150) [Box {sh_idx+1}/35]", slots)
        # 2 Cracked shulkers
        deliver_shulker(plugin, player_name, "Cracked King Pack ($150) [Cracked Box 1/2]", get_cracked_shulker_items())
        deliver_shulker(plugin, player_name, "Cracked King Pack ($150) [Cracked Box 2/2]", get_cracked_shulker_items())
        # Diamond Beacon: 1 beacon + 9 stacks of diamond blocks
        beacon_slots = [{"slot": 0, "typeId": "minecraft:beacon", "amount": 1}]
        for i in range(9):
            beacon_slots.append({"slot": 1 + i, "typeId": "minecraft:diamond_block", "amount": 64})
        deliver_shulker(plugin, player_name, "Cracked King Pack ($150) [Diamond Beacon Box]", beacon_slots)
        return True
        
    elif pkg == "cracked_200":
        add_coins(plugin, player_name, 1750000)
        add_tag(plugin, player_name, "tag_cracked_god")
        # 50 Custom shulkers
        for sh_idx in range(50):
            slots = make_custom_shulker(sh_idx)
            if sh_idx == 0:
                slots[0] = {"slot": 0, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§aStructure Move Voucher", "lore": ["§71 Structure Move"]}
                slots[1] = {"slot": 1, "typeId": "minecraft:paper", "amount": 1, "nameTag": "§aStructure Move Voucher", "lore": ["§71 Structure Move"]}
            deliver_shulker(plugin, player_name, f"Cracked God Pack ($200) [Box {sh_idx+1}/50]", slots)
        # 4 Cracked shulkers
        for c_idx in range(4):
            deliver_shulker(plugin, player_name, f"Cracked God Pack ($200) [Cracked Box {c_idx+1}/4]", get_cracked_shulker_items())
        # Netherite Beacon: 1 beacon + 9 stacks of netherite blocks
        beacon_slots = [{"slot": 0, "typeId": "minecraft:beacon", "amount": 1}]
        for i in range(9):
            beacon_slots.append({"slot": 1 + i, "typeId": "minecraft:netherite_block", "amount": 64})
        deliver_shulker(plugin, player_name, "Cracked God Pack ($200) [Netherite Beacon Box]", beacon_slots)
        return True
        
    else:
        plugin.logger.error(f"[ShulkerStudio] Unknown Tebex package name: '{package_name}'")
        return False
