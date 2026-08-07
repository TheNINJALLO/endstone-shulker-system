import React, { useState, useEffect } from 'react';
import './App.css';

// Interface Types
interface SlotItem {
  slot: number;
  typeId: string;
  amount: number;
  nameTag?: string;
  lore?: string[];
  enchantments?: Record<string, number>;
  keepOnDeath?: boolean;
  lockMode?: string;
  customMetadata?: string;
  potionEffectType?: string;
}

interface ItemRegistryEntry {
  type_id: string;
  display_name: string;
  source_pack: string;
  category: string;
  texture: string | null;
  is_custom: number;
  potion_effect_type?: string | null;
}

interface AddonRegistryEntry {
  pack_id: string;
  pack_type: string;
  name: string;
  version: string;
  deployed_at: string;
}

interface TemplateEntry {
  id: number;
  name: string;
  shulker_type: string;
  created_at: string;
  updated_at: string;
  contents?: SlotItem[];
}

interface DeliveryLog {
  id: number;
  player_name: string;
  template_name: string | null;
  shulker_type: string;
  slots_data: SlotItem[];
  status: string;
  error_message: string | null;
  delivery_method: string;
  scheduled_time: string | null;
  created_at: string;
  delivered_at: string | null;
}

interface AuditLog {
  id: number;
  username: string;
  action: string;
  details: string;
  timestamp: string;
}

interface OnlinePlayer {
  name: string;
  uuid: string;
  xuid: string;
  address: string;
  isOp: boolean;
}

interface UserEntry {
  username: string;
  role: string;
  created_at: string;
}

// Helper: Resolve dynamic backend endpoint
const getApiUrl = (path: string): string => {
  const host = window.location.hostname;
  const isDev = window.location.port !== '9020';
  return isDev ? `http://${host}:9020${path}` : path;
};

// Vanilla Enchantments List
const ENCHANTMENTS_LIST = [
  'protection', 'fire_protection', 'feather_falling', 'blast_protection', 'projectile_protection',
  'respiration', 'aqua_affinity', 'thorns', 'depth_strider', 'frost_walker', 'soul_speed', 'swift_sneak',
  'sharpness', 'smite', 'bane_of_arthropods', 'knockback', 'fire_aspect', 'looting', 'sweeping_edge',
  'efficiency', 'silk_touch', 'unbreaking', 'fortune', 'power', 'punch', 'flame', 'infinity',
  'luck_of_the_sea', 'lure', 'mending', 'curse_of_binding', 'curse_of_vanishing', 'multishot', 'piercing', 'quick_charge'
];

export default function App() {
  // Authentication State
  const [token, setToken] = useState<string | null>(localStorage.getItem('session_token'));
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // General App State
  const [activeTab, setActiveTab] = useState<'editor' | 'delivery' | 'templates' | 'logs' | 'users' | 'tebex'>('editor');
  const [editorSubTab, setEditorSubTab] = useState<'grid' | 'details' | 'library'>('grid');
  const [serverOnline, setServerOnline] = useState(true);
  const [itemsRegistry, setItemsRegistry] = useState<ItemRegistryEntry[]>([]);
  const [addonsRegistry, setAddonsRegistry] = useState<AddonRegistryEntry[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [logs, setLogs] = useState<{ deliveries: DeliveryLog[]; audits: AuditLog[] }>({ deliveries: [], audits: [] });
  const [usersList, setUsersList] = useState<UserEntry[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Shulker Editor State
  const [shulkerContents, setShulkerContents] = useState<(SlotItem | null)[]>(Array(27).fill(null));
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [copiedSlotItem, setCopiedSlotItem] = useState<SlotItem | null>(null);
  
  // Slot Detail Editing Form State
  const [slotType, setSlotType] = useState('minecraft:diamond');
  const [slotAmount, setSlotAmount] = useState(1);
  const [slotNameTag, setSlotNameTag] = useState('');
  const [slotLore, setSlotLore] = useState<string[]>([]);
  const [newLoreLine, setNewLoreLine] = useState('');
  const [slotEnchants, setSlotEnchants] = useState<Record<string, number>>({});
  const [selectedEnchant, setSelectedEnchant] = useState('sharpness');
  const [enchantLevel, setEnchantLevel] = useState(1);
  const [slotKeepOnDeath, setSlotKeepOnDeath] = useState(false);
  const [slotLockMode, setSlotLockMode] = useState('none');
  const [slotMetadata, setSlotMetadata] = useState('');
  const [slotPotionEffectType, setSlotPotionEffectType] = useState('');

  // Registry CRUD state
  const [editingItem, setEditingItem] = useState<ItemRegistryEntry | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [registryFormTypeId, setRegistryFormTypeId] = useState('');
  const [registryFormDisplayName, setRegistryFormDisplayName] = useState('');
  const [registryFormSourcePack, setRegistryFormSourcePack] = useState('Vanilla');
  const [registryFormCategory, setRegistryFormCategory] = useState('Vanilla Item');
  const [registryFormTexture, setRegistryFormTexture] = useState('');
  const [registryFormPotionEffect, setRegistryFormPotionEffect] = useState('');
  const [registryFormIsCustom, setRegistryFormIsCustom] = useState(0);

  // Item Browser States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [packFilter, setPackFilter] = useState('All');

  // Delivery Form State
  const [targetPlayer, setTargetPlayer] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('Give');
  const [shulkerType, setShulkerType] = useState('minecraft:purple_shulker_box');
  const [scheduledTime, setScheduledTime] = useState('');
  const [templateName, setTemplateName] = useState('');

  // User Administration State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('Admin');

  // Tebex Mockup State
  const [selectedKitId, setSelectedKitId] = useState<string>('creative_3d');
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number>(0);
  const [selectedKitCategory, setSelectedKitCategory] = useState<string>('All');

  // Fetch Wrapper with Token Auth
  // Tebex Mockup Helper Data Generators
  const getBuilderSack = (startSlot = 0) => {
    const items = [
      { id: "minecraft:scaffolding", amount: 64 },
      { id: "minecraft:scaffolding", amount: 64 },
      { id: "minecraft:scaffolding", amount: 64 },
      { id: "minecraft:crafting_table", amount: 1 },
      { id: "minecraft:anvil", amount: 1 },
      { id: "minecraft:stonecutter", amount: 1 },
      { id: "minecraft:grindstone", amount: 1 }
    ];
    return items.map((it, idx) => ({
      slot: startSlot + idx,
      typeId: it.id,
      amount: it.amount
    }));
  };

  const getGearSet = (material: string, startSlot = 0, epic = false, rare = false) => {
    const armor = [
      `minecraft:${material}_helmet`,
      `minecraft:${material}_chestplate`,
      `minecraft:${material}_leggings`,
      `minecraft:${material}_boots`
    ];
    const tools = [
      `minecraft:${material}_sword`,
      `minecraft:${material}_pickaxe`,
      `minecraft:${material}_axe`,
      `minecraft:${material}_shovel`
    ];
    
    const slots: any[] = [];
    let currentSlot = startSlot;
    
    const allItems = [...armor, ...tools];
    for (const itemId of allItems) {
      const enchantments: Record<string, number> = { mending: 1 };
      
      if (epic) {
        enchantments.unbreaking = 3;
        if (itemId.includes("helmet")) {
          enchantments.protection = 4;
          enchantments.respiration = 3;
        } else if (itemId.includes("chestplate") || itemId.includes("leggings") || itemId.includes("boots")) {
          enchantments.protection = 4;
        } else if (itemId.includes("sword")) {
          enchantments.sharpness = 5;
          enchantments.looting = 3;
        } else if (itemId.includes("pickaxe") || itemId.includes("axe") || itemId.includes("shovel")) {
          enchantments.efficiency = 5;
        }
      } else if (rare) {
        enchantments.unbreaking = 2;
        if (itemId.includes("helmet") || itemId.includes("chestplate") || itemId.includes("leggings") || itemId.includes("boots")) {
          enchantments.protection = 3;
        } else if (itemId.includes("sword")) {
          enchantments.sharpness = 4;
        } else if (itemId.includes("pickaxe") || itemId.includes("axe") || itemId.includes("shovel")) {
          enchantments.efficiency = 4;
        }
      }
      
      slots.push({
        slot: currentSlot,
        typeId: itemId,
        amount: 1,
        enchantments
      });
      currentSlot++;
    }
    
    return slots;
  };

  const getEnchantBooks = (rarity: string, startSlot = 0) => {
    let books: { ench: string; lvl: number }[] = [];
    if (rarity === "common") {
      books = [
        { ench: "protection", lvl: 2 }, { ench: "sharpness", lvl: 2 }, { ench: "efficiency", lvl: 2 }, { ench: "unbreaking", lvl: 2 },
        { ench: "fire_protection", lvl: 2 }, { ench: "feather_falling", lvl: 2 }, { ench: "looting", lvl: 1 }, { ench: "fortune", lvl: 1 }
      ];
    } else if (rarity === "rare") {
      books = [
        { ench: "protection", lvl: 4 }, { ench: "sharpness", lvl: 4 }, { ench: "efficiency", lvl: 4 }, { ench: "unbreaking", lvl: 3 },
        { ench: "feather_falling", lvl: 4 }, { ench: "looting", lvl: 2 }, { ench: "fortune", lvl: 2 }, { ench: "mending", lvl: 1 }
      ];
    } else {
      books = [
        { ench: "protection", lvl: 4 }, { ench: "sharpness", lvl: 5 }, { ench: "efficiency", lvl: 5 }, { ench: "unbreaking", lvl: 3 },
        { ench: "feather_falling", lvl: 4 }, { ench: "looting", lvl: 3 }, { ench: "fortune", lvl: 3 }, { ench: "mending", lvl: 1 }, { ench: "silk_touch", lvl: 1 }
      ];
    }
    
    return books.map((b, idx) => ({
      slot: startSlot + idx,
      typeId: "minecraft:enchanted_book",
      amount: 1,
      enchantments: { [b.ench]: b.lvl },
      nameTag: `Enchanted Book: ${b.ench.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} ${b.lvl}`
    }));
  };

  const getCrackedShulkerItems = () => {
    const slots: any[] = [];
    for (let i = 0; i < 9; i++) {
      slots.push({ slot: i, typeId: "minecraft:enchanted_golden_apple", amount: 64 });
    }
    for (let i = 0; i < 7; i++) {
      slots.push({ slot: 9 + i, typeId: "minecraft:golden_carrot", amount: 64 });
    }
    for (let i = 0; i < 5; i++) {
      slots.push({ slot: 16 + i, typeId: "minecraft:firework_rocket", amount: 64 });
    }
    slots.push({
      slot: 21,
      typeId: "minecraft:elytra",
      amount: 1,
      enchantments: { unbreaking: 3, mending: 1 },
      nameTag: "§6Cracked Elytra"
    });
    const trims = [
      "minecraft:silence_armor_trim_template",
      "minecraft:spire_armor_trim_template",
      "minecraft:rib_armor_trim_template",
      "minecraft:snout_armor_trim_template",
      "minecraft:ward_armor_trim_template"
    ];
    for (let i = 0; i < trims.length; i++) {
      slots.push({ slot: 22 + i, typeId: trims[i], amount: 1 });
    }
    return slots;
  };

  const makeCustomShulker = (index: number) => {
    const slots: any[] = [];
    const itemsPool = [
      { typeId: "minecraft:diamond", amount: 64 },
      { typeId: "minecraft:netherite_ingot", amount: 16 },
      { typeId: "minecraft:emerald", amount: 64 },
      { typeId: "minecraft:experience_bottle", amount: 64 },
      { typeId: "minecraft:golden_apple", amount: 32 },
      { typeId: "minecraft:obsidian", amount: 64 },
      { typeId: "minecraft:shulker_shell", amount: 4 },
      { typeId: "minecraft:totem_of_undying", amount: 1 }
    ];
    const enchants = [
      { protection: 4 },
      { sharpness: 5 },
      { efficiency: 5 },
      { unbreaking: 3 },
      { mending: 1 }
    ];
    
    for (let slotIdx = 0; slotIdx < 12; slotIdx++) {
      const item = itemsPool[(slotIdx + index) % itemsPool.length];
      slots.push({ slot: slotIdx, typeId: item.typeId, amount: item.amount });
    }
    
    for (let ebIdx = 0; ebIdx < 4; ebIdx++) {
      const ench = enchants[(ebIdx + index) % enchants.length];
      slots.push({
        slot: 12 + ebIdx,
        typeId: "minecraft:enchanted_book",
        amount: 1,
        enchantments: ench,
        nameTag: `§dEnchanted Book (Type ${ebIdx + index + 1})`
      });
    }
    
    const blocks = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:smooth_stone"];
    for (let bIdx = 0; bIdx < 11; bIdx++) {
      slots.push({
        slot: 16 + bIdx,
        typeId: blocks[(bIdx + index) % blocks.length],
        amount: 64
      });
    }
    
    return slots;
  };

  const getTebexKits = (): any[] => {
    return [
      {
        id: "rope_level1",
        name: "Level 1 TP Rope (1 Month)",
        price: "$15.00",
        category: "TP Ropes",
        description: "Provides basic warp saving with 3 locations saves.",
        warpCode: { tag: "WARP1", name: "Level 1 TP Rope", duration: 30 }
      },
      {
        id: "rope_level1_year",
        name: "Level 1 TP Rope (1 Year)",
        price: "$100.00",
        category: "TP Ropes",
        description: "Provides basic warp saving with 3 locations saves for a full year.",
        warpCode: { tag: "WARP1", name: "Level 1 TP Rope", duration: 365 }
      },
      {
        id: "rope_level2",
        name: "Level 2 TP Rope (1 Month)",
        price: "$20.00",
        category: "TP Ropes",
        description: "Provides premium warp saving with 5 locations saves.",
        warpCode: { tag: "WARP2", name: "Level 2 TP Rope", duration: 30 }
      },
      {
        id: "rope_level2_year",
        name: "Level 2 TP Rope (1 Year)",
        price: "$150.00",
        category: "TP Ropes",
        description: "Provides premium warp saving with 5 locations saves for a full year.",
        warpCode: { tag: "WARP2", name: "Level 2 TP Rope", duration: 365 }
      },
      {
        id: "trims_9",
        name: "Armor Trims (9)",
        price: "$5.00",
        category: "Armor Trims",
        description: "A selection of 9 rare armor trim templates.",
        boxes: [{
          name: "Trims Box",
          slots: [
            "minecraft:silence_armor_trim_template", "minecraft:spire_armor_trim_template",
            "minecraft:rib_armor_trim_template", "minecraft:snout_armor_trim_template",
            "minecraft:ward_armor_trim_template", "minecraft:eye_armor_trim_template",
            "minecraft:vex_armor_trim_template", "minecraft:tide_armor_trim_template",
            "minecraft:wild_armor_trim_template"
          ].map((t, idx) => ({ slot: idx, typeId: t, amount: 1 }))
        }]
      },
      {
        id: "trims_18",
        name: "Armor Trims (18)",
        price: "$10.00",
        category: "Armor Trims",
        description: "Double the quantity of trims templates (2 of each of the 9 templates).",
        boxes: [{
          name: "Trims Box x18",
          slots: Array(9).fill(null).flatMap((_, i) => {
            const trims = [
              "minecraft:silence_armor_trim_template", "minecraft:spire_armor_trim_template",
              "minecraft:rib_armor_trim_template", "minecraft:snout_armor_trim_template",
              "minecraft:ward_armor_trim_template", "minecraft:eye_armor_trim_template",
              "minecraft:vex_armor_trim_template", "minecraft:tide_armor_trim_template",
              "minecraft:wild_armor_trim_template"
            ];
            return [
              { slot: i * 2, typeId: trims[i], amount: 1 },
              { slot: (i * 2) + 1, typeId: trims[i], amount: 1 }
            ];
          })
        }]
      },
      {
        id: "structure_move",
        name: "Structure Move",
        price: "$10.00",
        category: "Structure Move",
        description: "1 voucher for an admin structure relocation up to 100x100.",
        boxes: [{
          name: "Voucher Box",
          slots: [{
            slot: 0,
            typeId: "minecraft:paper",
            amount: 1,
            nameTag: "§aStructure Move Voucher",
            lore: ["§7Bring this voucher to an admin", "§7to perform 1 Structure Move.", "§7Fits within 100x100 grid."]
          }]
        }]
      },
      {
        id: "vault_15k",
        name: "The Vault (15k Coins)",
        price: "$5.00",
        category: "The Vault",
        description: "Adds 15,000 to player Money scoreboard.",
        coins: 15000
      },
      {
        id: "vault_50k",
        name: "The Vault (50k Coins)",
        price: "$10.00",
        category: "The Vault",
        description: "Adds 50,000 to player Money scoreboard.",
        coins: 50000
      },
      {
        id: "vault_200k",
        name: "The Vault (200k Coins)",
        price: "$15.00",
        category: "The Vault",
        description: "Adds 200,000 to player Money scoreboard.",
        coins: 200000
      },
      {
        id: "vault_500k",
        name: "The Vault (500k Coins)",
        price: "$25.00",
        category: "The Vault",
        description: "Adds 500,000 to player Money scoreboard.",
        coins: 500000
      },
      {
        id: "vault_125m",
        name: "The Vault (1.25M Coins)",
        price: "$50.00",
        category: "The Vault",
        description: "Adds 1,250,000 to player Money scoreboard.",
        coins: 1250000
      },
      {
        id: "vault_3m",
        name: "The Vault (3M Coins)",
        price: "$100.00",
        category: "The Vault",
        description: "Adds 3,000,000 to player Money scoreboard.",
        coins: 3000000
      },
      {
        id: "creative_3d",
        name: "Creative Area Pack (3 Days)",
        price: "$15.00",
        category: "Creative Packs",
        description: "Provides 3 days of creative Build Mode warp access and 1 structure move.",
        warpCode: { tag: "build", name: "Build Mode", duration: 3 },
        boxes: [{
          name: "Voucher Shulker",
          slots: [{
            slot: 0,
            typeId: "minecraft:paper",
            amount: 1,
            nameTag: "§aStructure Move Voucher",
            lore: ["§7Bring this voucher to an admin to perform 1 Structure Move."]
          }]
        }]
      },
      {
        id: "creative_7d",
        name: "Creative Area Pack (7 Days)",
        price: "$25.00",
        category: "Creative Packs",
        description: "Provides 7 days of creative Build Mode warp access and 1 structure move.",
        warpCode: { tag: "build", name: "Build Mode", duration: 7 },
        boxes: [{
          name: "Voucher Shulker",
          slots: [{
            slot: 0,
            typeId: "minecraft:paper",
            amount: 1,
            nameTag: "§aStructure Move Voucher",
            lore: ["§7Bring this voucher to an admin to perform 1 Structure Move."]
          }]
        }]
      },
      {
        id: "creative_15d",
        name: "Creative Area Pack (15 Days)",
        price: "$50.00",
        category: "Creative Packs",
        description: "Provides 15 days of creative Build Mode warp access and 2 structure moves.",
        warpCode: { tag: "build", name: "Build Mode", duration: 15 },
        boxes: [{
          name: "Voucher Shulker",
          slots: [
            { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§aStructure Move Voucher", lore: ["§7Structure Move 1"] },
            { slot: 1, typeId: "minecraft:paper", amount: 1, nameTag: "§aStructure Move Voucher", lore: ["§7Structure Move 2"] }
          ]
        }]
      },
      {
        id: "creative_30d",
        name: "Creative Area Pack (30 Days)",
        price: "$80.00",
        category: "Creative Packs",
        description: "Provides 30 days of creative Build Mode warp access and 4 structure moves.",
        warpCode: { tag: "build", name: "Build Mode", duration: 30 },
        boxes: [{
          name: "Voucher Shulker",
          slots: Array(4).fill(null).map((_, i) => ({
            slot: i,
            typeId: "minecraft:paper",
            amount: 1,
            nameTag: "§aStructure Move Voucher",
            lore: [`§7Structure Move ${i + 1}`]
          }))
        }]
      },
      {
        id: "ore_bag_ingots_4",
        name: "Ore Bag (Ingots x4)",
        price: "$5.00",
        category: "Valuables & Ores",
        description: "1 Shulker containing 4 stacks of ingots (Netherite, Diamond, Gold, Iron).",
        boxes: [{
          name: "Ore Bag Shulker",
          slots: [
            { slot: 0, typeId: "minecraft:diamond", amount: 64 },
            { slot: 1, typeId: "minecraft:netherite_ingot", amount: 64 },
            { slot: 2, typeId: "minecraft:gold_ingot", amount: 64 },
            { slot: 3, typeId: "minecraft:iron_ingot", amount: 64 }
          ]
        }]
      },
      {
        id: "ore_bag_ingots_9",
        name: "Ore Bag (Ingots x9)",
        price: "$10.00",
        category: "Valuables & Ores",
        description: "1 Shulker containing 9 stacks of ingots (Diamond, Netherite, Gold, Iron, Copper).",
        boxes: [{
          name: "Ore Bag Shulker",
          slots: Array(9).fill(null).map((_, i) => {
            const ores = ["minecraft:diamond", "minecraft:netherite_ingot", "minecraft:gold_ingot", "minecraft:iron_ingot", "minecraft:copper_ingot"];
            return { slot: i, typeId: ores[i % ores.length], amount: 64 };
          })
        }]
      },
      {
        id: "ore_bag_ingots_18",
        name: "Ore Bag (Ingots x18)",
        price: "$15.00",
        category: "Valuables & Ores",
        description: "1 Shulker containing 18 stacks of ingots.",
        boxes: [{
          name: "Ore Bag Shulker",
          slots: Array(18).fill(null).map((_, i) => {
            const ores = ["minecraft:diamond", "minecraft:netherite_ingot", "minecraft:gold_ingot", "minecraft:iron_ingot", "minecraft:copper_ingot"];
            return { slot: i, typeId: ores[i % ores.length], amount: 64 };
          })
        }]
      },
      {
        id: "ore_bag_blocks_10",
        name: "Ore Bag (Blocks x10)",
        price: "$25.00",
        category: "Valuables & Ores",
        description: "1 Shulker containing 10 stacks of valuable blocks (Diamond, Netherite, Gold, Iron, Emerald).",
        boxes: [{
          name: "Ore Bag Shulker",
          slots: Array(10).fill(null).map((_, i) => {
            const blocks = ["minecraft:diamond_block", "minecraft:netherite_block", "minecraft:gold_block", "minecraft:iron_block", "minecraft:emerald_block"];
            return { slot: i, typeId: blocks[i % blocks.length], amount: 64 };
          })
        }]
      },
      {
        id: "ore_bag_blocks_27",
        name: "Ore Bag (Blocks x27)",
        price: "$50.00",
        category: "Valuables & Ores",
        description: "1 Shulker completely filled with 27 stacks of valuable blocks.",
        boxes: [{
          name: "Ore Bag Shulker",
          slots: Array(27).fill(null).map((_, i) => {
            const blocks = ["minecraft:diamond_block", "minecraft:netherite_block", "minecraft:gold_block", "minecraft:iron_block", "minecraft:emerald_block"];
            return { slot: i, typeId: blocks[i % blocks.length], amount: 64 };
          })
        }]
      },
      {
        id: "armory_5",
        name: "The Armory ($5)",
        price: "$5.00",
        category: "Combat & Gear",
        description: "Diamond Armor & Tool Set (Mending 1 only) + 5,000 Coins.",
        coins: 5000,
        boxes: [{
          name: "Gear Box",
          slots: getGearSet("diamond", 0, false, false)
        }]
      },
      {
        id: "armory_10",
        name: "The Armory ($10)",
        price: "$10.00",
        category: "Combat & Gear",
        description: "Diamond Armor & Tool Set (Mending 1) + Common Enchant Books + 25,000 Coins.",
        coins: 25000,
        boxes: [{
          name: "Gear & Books Box",
          slots: [...getGearSet("diamond", 0, false, false), ...getEnchantBooks("common", 8)]
        }]
      },
      {
        id: "armory_15",
        name: "The Armory ($15)",
        price: "$15.00",
        category: "Combat & Gear",
        description: "Diamond Armor & Tool Set (Mending 1, Protection 3 / Sharpness 4) + Rare Books + 100,000 Coins.",
        coins: 100000,
        boxes: [{
          name: "Gear & Books Box",
          slots: [...getGearSet("diamond", 0, false, true), ...getEnchantBooks("rare", 8)]
        }]
      },
      {
        id: "armory_20",
        name: "The Armory ($20)",
        price: "$20.00",
        category: "Combat & Gear",
        description: "Diamond Armor & Tool Set (Mending 1, Protection 4 / Sharpness 5) + Epic Books + 150,000 Coins.",
        coins: 150000,
        boxes: [{
          name: "Gear & Books Box",
          slots: [...getGearSet("diamond", 0, true, false), ...getEnchantBooks("epic", 8)]
        }]
      },
      {
        id: "armory_25",
        name: "The Armory ($25)",
        price: "$25.00",
        category: "Combat & Gear",
        description: "Netherite Armor & Tool Set (Mending 1, Protection 3 / Sharpness 4) + Rare Books + 200,000 Coins.",
        coins: 200000,
        boxes: [{
          name: "Gear & Books Box",
          slots: [...getGearSet("netherite", 0, false, true), ...getEnchantBooks("rare", 8)]
        }]
      },
      {
        id: "armory_50",
        name: "The Armory ($50)",
        price: "$50.00",
        category: "Combat & Gear",
        description: "Netherite Armor & Tool Set (Mending 1, Protection 4 / Sharpness 5) + Epic Books + 350,000 Coins.",
        coins: 350000,
        boxes: [{
          name: "Gear & Books Box",
          slots: [...getGearSet("netherite", 0, true, false), ...getEnchantBooks("epic", 8)]
        }]
      },
      {
        id: "contractor_5",
        name: "Contractors Box ($5)",
        price: "$5.00",
        category: "Construction Kits",
        description: "9 stacks building blocks + Builder Sack + 5,000 Coins.",
        coins: 5000,
        boxes: [{
          name: "Blocks & Sack Box",
          slots: [
            ...Array(9).fill(null).map((_, i) => {
              const b = ["minecraft:oak_log", "minecraft:cobblestone", "minecraft:smooth_stone"];
              return { slot: i, typeId: b[i % b.length], amount: 64 };
            }),
            ...getBuilderSack(9)
          ]
        }]
      },
      {
        id: "contractor_10",
        name: "Contractors Box ($10)",
        price: "$10.00",
        category: "Construction Kits",
        description: "20 stacks building blocks + Builder Sack + 25,000 Coins.",
        coins: 25000,
        boxes: [{
          name: "Blocks & Sack Box",
          slots: [
            ...Array(20).fill(null).map((_, i) => {
              const b = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:brick_block"];
              return { slot: i, typeId: b[i % b.length], amount: 64 };
            }),
            ...getBuilderSack(20)
          ]
        }]
      },
      {
        id: "contractor_15",
        name: "Contractors Box ($15)",
        price: "$15.00",
        category: "Construction Kits",
        description: "5 Shulkers building blocks + Builder Sack + 100,000 Coins.",
        coins: 100000,
        boxes: [
          ...Array(4).fill(null).map((_, shIdx) => ({
            name: `Box ${shIdx + 1}/5 (Blocks)`,
            slots: Array(27).fill(null).map((_, i) => {
              const b = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:brick_block", "minecraft:deepslate"];
              return { slot: i, typeId: b[(i + shIdx) % b.length], amount: 64 };
            })
          })),
          {
            name: "Box 5/5 (Sack & Blocks)",
            slots: [
              ...Array(20).fill(null).map((_, i) => {
                const b = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:brick_block", "minecraft:deepslate"];
                return { slot: i, typeId: b[i % b.length], amount: 64 };
              }),
              ...getBuilderSack(20)
            ]
          }
        ]
      },
      {
        id: "contractor_25",
        name: "Contractors Box ($25)",
        price: "$25.00",
        category: "Construction Kits",
        description: "12 Shulkers building blocks + Builder Sack + 200,000 Coins.",
        coins: 200000,
        boxes: [
          ...Array(11).fill(null).map((_, shIdx) => ({
            name: `Box ${shIdx + 1}/12 (Blocks)`,
            slots: Array(27).fill(null).map((_, i) => {
              const b = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:brick_block", "minecraft:concrete"];
              return { slot: i, typeId: b[(i + shIdx) % b.length], amount: 64 };
            })
          })),
          {
            name: "Box 12/12 (Sack & Blocks)",
            slots: [
              ...Array(20).fill(null).map((_, i) => {
                const b = ["minecraft:stone", "minecraft:oak_planks", "minecraft:glass", "minecraft:brick_block", "minecraft:concrete"];
                return { slot: i, typeId: b[i % b.length], amount: 64 };
              }),
              ...getBuilderSack(20)
            ]
          }
        ]
      },
      {
        id: "shop_5",
        name: "Shop Restock ($5)",
        price: "$5.00",
        category: "Shop restocks",
        description: "1 Shulker Restock Voucher + common stock items.",
        boxes: [{
          name: "Shop Box 1/1",
          slots: [
            { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§dShop Restock Voucher", lore: ["§7Give this voucher to an admin", "§7to claim shop stock package details.", "§7Shulker Box 1/1"] },
            ...Array(26).fill(null).map((_, i) => {
              const items = ["minecraft:emerald", "minecraft:diamond", "minecraft:experience_bottle", "minecraft:golden_carrot", "minecraft:obsidian"];
              return { slot: i + 1, typeId: items[i % items.length], amount: 64 };
            })
          ]
        }]
      },
      {
        id: "shop_10",
        name: "Shop Restock ($10)",
        price: "$10.00",
        category: "Shop restocks",
        description: "3 Shulkers Restock Vouchers + common stock items.",
        boxes: Array(3).fill(null).map((_, idx) => ({
          name: `Shop Box ${idx + 1}/3`,
          slots: [
            { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§dShop Restock Voucher", lore: ["§7Give this voucher to an admin", "§7to claim shop stock package details.", `§7Shulker Box ${idx + 1}/3`] },
            ...Array(26).fill(null).map((_, i) => {
              const items = ["minecraft:emerald", "minecraft:diamond", "minecraft:experience_bottle", "minecraft:golden_carrot", "minecraft:obsidian"];
              return { slot: i + 1, typeId: items[(i + idx) % items.length], amount: 64 };
            })
          ]
        }))
      },
      {
        id: "shop_15",
        name: "Shop Restock ($15)",
        price: "$15.00",
        category: "Shop restocks",
        description: "4 Shulkers Restock Vouchers + common stock items.",
        boxes: Array(4).fill(null).map((_, idx) => ({
          name: `Shop Box ${idx + 1}/4`,
          slots: [
            { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§dShop Restock Voucher", lore: ["§7Give this voucher to an admin", "§7to claim shop stock package details.", `§7Shulker Box ${idx + 1}/4`] },
            ...Array(26).fill(null).map((_, i) => {
              const items = ["minecraft:emerald", "minecraft:diamond", "minecraft:experience_bottle", "minecraft:golden_carrot", "minecraft:obsidian"];
              return { slot: i + 1, typeId: items[(i + idx) % items.length], amount: 64 };
            })
          ]
        }))
      },
      {
        id: "shop_20",
        name: "Shop Restock ($20)",
        price: "$20.00",
        category: "Shop restocks",
        description: "7 Shulkers Restock Vouchers + common stock items.",
        boxes: Array(7).fill(null).map((_, idx) => ({
          name: `Shop Box ${idx + 1}/7`,
          slots: [
            { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§dShop Restock Voucher", lore: ["§7Give this voucher to an admin", "§7to claim shop stock package details.", `§7Shulker Box ${idx + 1}/7`] },
            ...Array(26).fill(null).map((_, i) => {
              const items = ["minecraft:emerald", "minecraft:diamond", "minecraft:experience_bottle", "minecraft:golden_carrot", "minecraft:obsidian"];
              return { slot: i + 1, typeId: items[(i + idx) % items.length], amount: 64 };
            })
          ]
        }))
      },
      {
        id: "shop_25",
        name: "Shop Restock ($25)",
        price: "$25.00",
        category: "Shop restocks",
        description: "9 Shulkers Restock Vouchers + common stock items.",
        boxes: Array(9).fill(null).map((_, idx) => ({
          name: `Shop Box ${idx + 1}/9`,
          slots: [
            { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§dShop Restock Voucher", lore: ["§7Give this voucher to an admin", "§7to claim shop stock package details.", `§7Shulker Box ${idx + 1}/9`] },
            ...Array(26).fill(null).map((_, i) => {
              const items = ["minecraft:emerald", "minecraft:diamond", "minecraft:experience_bottle", "minecraft:golden_carrot", "minecraft:obsidian"];
              return { slot: i + 1, typeId: items[(i + idx) % items.length], amount: 64 };
            })
          ]
        }))
      },
      {
        id: "shop_50",
        name: "Shop Restock ($50)",
        price: "$50.00",
        category: "Shop restocks",
        description: "20 Shulkers Restock Vouchers + common stock items.",
        boxes: Array(20).fill(null).map((_, idx) => ({
          name: `Shop Box ${idx + 1}/20`,
          slots: [
            { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§dShop Restock Voucher", lore: ["§7Give this voucher to an admin", "§7to claim shop stock package details.", `§7Shulker Box ${idx + 1}/20`] },
            ...Array(26).fill(null).map((_, i) => {
              const items = ["minecraft:emerald", "minecraft:diamond", "minecraft:experience_bottle", "minecraft:golden_carrot", "minecraft:obsidian"];
              return { slot: i + 1, typeId: items[(i + idx) % items.length], amount: 64 };
            })
          ]
        }))
      },
      {
        id: "cracked_50",
        name: "Cracked Pack Nation ($50)",
        price: "$50.00",
        category: "Cracked Nation",
        description: "15 Custom Shulkers + 2 Pet Vouchers + 100,000 Coins + tag_cracked.",
        coins: 100000,
        tags: ["tag_cracked"],
        boxes: Array(15).fill(null).map((_, idx) => {
          const slots = makeCustomShulker(idx);
          if (idx === 0) {
            slots[0] = { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§6Pet Voucher", lore: ["§7Redeem this voucher with an admin for a free custom pet."] };
            slots[1] = { slot: 1, typeId: "minecraft:paper", amount: 1, nameTag: "§6Pet Voucher", lore: ["§7Redeem this voucher with an admin for a free custom pet."] };
          }
          return { name: `Custom Box ${idx + 1}/15`, slots };
        })
      },
      {
        id: "cracked_100",
        name: "Cracked Pack Nation ($100)",
        price: "$100.00",
        category: "Cracked Nation",
        description: "15 Custom Shulkers + 1 Cracked Shulker + 2 Pet Vouchers + 2 Structure Moves + 800,000 Coins + tag_super_cracked.",
        coins: 800000,
        tags: ["tag_super_cracked"],
        boxes: [
          ...Array(15).fill(null).map((_, idx) => {
            const slots = makeCustomShulker(idx);
            if (idx === 0) {
              slots[0] = { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§6Pet Voucher", lore: ["§7Free custom pet."] };
              slots[1] = { slot: 1, typeId: "minecraft:paper", amount: 1, nameTag: "§6Pet Voucher", lore: ["§7Free custom pet."] };
              slots[2] = { slot: 2, typeId: "minecraft:paper", amount: 1, nameTag: "§aStructure Move Voucher", lore: ["§71 Structure Move"] };
              slots[3] = { slot: 3, typeId: "minecraft:paper", amount: 1, nameTag: "§aStructure Move Voucher", lore: ["§71 Structure Move"] };
            }
            return { name: `Custom Box ${idx + 1}/15`, slots };
          }),
          {
            name: "Cracked Shulker Box",
            slots: getCrackedShulkerItems()
          }
        ]
      },
      {
        id: "cracked_150",
        name: "Cracked King Pack ($150)",
        price: "$150.00",
        category: "Cracked Nation",
        description: "35 Custom Shulkers + 2 Cracked Shulkers + 2 Pet Vouchers + 2 Structure Moves + Diamond Beacon Box + 1.25M Coins + tag_cracked_king.",
        coins: 1250000,
        tags: ["tag_cracked_king"],
        boxes: [
          ...Array(35).fill(null).map((_, idx) => {
            const slots = makeCustomShulker(idx);
            if (idx === 0) {
              slots[0] = { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§6Pet Voucher", lore: ["§7Free custom pet."] };
              slots[1] = { slot: 1, typeId: "minecraft:paper", amount: 1, nameTag: "§6Pet Voucher", lore: ["§7Free custom pet."] };
              slots[2] = { slot: 2, typeId: "minecraft:paper", amount: 1, nameTag: "§aStructure Move Voucher", lore: ["§71 Structure Move"] };
              slots[3] = { slot: 3, typeId: "minecraft:paper", amount: 1, nameTag: "§aStructure Move Voucher", lore: ["§71 Structure Move"] };
            }
            return { name: `Custom Box ${idx + 1}/35`, slots };
          }),
          {
            name: "Cracked Shulker Box 1/2",
            slots: getCrackedShulkerItems()
          },
          {
            name: "Cracked Shulker Box 2/2",
            slots: getCrackedShulkerItems()
          },
          {
            name: "Diamond Beacon Box",
            slots: [
              { slot: 0, typeId: "minecraft:beacon", amount: 1 },
              ...Array(9).fill(null).map((_, i) => ({ slot: 1 + i, typeId: "minecraft:diamond_block", amount: 64 }))
            ]
          }
        ]
      },
      {
        id: "cracked_200",
        name: "Cracked God Pack ($200)",
        price: "$200.00",
        category: "Cracked Nation",
        description: "50 Custom Shulkers + 4 Cracked Shulkers + 2 Structure Moves + Netherite Beacon Box + 1.75M Coins + tag_cracked_god.",
        coins: 1750000,
        tags: ["tag_cracked_god"],
        boxes: [
          ...Array(50).fill(null).map((_, idx) => {
            const slots = makeCustomShulker(idx);
            if (idx === 0) {
              slots[0] = { slot: 0, typeId: "minecraft:paper", amount: 1, nameTag: "§aStructure Move Voucher", lore: ["§71 Structure Move"] };
              slots[1] = { slot: 1, typeId: "minecraft:paper", amount: 1, nameTag: "§aStructure Move Voucher", lore: ["§71 Structure Move"] };
            }
            return { name: `Custom Box ${idx + 1}/50`, slots };
          }),
          ...Array(4).fill(null).map((_, i) => ({
            name: `Cracked Box ${i + 1}/4`,
            slots: getCrackedShulkerItems()
          })),
          {
            name: "Netherite Beacon Box",
            slots: [
              { slot: 0, typeId: "minecraft:beacon", amount: 1 },
              ...Array(9).fill(null).map((_, i) => ({ slot: 1 + i, typeId: "minecraft:netherite_block", amount: 64 }))
            ]
          }
        ]
      }
    ];
  };

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    
    const response = await fetch(getApiUrl(path), {
      ...options,
      headers
    });

    if (response.status === 401) {
      handleLogoutLocal();
      throw new Error('Session expired. Please log in.');
    }

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = 'API Request Failed';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.detail || errMsg;
      } catch {
        errMsg = errText || errMsg;
      }
      throw new Error(errMsg);
    }

    return response.json();
  };

  // Auth Operations
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      if (data.token) {
        localStorage.setItem('session_token', data.token);
        setToken(data.token);
        setUser({ username: data.username, role: data.role });
        showNotification('success', `Welcome back, ${data.username}!`);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Login failed.');
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    handleLogoutLocal();
  };

  const handleLogoutLocal = () => {
    localStorage.removeItem('session_token');
    setToken(null);
    setUser(null);
    showNotification('error', 'Logged out.');
  };

  const checkCurrentUser = async () => {
    if (!token) return;
    try {
      const data = await apiFetch('/api/auth/me');
      setUser(data);
    } catch {
      handleLogoutLocal();
    }
  };

  // Notification Helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Data Loading
  const loadRegistry = async () => {
    try {
      const data = await apiFetch('/api/scanner/registry');
      setItemsRegistry(data.items || []);
      setAddonsRegistry(data.addons || []);
    } catch (err: any) {
      console.error('Failed to load item/addon registries:', err);
    }
  };

  const loadOnlinePlayers = async () => {
    try {
      const data = await apiFetch('/api/players');
      setOnlinePlayers(data || []);
      setServerOnline(true);
    } catch (err) {
      console.error('Failed to fetch online players:', err);
      setServerOnline(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await apiFetch('/api/templates');
      setTemplates(data || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await apiFetch('/api/logs');
      setLogs(data || { deliveries: [], audits: [] });
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  };

  const loadUsersList = async () => {
    if (user?.role !== 'Owner') return;
    try {
      const data = await apiFetch('/api/users');
      setUsersList(data || []);
    } catch (err) {
      console.error('Failed to load users list:', err);
    }
  };

  // Reload data periodically or on tab switch
  useEffect(() => {
    if (token) {
      checkCurrentUser();
      loadRegistry();
      loadOnlinePlayers();
      loadTemplates();
      loadLogs();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      if (activeTab === 'logs') loadLogs();
      if (activeTab === 'templates') loadTemplates();
      if (activeTab === 'users') loadUsersList();
      if (activeTab === 'delivery') loadOnlinePlayers();
    }
  }, [activeTab]);

  // Synchronize slot editor state when selected slot changes
  useEffect(() => {
    if (selectedSlot !== null) {
      const item = shulkerContents[selectedSlot];
      if (item) {
        setSlotType(item.typeId);
        setSlotAmount(item.amount);
        setSlotNameTag(item.nameTag || '');
        setSlotLore(item.lore || []);
        setSlotEnchants(item.enchantments || {});
        setSlotKeepOnDeath(item.keepOnDeath || false);
        setSlotLockMode(item.lockMode || 'none');
        setSlotMetadata(item.customMetadata || '');
        setSlotPotionEffectType(item.potionEffectType || '');
      } else {
        // Clear slot editor fields or reset to standard vanilla item
        setSlotType('minecraft:diamond');
        setSlotAmount(1);
        setSlotNameTag('');
        setSlotLore([]);
        setSlotEnchants({});
        setSlotKeepOnDeath(false);
        setSlotLockMode('none');
        setSlotMetadata('');
        setSlotPotionEffectType('');
      }
    }
  }, [selectedSlot]);

  // Registry Item CRUD Functions
  const handleEditRegistryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await apiFetch(`/api/scanner/registry/${encodeURIComponent(editingItem.type_id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          displayName: registryFormDisplayName,
          category: registryFormCategory,
          texture: registryFormTexture.trim() || null,
          potionEffectType: registryFormPotionEffect.trim() || null
        })
      });
      showNotification('success', `Updated registry item: ${editingItem.type_id}`);
      setEditingItem(null);
      loadRegistry();
    } catch (err: any) {
      showNotification('error', `Failed to edit item: ${err.message || err}`);
    }
  };

  const handleAddRegistryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/scanner/registry', {
        method: 'POST',
        body: JSON.stringify({
          typeId: registryFormTypeId.trim(),
          displayName: registryFormDisplayName,
          sourcePack: registryFormSourcePack.trim() || 'Vanilla',
          category: registryFormCategory,
          texture: registryFormTexture.trim() || null,
          isCustom: registryFormIsCustom,
          potionEffectType: registryFormPotionEffect.trim() || null
        })
      });
      showNotification('success', `Added new registry item: ${registryFormTypeId}`);
      setIsAddingItem(false);
      // Reset fields
      setRegistryFormTypeId('');
      setRegistryFormDisplayName('');
      setRegistryFormSourcePack('Vanilla');
      setRegistryFormCategory('Vanilla Item');
      setRegistryFormTexture('');
      setRegistryFormPotionEffect('');
      setRegistryFormIsCustom(0);
      loadRegistry();
    } catch (err: any) {
      showNotification('error', `Failed to add item: ${err.message || err}`);
    }
  };

  const handleDeleteRegistryItem = async (typeId: string) => {
    if (!window.confirm(`Are you sure you want to delete ${typeId} from the registry?`)) return;
    try {
      await apiFetch(`/api/scanner/registry/${encodeURIComponent(typeId)}`, {
        method: 'DELETE'
      });
      showNotification('success', `Deleted registry item: ${typeId}`);
      loadRegistry();
    } catch (err: any) {
      showNotification('error', `Failed to delete item: ${err.message || err}`);
    }
  };

  // Apply slot modifications to state
  const saveSlotItem = () => {
    if (selectedSlot === null) return;
    
    const updated: SlotItem = {
      slot: selectedSlot,
      typeId: slotType,
      amount: slotAmount,
      nameTag: slotNameTag.trim() || undefined,
      lore: slotLore.length > 0 ? slotLore : undefined,
      enchantments: Object.keys(slotEnchants).length > 0 ? slotEnchants : undefined,
      keepOnDeath: slotKeepOnDeath || undefined,
      lockMode: slotLockMode !== 'none' ? slotLockMode : undefined,
      customMetadata: slotMetadata.trim() || undefined,
      potionEffectType: slotPotionEffectType.trim() || undefined
    };

    const nextContents = [...shulkerContents];
    nextContents[selectedSlot] = updated;
    setShulkerContents(nextContents);
    showNotification('success', `Saved slot ${selectedSlot} configuration.`);
  };

  const clearSlotItem = () => {
    if (selectedSlot === null) return;
    const nextContents = [...shulkerContents];
    nextContents[selectedSlot] = null;
    setShulkerContents(nextContents);
    showNotification('success', `Cleared slot ${selectedSlot}.`);
  };

  // Lore Management inside Editor
  const addLoreLine = () => {
    if (newLoreLine.trim()) {
      setSlotLore([...slotLore, newLoreLine.trim()]);
      setNewLoreLine('');
    }
  };

  const removeLoreLine = (index: number) => {
    setSlotLore(slotLore.filter((_, i) => i !== index));
  };

  // Enchantments Management inside Editor
  const addEnchantment = () => {
    if (enchantLevel > 0) {
      setSlotEnchants({
        ...slotEnchants,
        [selectedEnchant]: enchantLevel
      });
    }
  };

  const removeEnchantment = (key: string) => {
    const next = { ...slotEnchants };
    delete next[key];
    setSlotEnchants(next);
  };

  // Quick Action Utilities
  const clearAllSlots = () => {
    setShulkerContents(Array(27).fill(null));
    setSelectedSlot(null);
    showNotification('success', 'Cleared all slots.');
  };

  const randomFillBox = () => {
    const filled = Array(27).fill(null).map((_, i) => {
      // 50% chance of empty, 50% filled with random vanilla items
      if (Math.random() > 0.6) {
        const itemIds = [
          'minecraft:diamond', 'minecraft:netherite_ingot', 'minecraft:emerald', 'minecraft:totem_of_undying',
          'minecraft:diamond_sword', 'minecraft:golden_apple', 'minecraft:elytra', 'minecraft:arrow', 'minecraft:beacon'
        ];
        const randomId = itemIds[Math.floor(Math.random() * itemIds.length)];
        const amount = randomId.includes('sword') || randomId.includes('elytra') || randomId.includes('totem') ? 1 : Math.floor(Math.random() * 32) + 1;
        
        let extra: Partial<SlotItem> = {};
        if (Math.random() > 0.7) {
          extra.nameTag = `Legendary Loot crate ${i + 1}`;
          extra.lore = ['Created via Random Fill', 'Rare Treasure'];
          extra.enchantments = { 'sharpness': 5, 'unbreaking': 3 };
        }

        return {
          slot: i,
          typeId: randomId,
          amount,
          ...extra
        } as SlotItem;
      }
      return null;
    });
    setShulkerContents(filled);
    setSelectedSlot(null);
    showNotification('success', 'Randomized shulker contents.');
  };

  const copySlot = () => {
    if (selectedSlot !== null && shulkerContents[selectedSlot]) {
      setCopiedSlotItem({ ...shulkerContents[selectedSlot]! });
      showNotification('success', `Copied item from slot ${selectedSlot}.`);
    }
  };

  const pasteSlot = () => {
    if (selectedSlot !== null && copiedSlotItem) {
      const nextContents = [...shulkerContents];
      nextContents[selectedSlot] = {
        ...copiedSlotItem,
        slot: selectedSlot
      };
      setShulkerContents(nextContents);
      showNotification('success', `Pasted item into slot ${selectedSlot}.`);
    }
  };

  // Resolve item textures
  const getItemTextureUrl = (item: ItemRegistryEntry) => {
    if (item.texture) {
      if (item.is_custom === 1) {
        return getApiUrl(`/api/textures/${item.texture}`);
      }
      
      // If the texture name does not contain folder prefix (legacy format), use heuristic
      if (!item.texture.includes('/')) {
        let texName = item.texture;
        if (texName === 'sword_diamond') texName = 'diamond_sword';
        else if (texName === 'pickaxe_diamond') texName = 'diamond_pickaxe';
        else if (texName === 'axe_diamond') texName = 'diamond_axe';
        else if (texName === 'shovel_diamond') texName = 'diamond_shovel';
        else if (texName === 'sword_netherite') texName = 'netherite_sword';
        else if (texName === 'pickaxe_netherite') texName = 'netherite_pickaxe';
        else if (texName === 'bow_standby') texName = 'bow';
        else if (texName === 'redstone_dust') texName = 'redstone';
        else if (texName === 'apple_golden') texName = 'golden_apple';

        const isBlock = item.category.toLowerCase().includes('block') ||
                        item.type_id.includes('_block') || 
                        item.type_id === 'minecraft:dirt' || 
                        item.type_id === 'minecraft:stone' || 
                        item.type_id === 'minecraft:cobblestone' || 
                        item.type_id === 'minecraft:obsidian' || 
                        item.type_id === 'minecraft:beacon';

        const folder = isBlock ? 'blocks' : 'items';
        return `https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20.2/${folder}/${texName}.png`;
      }
      
      return `https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20.2/${item.texture}.png`;
    }
    return '';
  };

  // Find registry details by typeId
  const getRegistryItem = (typeId: string): ItemRegistryEntry | undefined => {
    return itemsRegistry.find(item => item.type_id === typeId);
  };

  // Save Template Action
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      showNotification('error', 'Please enter a template name.');
      return;
    }

    const payload = {
      name: templateName.trim(),
      shulker_type: shulkerType,
      contents: shulkerContents.filter((slot): slot is SlotItem => slot !== null)
    };

    try {
      await apiFetch('/api/templates', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showNotification('success', `Successfully saved template: ${templateName}`);
      setTemplateName('');
      loadTemplates();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to save template.');
    }
  };

  // Load Template Action
  const applyTemplate = (tpl: TemplateEntry) => {
    const freshContents = Array(27).fill(null);
    if (tpl.contents) {
      tpl.contents.forEach(slot => {
        if (slot.slot >= 0 && slot.slot < 27) {
          freshContents[slot.slot] = slot;
        }
      });
    }
    setShulkerContents(freshContents);
    setShulkerType(tpl.shulker_type);
    setSelectedSlot(null);
    showNotification('success', `Applied template: ${tpl.name}`);
    setActiveTab('editor');
  };

  // Delete Template Action
  const deleteTemplate = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete template "${name}"?`)) return;
    try {
      await apiFetch(`/api/templates/${name}`, { method: 'DELETE' });
      showNotification('success', `Deleted template: ${name}`);
      loadTemplates();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete template.');
    }
  };

  // Deliver Action
  const handleDeliver = async () => {
    if (!targetPlayer.trim()) {
      showNotification('error', 'Please enter a player name.');
      return;
    }

    const slots = shulkerContents.filter((slot): slot is SlotItem => slot !== null);

    const payload = {
      player_name: targetPlayer.trim(),
      template_name: templateName.trim() || null,
      shulker_type: shulkerType,
      slots: slots,
      method: deliveryMethod,
      scheduled_time: deliveryMethod === 'Schedule' ? scheduledTime : null
    };

    try {
      const res = await apiFetch('/api/deliver', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.status === 'dispatched') {
        showNotification('success', `Delivery job dispatched to online player: ${targetPlayer}`);
      } else if (res.status === 'queued_offline') {
        showNotification('success', `Player offline. Delivery queued for when ${targetPlayer} logs in.`);
      } else if (res.status === 'scheduled') {
        showNotification('success', `Delivery scheduled successfully.`);
      }
      loadLogs();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to trigger delivery.');
    }
  };

  // User Administration Operations
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      showNotification('error', 'Please specify username and password.');
      return;
    }
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newUserRole })
      });
      showNotification('success', `Created user: ${newUsername}`);
      setNewUsername('');
      setNewPassword('');
      loadUsersList();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to create user.');
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) return;
    try {
      await apiFetch(`/api/users/${username}`, { method: 'DELETE' });
      showNotification('success', `Deleted user: ${username}`);
      loadUsersList();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete user.');
    }
  };

  // Item Browser Filters
  const uniqueCategories = ['All', 'Vanilla Item', 'Vanilla Block', 'Custom Item', 'Custom Block', 'Storage Items'];
  const uniquePacks = ['All', ...new Set(itemsRegistry.map(item => item.source_pack))];

  const filteredItems = itemsRegistry.filter(item => {
    const matchesSearch = item.display_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.type_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    const matchesPack = packFilter === 'All' || item.source_pack === packFilter;
    return matchesSearch && matchesCategory && matchesPack;
  });

  // Login view
  if (!token) {
    return (
      <div className="app-container">
        <div className="auth-wrapper">
          <form className="auth-card" onSubmit={handleLogin} id="auth_login_form">
            <div className="auth-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
            </div>
            <h1 className="auth-title">Shulker Studios</h1>
            <p className="auth-subtitle">Minecraft Bedrock Loot Management Console</p>

            {authError && (
              <div className="notification-banner error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{authError}</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '16px', textAlign: 'left' }}>
              <label htmlFor="login_username">Username</label>
              <input
                id="login_username"
                className="input-control"
                type="text"
                placeholder="Enter admin username"
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '24px', textAlign: 'left' }}>
              <label htmlFor="login_password">Password</label>
              <input
                id="login_password"
                className="input-control"
                type="password"
                placeholder="Enter password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} id="btn_auth_submit">
              Log In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Top Header Navigation */}
      <header className="app-header">
        <div className="header-brand">
          <svg className="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
            <path d="M2 22V12h20v10"/>
            <path d="M12 2v20"/>
          </svg>
          <span className="brand-title">Shulker Studios</span>
          <span className="brand-badge">Minecraft Bedrock Admin</span>
        </div>

        <div className="header-meta">
          <div className="server-status">
            <div className={`status-dot ${serverOnline ? 'online' : 'offline'}`} />
            <span>Endstone API Server: {serverOnline ? 'Online (9020)' : 'Offline'}</span>
          </div>

          {user && (
            <div className="user-profile">
              <div className="user-info">
                <span className="user-name">{user.username}</span>
                <span className="user-role">{user.role}</span>
              </div>
              <button onClick={handleLogout} className="btn-logout" id="btn_header_logout">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="app-workspace">
        {/* Navigation Sidebar */}
        <aside className="app-sidebar">
          <div className="nav-menu">
            <button
              id="nav_btn_editor"
              className={`nav-item ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Shulker Box Editor
            </button>
            
            <button
              id="nav_btn_delivery"
              className={`nav-item ${activeTab === 'delivery' ? 'active' : ''}`}
              onClick={() => setActiveTab('delivery')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
              Delivery Console
            </button>

            <button
              id="nav_btn_templates"
              className={`nav-item ${activeTab === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveTab('templates')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Saved Templates
            </button>

            <button
              id="nav_btn_logs"
              className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Audit & Delivery Logs
            </button>

            {user?.role === 'Owner' && (
              <button
                id="nav_btn_users"
                className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
                onClick={() => setActiveTab('users')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Manage Staff Users
              </button>
            )}

            {(user?.role === 'Owner' || user?.role === 'Admin') && (
              <button
                id="nav_btn_tebex"
                className={`nav-item ${activeTab === 'tebex' ? 'active' : ''}`}
                onClick={() => setActiveTab('tebex')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                Tebex Mappings
              </button>
            )}
          </div>

          <div className="sidebar-footer">
            {addonsRegistry.length > 0 && (
              <div style={{ marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid hsla(var(--border-color)/0.3)', textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', marginBottom: '4px' }}>Active Addons ({addonsRegistry.length})</div>
                {addonsRegistry.map(a => (
                  <div key={a.pack_id} style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📦 {a.name} (v{a.version})
                  </div>
                ))}
              </div>
            )}
            <div>Shulker Studios Console</div>
            <div style={{ marginTop: '4px', opacity: 0.6 }}>v0.1.0 (Bedrock Addon)</div>
          </div>
        </aside>

        {/* Dynamic Content Panel */}
        <main className="app-content">
          {notification && (
            <div className={`notification-banner ${notification.type}`} id="notification_banner">
              {notification.type === 'success' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              )}
              <span>{notification.message}</span>
            </div>
          )}

          {/* TAB 1: SHULKER GRID EDITOR */}
          {activeTab === 'editor' && (
            <div>
              <div className="view-header">
                <h2 className="view-title">Visual Container Editor</h2>
                <p className="view-subtitle">Edit a 27-slot Minecraft Shulker box container dynamically.</p>
              </div>

              {/* Mobile Editor Sub-Tabs Navigation */}
              <div className="editor-subtabs-nav">
                <button 
                  className={`editor-subtab-btn ${editorSubTab === 'grid' ? 'active' : ''}`}
                  onClick={() => setEditorSubTab('grid')}
                >
                  📦 Cargo Grid
                </button>
                <button 
                  className={`editor-subtab-btn ${editorSubTab === 'library' ? 'active' : ''}`}
                  onClick={() => setEditorSubTab('library')}
                >
                  📚 Registry Library
                </button>
                <button 
                  className={`editor-subtab-btn ${editorSubTab === 'details' ? 'active' : ''}`}
                  onClick={() => setEditorSubTab('details')}
                >
                  ⚙️ Slot Details {selectedSlot !== null ? `(${selectedSlot})` : ''}
                </button>
              </div>

              <div className="editor-layout">
                {/* Column A: Interactive Grid */}
                <div className={`panel shulker-grid-container mobile-editor-col ${editorSubTab === 'grid' ? 'active' : ''}`}>
                  <div className="panel-header">
                    <span className="panel-title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                      Shulker Grid Map
                    </span>
                  </div>

                  <div className="shulker-display-box">
                    <div className="shulker-box-header">Shulker Box Cargo Grid</div>
                    <div className="shulker-grid" id="shulker_grid_map">
                      {shulkerContents.map((slotItem, idx) => {
                        const regDetails = slotItem ? getRegistryItem(slotItem.typeId) : undefined;
                        const texUrl = regDetails ? getItemTextureUrl(regDetails) : '';
                        
                        return (
                          <div
                            key={idx}
                            id={`shulker_slot_${idx}`}
                            className={`shulker-slot ${selectedSlot === idx ? 'selected' : ''} ${slotItem ? 'occupied' : ''}`}
                            onClick={() => setSelectedSlot(idx)}
                          >
                            {slotItem ? (
                              <>
                                {texUrl ? (
                                  <img
                                    src={texUrl}
                                    alt={slotItem.typeId}
                                    className="slot-item-icon"
                                    onError={(e) => {
                                      // Fallback on error
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : null}
                                <span className="slot-amount-badge">{slotItem.amount}</span>
                                <div className="browser-item-tooltip">
                                  <strong>{slotItem.nameTag || regDetails?.display_name || slotItem.typeId}</strong>
                                  <div style={{ color: '#818cf8', fontSize: '10px' }}>Slot: {idx} | qty: {slotItem.amount}</div>
                                  {slotItem.lore && slotItem.lore.map((line, lIdx) => (
                                    <div key={lIdx} style={{ color: '#d1d5db', fontStyle: 'italic', fontSize: '9px' }}>§5§o{line}</div>
                                  ))}
                                  {slotItem.enchantments && Object.keys(slotItem.enchantments).map(eName => (
                                    <div key={eName} style={{ color: '#fbbf24', fontSize: '9px' }}>{eName} {slotItem.enchantments![eName]}</div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <span className="slot-item-placeholder">{idx}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="shulker-grid-actions">
                    <button onClick={randomFillBox} className="btn" id="btn_random_fill">
                      🎲 Random Seed
                    </button>
                    <button onClick={clearAllSlots} className="btn btn-danger" id="btn_clear_container">
                      🗑️ Clear Container
                    </button>
                  </div>

                  {selectedSlot !== null && (
                    <div style={{ width: '100%', marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <button onClick={copySlot} className="btn" style={{ flex: 1 }} disabled={!shulkerContents[selectedSlot]} id="btn_copy_slot">
                        📋 Copy Slot
                      </button>
                      <button onClick={pasteSlot} className="btn" style={{ flex: 1 }} disabled={!copiedSlotItem} id="btn_paste_slot">
                        📥 Paste Slot
                      </button>
                    </div>
                  )}
                </div>

                {/* Column B: Slot Metadata & NBT Editor */}
                <div className={`panel mobile-editor-col ${editorSubTab === 'details' ? 'active' : ''}`}>
                  <div className="panel-header">
                    <span className="panel-title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      Slot Details {selectedSlot !== null ? `(${selectedSlot})` : '(No Slot Selected)'}
                    </span>
                  </div>

                  {selectedSlot === null ? (
                    <div style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '40px 0' }}>
                      Click on any grid cell to load or modify its item properties.
                    </div>
                  ) : (
                    <div className="slot-editor-form" id="slot_editor_form">
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="slot_item_type">Item Identifier</label>
                          <input
                            id="slot_item_type"
                            type="text"
                            className="input-control"
                            value={slotType}
                            onChange={e => setSlotType(e.target.value)}
                            placeholder="minecraft:diamond"
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="slot_item_amount">Stack Amount</label>
                          <input
                            id="slot_item_amount"
                            type="number"
                            min="1"
                            max="64"
                            className="input-control"
                            value={slotAmount}
                            onChange={e => setSlotAmount(Number(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="slot_name_tag">Custom Item Display Name</label>
                        <input
                          id="slot_name_tag"
                          type="text"
                          className="input-control"
                          value={slotNameTag}
                          onChange={e => setSlotNameTag(e.target.value)}
                          placeholder="e.g. Master Key"
                        />
                      </div>

                      {slotType.includes('potion') && (
                        <div className="form-group" style={{ marginBottom: '12px' }}>
                          <label htmlFor="slot_potion_effect">Potion Effect Type</label>
                          <input
                            id="slot_potion_effect"
                            type="text"
                            className="input-control"
                            value={slotPotionEffectType}
                            onChange={e => setSlotPotionEffectType(e.target.value)}
                            placeholder="e.g. speed, healing, fire_resistance"
                          />
                        </div>
                      )}

                      {/* Enchantments Area */}
                      <div className="enchantments-manager">
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>Enchantments</span>
                        <div className="enchantment-adder">
                          <select
                            className="input-control"
                            value={selectedEnchant}
                            onChange={e => setSelectedEnchant(e.target.value)}
                            id="select_enchant_picker"
                          >
                            {ENCHANTMENTS_LIST.map(e => <option key={e} value={e}>{e.replace('_', ' ').toUpperCase()}</option>)}
                          </select>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            className="input-control"
                            value={enchantLevel}
                            onChange={e => setEnchantLevel(Number(e.target.value))}
                            id="input_enchant_level"
                          />
                          <button type="button" onClick={addEnchantment} className="btn" id="btn_add_enchant">
                            Add
                          </button>
                        </div>

                        <div className="enchantments-list">
                          {Object.keys(slotEnchants).map(key => (
                            <span key={key} className="enchantment-tag">
                              {key}: {slotEnchants[key]}
                              <button type="button" onClick={() => removeEnchantment(key)}>×</button>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Lore Area */}
                      <div className="lore-manager">
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>Item Lore</span>
                        <div className="lore-adder">
                          <input
                            type="text"
                            className="input-control"
                            value={newLoreLine}
                            onChange={e => setNewLoreLine(e.target.value)}
                            placeholder="Lore line text"
                            id="input_lore_line"
                          />
                          <button type="button" onClick={addLoreLine} className="btn" id="btn_add_lore">
                            Add Line
                          </button>
                        </div>

                        <div className="lore-list">
                          {slotLore.map((line, lIdx) => (
                            <div key={lIdx} className="lore-item">
                              <span className="lore-index">{lIdx + 1}</span>
                              <span className="lore-text">{line}</span>
                              <button type="button" onClick={() => removeLoreLine(lIdx)} className="btn btn-danger btn-small" style={{ padding: '2px 6px' }}>×</button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Script API Metadata Controls */}
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="slot_lock_mode">Lock Mode</label>
                          <select
                            id="slot_lock_mode"
                            className="input-control"
                            value={slotLockMode}
                            onChange={e => setSlotLockMode(e.target.value)}
                          >
                            <option value="none">None</option>
                            <option value="lock_in_slot">Lock in Slot</option>
                            <option value="lock_in_inventory">Lock in Inventory</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
                          <input
                            id="slot_keep_on_death"
                            type="checkbox"
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            checked={slotKeepOnDeath}
                            onChange={e => setSlotKeepOnDeath(e.target.checked)}
                          />
                          <label htmlFor="slot_keep_on_death" style={{ cursor: 'pointer' }}>Keep on Death</label>
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="slot_custom_metadata">Custom Item Tag Data (JSON string)</label>
                        <input
                          id="slot_custom_metadata"
                          type="text"
                          className="input-control"
                          value={slotMetadata}
                          onChange={e => setSlotMetadata(e.target.value)}
                          placeholder='e.g. {"crate_key": true}'
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button onClick={saveSlotItem} className="btn btn-success" style={{ flex: 1 }} id="btn_save_slot_changes">
                          💾 Apply Changes
                        </button>
                        <button onClick={clearSlotItem} className="btn btn-danger" style={{ flex: 1 }} id="btn_clear_slot_changes">
                          Clear Cell
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Column C: Searchable Item Browser */}
                <div className={`panel item-browser mobile-editor-col ${editorSubTab === 'library' ? 'active' : ''}`}>
                  <div className="panel-header">
                    <span className="panel-title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      Registry Library
                    </span>
                  </div>

                  <div className="browser-search-wrapper">
                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Search identifier / name"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        id="input_item_search"
                        style={{ flex: 1 }}
                      />
                      {(user?.role === 'Owner' || user?.role === 'Admin') && (
                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            setIsAddingItem(true);
                            setRegistryFormTypeId('');
                            setRegistryFormDisplayName('');
                            setRegistryFormSourcePack('Vanilla');
                            setRegistryFormCategory('Vanilla Item');
                            setRegistryFormTexture('');
                            setRegistryFormPotionEffect('');
                            setRegistryFormIsCustom(0);
                          }}
                          style={{ padding: '0 12px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          title="Add New Registry Item"
                        >
                          ➕ Add
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="browser-filters">
                    <div className="filter-pills">
                      {uniqueCategories.map(cat => (
                        <button
                          key={cat}
                          className={`filter-pill ${categoryFilter === cat ? 'active' : ''}`}
                          onClick={() => setCategoryFilter(cat)}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    <select
                      className="input-control"
                      value={packFilter}
                      onChange={e => setPackFilter(e.target.value)}
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      id="select_pack_filter"
                    >
                      <option value="All">All Source Packs</option>
                      {uniquePacks.filter(p => p !== 'All').map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="browser-grid" id="registry_browser_grid">
                    {filteredItems.map(item => {
                      const texUrl = getItemTextureUrl(item);
                      return (
                        <div
                          key={item.type_id}
                          className="browser-item"
                          onClick={() => {
                            if (selectedSlot !== null) {
                               setSlotType(item.type_id);
                               setSlotPotionEffectType(item.potion_effect_type || '');
                               // Auto trigger apply changes with basic data
                               const nextContents = [...shulkerContents];
                               nextContents[selectedSlot] = {
                                 slot: selectedSlot,
                                 typeId: item.type_id,
                                 amount: slotAmount,
                                 potionEffectType: item.potion_effect_type || undefined
                               };
                               setShulkerContents(nextContents);
                               showNotification('success', `Assigned ${item.display_name} to slot ${selectedSlot}.`);
                            } else {
                              showNotification('error', 'Select a container grid cell first!');
                            }
                          }}
                        >
                          {texUrl ? (
                            <img
                              src={texUrl}
                              alt={item.display_name}
                              className="browser-item-img"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="browser-item-initials">
                              {item.display_name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          {item.is_custom === 1 && <div className="custom-badge" />}
                          {(user?.role === 'Owner' || user?.role === 'Admin') && (
                            <div className="browser-item-actions">
                              <button
                                className="item-action-btn edit-btn"
                                title="Edit Item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingItem(item);
                                  setRegistryFormDisplayName(item.display_name);
                                  setRegistryFormCategory(item.category);
                                  setRegistryFormTexture(item.texture || '');
                                  setRegistryFormPotionEffect(item.potion_effect_type || '');
                                }}
                              >
                                ✏️
                              </button>
                              <button
                                className="item-action-btn delete-btn"
                                title="Delete Item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRegistryItem(item.type_id);
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                          <div className="browser-item-tooltip">
                            <strong>{item.display_name}</strong>
                            <div style={{ color: '#a5b4fc', fontSize: '9px' }}>{item.type_id}</div>
                            <div style={{ color: '#94a3b8', fontSize: '8px' }}>Pack: {item.source_pack}</div>
                            {item.potion_effect_type && <div style={{ color: '#34d399', fontSize: '8px' }}>Effect: {item.potion_effect_type}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DELIVERY MANAGER */}
          {activeTab === 'delivery' && (
            <div>
              <div className="view-header">
                <h2 className="view-title">Cargo Delivery Console</h2>
                <p className="view-subtitle">Send your current container box configuration to online or offline players.</p>
              </div>

              <div className="panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div className="panel-header">
                  <span className="panel-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Dispatch Parameters
                  </span>
                </div>

                <div className="delivery-layout">
                  <div className="delivery-details">
                    <div className="form-group">
                      <label htmlFor="delivery_player_target">Recipient Player</label>
                      <input
                        id="delivery_player_target"
                        list="online_players_datalist"
                        type="text"
                        className="input-control"
                        placeholder="Enter player gamer tag"
                        value={targetPlayer}
                        onChange={e => setTargetPlayer(e.target.value)}
                        required
                      />
                      <datalist id="online_players_datalist">
                        {onlinePlayers.map(p => <option key={p.uuid} value={p.name}>{p.name}</option>)}
                      </datalist>
                      <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                        Type names manually for offline players. Immediate deliveries will queue until they join.
                      </span>
                    </div>

                    <div className="form-group">
                      <label htmlFor="delivery_shulker_type">Container Box Skin (Color)</label>
                      <select
                        id="delivery_shulker_type"
                        className="input-control"
                        value={shulkerType}
                        onChange={e => setShulkerType(e.target.value)}
                      >
                        <option value="minecraft:purple_shulker_box">Purple Shulker Box (Default)</option>
                        <option value="minecraft:white_shulker_box">White Shulker Box</option>
                        <option value="minecraft:orange_shulker_box">Orange Shulker Box</option>
                        <option value="minecraft:magenta_shulker_box">Magenta Shulker Box</option>
                        <option value="minecraft:light_blue_shulker_box">Light Blue Shulker Box</option>
                        <option value="minecraft:yellow_shulker_box">Yellow Shulker Box</option>
                        <option value="minecraft:lime_shulker_box">Lime Shulker Box</option>
                        <option value="minecraft:pink_shulker_box">Pink Shulker Box</option>
                        <option value="minecraft:gray_shulker_box">Gray Shulker Box</option>
                        <option value="minecraft:light_gray_shulker_box">Light Gray Shulker Box</option>
                        <option value="minecraft:cyan_shulker_box">Cyan Shulker Box</option>
                        <option value="minecraft:blue_shulker_box">Blue Shulker Box</option>
                        <option value="minecraft:brown_shulker_box">Brown Shulker Box</option>
                        <option value="minecraft:green_shulker_box">Green Shulker Box</option>
                        <option value="minecraft:red_shulker_box">Red Shulker Box</option>
                        <option value="minecraft:black_shulker_box">Black Shulker Box</option>
                        <option value="minecraft:shulker_box">Undyed Shulker Box</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="delivery_method">Delivery Strategy</label>
                      <select
                        id="delivery_method"
                        className="input-control"
                        value={deliveryMethod}
                        onChange={e => setDeliveryMethod(e.target.value)}
                      >
                        <option value="Give">Give directly into Inventory (If slots available)</option>
                        <option value="Feet">Drop at Player Feet in World</option>
                        <option value="Join">Force deliver on Next Player Join Event</option>
                        <option value="Schedule">Schedule Timestamp Delivery</option>
                      </select>
                    </div>

                    {deliveryMethod === 'Schedule' && (
                      <div className="form-group" id="scheduled_time_group">
                        <label htmlFor="delivery_scheduled_time">Target Delivery Time</label>
                        <input
                          id="delivery_scheduled_time"
                          type="datetime-local"
                          className="input-control"
                          value={scheduledTime}
                          onChange={e => setScheduledTime(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="delivery-details">
                    <div className="form-group">
                      <label htmlFor="delivery_template_name">Save Layout as Reusable Template (Optional)</label>
                      <input
                        id="delivery_template_name"
                        type="text"
                        className="input-control"
                        placeholder="Template Name e.g. kit_starter"
                        value={templateName}
                        onChange={e => setTemplateName(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
                      <button onClick={handleDeliver} className="btn btn-primary" style={{ padding: '12px' }} id="btn_trigger_delivery">
                        ✈️ Dispatch Cargo Package
                      </button>
                      
                      <button onClick={handleSaveTemplate} className="btn" style={{ padding: '12px' }} id="btn_save_template">
                        💾 Save Template Only
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SAVED TEMPLATES */}
          {activeTab === 'templates' && (
            <div>
              <div className="view-header">
                <h2 className="view-title">Reusable Shulker Templates</h2>
                <p className="view-subtitle">Apply saved crate layouts to the editor or dispatch them directly.</p>
              </div>

              {templates.length === 0 ? (
                <div className="panel" style={{ textAlign: 'center', padding: '40px 0', color: 'hsl(var(--text-muted))' }}>
                  No templates saved yet. Design a layout in the editor and save it.
                </div>
              ) : (
                <div className="templates-list" id="templates_grid">
                  {templates.map(tpl => (
                    <div key={tpl.id} className="template-card">
                      <div>
                        <div className="template-card-header">
                          <svg className="template-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                          <span className="template-card-name">{tpl.name}</span>
                        </div>
                        <div className="template-card-details" style={{ marginTop: '8px' }}>
                          <div>Skin: <code style={{ color: '#818cf8' }}>{tpl.shulker_type.split(':').pop()}</code></div>
                          <div>Updated: {new Date(tpl.updated_at).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="template-card-actions">
                        <button onClick={() => applyTemplate(tpl)} className="btn btn-primary btn-small">
                          ✏️ Load to Editor
                        </button>
                        <button onClick={() => deleteTemplate(tpl.name)} className="btn btn-danger btn-small">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDIT & LOGS */}
          {activeTab === 'logs' && (
            <div className="logs-grid">
              {/* Delivery logs */}
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                    Delivery Queue & Status
                  </span>
                  <button onClick={loadLogs} className="btn btn-small" id="btn_refresh_logs">🔄 Refresh</button>
                </div>

                <div className="log-table-wrapper">
                  <table className="log-table" id="delivery_logs_table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Player</th>
                        <th>Template</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th>Timestamp</th>
                        <th>Details/Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.deliveries.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'hsl(var(--text-muted))' }}>No deliveries recorded yet.</td>
                        </tr>
                      ) : (
                        logs.deliveries.map(d => (
                          <tr key={d.id}>
                            <td><code>#{d.id}</code></td>
                            <td><strong>{d.player_name}</strong></td>
                            <td>{d.template_name || <em style={{ color: 'hsl(var(--text-muted))' }}>Custom</em>}</td>
                            <td><code>{d.delivery_method}</code></td>
                            <td>
                              <span className={`log-badge ${d.status.toLowerCase()}`}>
                                {d.status}
                              </span>
                            </td>
                            <td className="log-time">{new Date(d.created_at).toLocaleString()}</td>
                            <td style={{ fontSize: '0.8rem', color: d.error_message ? 'hsl(var(--error))' : 'hsl(var(--text-secondary))' }}>
                              {d.error_message || 'Success'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Audit logs */}
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                    System Audit Trail (Security Log)
                  </span>
                </div>

                <div className="log-table-wrapper">
                  <table className="log-table" id="audit_logs_table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Admin User</th>
                        <th>Action</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.audits.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', color: 'hsl(var(--text-muted))' }}>No admin actions recorded yet.</td>
                        </tr>
                      ) : (
                        logs.audits.map(a => (
                          <tr key={a.id}>
                            <td className="log-time">{new Date(a.timestamp).toLocaleString()}</td>
                            <td><code>{a.username}</code></td>
                            <td><strong>{a.action}</strong></td>
                            <td style={{ color: 'hsl(var(--text-secondary))' }}>{a.details}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: STAFF USER CONFIGURATION (OWNER ONLY) */}
          {activeTab === 'users' && user?.role === 'Owner' && (
            <div className="user-admin-layout">
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    Register Admin / Staff
                  </span>
                </div>

                <form onSubmit={handleCreateUser} id="create_staff_form">
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label htmlFor="admin_new_username">Gamer Username</label>
                    <input
                      id="admin_new_username"
                      className="input-control"
                      type="text"
                      placeholder="Username"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label htmlFor="admin_new_password">Password</label>
                    <input
                      id="admin_new_password"
                      className="input-control"
                      type="password"
                      placeholder="Password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label htmlFor="admin_new_role">Security Role</label>
                    <select
                      id="admin_new_role"
                      className="input-control"
                      value={newUserRole}
                      onChange={e => setNewUserRole(e.target.value)}
                    >
                      <option value="Admin">Admin (Full Write Access)</option>
                      <option value="Moderator">Moderator (Deliver Cargo Only)</option>
                      <option value="Viewer">Viewer (Read Only)</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }} id="btn_create_staff_submit">
                    Add Staff Member
                  </button>
                </form>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    Authorized Console Staff Accounts
                  </span>
                </div>

                <div className="log-table-wrapper">
                  <table className="log-table" id="staff_users_table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Created At</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map(u => (
                        <tr key={u.username}>
                          <td><strong>{u.username}</strong></td>
                          <td>
                            <span className="user-role">{u.role}</span>
                          </td>
                          <td className="log-time">{new Date(u.created_at).toLocaleString()}</td>
                          <td>
                            <button
                              onClick={() => handleDeleteUser(u.username)}
                              className="btn btn-danger btn-small"
                              disabled={u.username === user.username}
                            >
                              Revoke Access
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: TEBEX MAPPINGS MOCKUP (ADMIN ONLY) */}
          {activeTab === 'tebex' && (user?.role === 'Owner' || user?.role === 'Admin') && (
            <div className="tebex-mappings-layout" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Category selector */}
              <div className="category-filter-bar" style={{ display: 'flex', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                {['All', 'TP Ropes', 'Creative Packs', 'Valuables & Ores', 'Combat & Gear', 'Construction Kits', 'Shop restocks', 'Cracked Nation', 'The Vault'].map(cat => (
                  <button
                    key={cat}
                    className={`btn ${selectedKitCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setSelectedKitCategory(cat);
                      setSelectedBoxIndex(0);
                      // Select first kit in this category automatically
                      const filtered = getTebexKits().filter(k => cat === 'All' || k.category === cat);
                      if (filtered.length > 0) {
                        setSelectedKitId(filtered[0].id);
                      }
                    }}
                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="tebex-grid-columns" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: '20px', alignItems: 'start' }}>
                {/* Left Column: Kits List */}
                <div className="panel" style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                  <div className="panel-header">
                    <span className="panel-title">Donation Packages</span>
                  </div>
                  <div className="kits-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px' }}>
                    {getTebexKits()
                      .filter(k => selectedKitCategory === 'All' || k.category === selectedKitCategory)
                      .map(kit => (
                        <div
                          key={kit.id}
                          className={`kit-item ${selectedKitId === kit.id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedKitId(kit.id);
                            setSelectedBoxIndex(0);
                          }}
                          style={{
                            padding: '12px',
                            background: selectedKitId === kit.id ? 'hsla(var(--primary)/0.15)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${selectedKitId === kit.id ? 'hsl(var(--primary))' : 'hsla(var(--border-color)/0.3)'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'left'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '0.9rem', color: selectedKitId === kit.id ? 'hsl(var(--primary-foreground))' : 'hsl(var(--text-main))' }}>
                              {kit.name}
                            </strong>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--primary-foreground))', background: 'hsla(var(--primary)/0.2)', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                              {kit.price}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>
                            ID: <code>{kit.id}</code>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Right Column: Selected Kit Detail Visual Mockup */}
                <div className="panel" style={{ textAlign: 'left' }}>
                  {(() => {
                    const kit = getTebexKits().find(k => k.id === selectedKitId);
                    if (!kit) return <div style={{ padding: '20px' }}>No package selected</div>;

                    const activeBox = kit.boxes ? kit.boxes[selectedBoxIndex] : null;

                    return (
                      <div className="kit-detail-container" style={{ padding: '20px' }}>
                        {/* Title & Info */}
                        <div style={{ borderBottom: '1px solid hsla(var(--border-color)/0.3)', paddingBottom: '16px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'hsl(var(--primary-foreground))', fontWeight: 600, letterSpacing: '0.05em' }}>
                                {kit.category}
                              </span>
                              <h2 style={{ margin: '4px 0 8px 0', fontSize: '1.5rem', fontWeight: 700 }}>{kit.name}</h2>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'hsl(var(--primary-foreground))' }}>{kit.price}</div>
                              <div style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Tebex store price</div>
                            </div>
                          </div>
                          <p style={{ color: 'hsl(var(--text-secondary))', margin: '8px 0 0 0', fontSize: '0.9rem' }}>{kit.description}</p>
                        </div>

                        {/* Side Rewards */}
                        {(kit.coins || kit.tags || kit.warpCode) && (
                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid hsla(var(--border-color)/0.2)', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'hsl(var(--text-secondary))', letterSpacing: '0.05em' }}>
                              ⚡ Side Rewards Delivered
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {kit.coins && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                                  <span style={{ color: '#fbbf24', fontSize: '1.2rem' }}>🪙</span>
                                  <span>Added to <strong>Money Scoreboard</strong>: <strong style={{ color: '#fbbf24' }}>+{kit.coins.toLocaleString()} Coins</strong></span>
                                </div>
                              )}
                              {kit.tags && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                                  <span style={{ color: '#10b981', fontSize: '1.2rem' }}>🏷️</span>
                                  <span>Applied Player Tags: {kit.tags.map((t: string) => <code key={t} style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>{t}</code>)}</span>
                                </div>
                              )}
                              {kit.warpCode && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                                  <span style={{ color: '#818cf8', fontSize: '1.2rem' }}>🎟️</span>
                                  <span>
                                    Generated <strong>Warp Code</strong>: <strong style={{ color: '#818cf8' }}>{kit.warpCode.name}</strong> ({kit.warpCode.duration} Days)
                                    <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
                                      Automatically registers in <code>warp-codes</code> database and dispatches code to <strong>Discord webhook</strong>.
                                    </div>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Shulker Deliveries Visual Mockup */}
                        {kit.boxes ? (
                          <div>
                            {/* Box Selector for multi-box packages */}
                            {kit.boxes.length > 1 && (
                              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '6px' }}>
                                {kit.boxes.map((box: any, bIdx: number) => (
                                  <button
                                    key={bIdx}
                                    className={`btn ${selectedBoxIndex === bIdx ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setSelectedBoxIndex(bIdx)}
                                    style={{ padding: '4px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                  >
                                    {box.name}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Shulker Grid container */}
                            <div className="shulker-display-box" style={{ background: 'hsla(var(--primary)/0.03)', border: '1px solid hsla(var(--border-color)/0.3)', borderRadius: '10px', padding: '16px' }}>
                              <div className="shulker-box-header" style={{ marginBottom: '12px', fontWeight: 600, fontSize: '0.9rem', color: 'hsl(var(--primary-foreground))' }}>
                                {activeBox?.name || "Shulker Box Content Grid"}
                              </div>
                              <div className="shulker-grid">
                                {(() => {
                                  const grid = Array(27).fill(null);
                                  if (activeBox) {
                                    activeBox.slots.forEach((s: any) => {
                                      if (s.slot >= 0 && s.slot < 27) {
                                        grid[s.slot] = s;
                                      }
                                    });
                                  }

                                  return grid.map((slotItem, idx) => {
                                    const regDetails = slotItem ? getRegistryItem(slotItem.typeId) : undefined;
                                    const texUrl = regDetails ? getItemTextureUrl(regDetails) : '';

                                    return (
                                      <div
                                        key={idx}
                                        className={`shulker-slot ${slotItem ? 'occupied' : ''}`}
                                        style={{ cursor: slotItem ? 'help' : 'default' }}
                                      >
                                        {slotItem ? (
                                          <>
                                            {texUrl ? (
                                              <img
                                                src={texUrl}
                                                alt={slotItem.typeId}
                                                className="slot-item-icon"
                                                onError={(e) => {
                                                  (e.target as HTMLElement).style.display = 'none';
                                                }}
                                              />
                                            ) : null}
                                            <span className="slot-amount-badge">{slotItem.amount}</span>
                                            <div className="browser-item-tooltip">
                                              <strong>{slotItem.nameTag || regDetails?.display_name || slotItem.typeId}</strong>
                                              <div style={{ color: '#818cf8', fontSize: '10px' }}>Slot: {idx} | Type: <code>{slotItem.typeId}</code></div>
                                              {slotItem.lore && slotItem.lore.map((line: string, lIdx: number) => (
                                                <div key={lIdx} style={{ color: '#d1d5db', fontStyle: 'italic', fontSize: '9px' }}>{line}</div>
                                              ))}
                                              {slotItem.enchantments && Object.keys(slotItem.enchantments).map(eName => (
                                                <div key={eName} style={{ color: '#fbbf24', fontSize: '9px' }}>
                                                  {eName.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} {slotItem.enchantments[eName]}
                                                </div>
                                              ))}
                                            </div>
                                          </>
                                        ) : (
                                          <span className="slot-item-placeholder">{idx}</span>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: '40px', background: 'rgba(255,255,255,0.01)', border: '1px dashed hsla(var(--border-color)/0.2)', borderRadius: '8px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                            ℹ️ This package delivers side rewards (Coins/Warp Codes) directly, without a Shulker Box item.
                          </div>
                        )}

                        {/* Command block info */}
                        <div style={{ marginTop: '20px' }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'hsl(var(--text-secondary))', letterSpacing: '0.05em' }}>
                            🖥️ Tebex Console Dispatch Command
                          </h4>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <code style={{ flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', border: '1px solid hsla(var(--border-color)/0.3)', borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'monospace', color: '#a5b4fc', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                              shulkertebex "{'{username}'}" {kit.id}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`shulkertebex "{username}" ${kit.id}`);
                                showNotification('success', 'Command copied to clipboard!');
                              }}
                              className="btn btn-secondary"
                              style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}
                            >
                              Copy
                            </button>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginTop: '6px' }}>
                            Configure this exact command in the Tebex Creator Panel under the package's "Commands" section.
                          </div>
                        </div>

                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Bar Navigation */}
      <nav className="mobile-bottom-nav">
        <button 
          className={`mobile-nav-btn ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <span>Editor</span>
        </button>
        <button 
          className={`mobile-nav-btn ${activeTab === 'delivery' ? 'active' : ''}`}
          onClick={() => setActiveTab('delivery')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
          <span>Deliver</span>
        </button>
        <button 
          className={`mobile-nav-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span>Templates</span>
        </button>
        <button 
          className={`mobile-nav-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <span>Logs</span>
        </button>
        {user?.role === 'Owner' && (
          <button 
            className={`mobile-nav-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <span>Staff</span>
          </button>
        )}
        {(user?.role === 'Owner' || user?.role === 'Admin') && (
          <button 
            className={`mobile-nav-btn ${activeTab === 'tebex' ? 'active' : ''}`}
            onClick={() => setActiveTab('tebex')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
            <span>Tebex</span>
          </button>
        )}
      </nav>

      {/* Edit Registry Item Modal */}
      {editingItem && (
        <div className="modal-overlay" onClick={() => setEditingItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit Registry Item</span>
              <button className="modal-close" onClick={() => setEditingItem(null)}>&times;</button>
            </div>
            <form onSubmit={handleEditRegistryItem}>
              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Item Identifier (Read Only)</label>
                  <input
                    type="text"
                    className="input-control"
                    value={editingItem.type_id}
                    disabled
                    style={{ opacity: 0.6 }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Display Name</label>
                  <input
                    type="text"
                    className="input-control"
                    value={registryFormDisplayName}
                    onChange={e => setRegistryFormDisplayName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Category</label>
                  <select
                    className="input-control"
                    value={registryFormCategory}
                    onChange={e => setRegistryFormCategory(e.target.value)}
                  >
                    <option value="Vanilla Item">Vanilla Item</option>
                    <option value="Vanilla Block">Vanilla Block</option>
                    <option value="Custom Item">Custom Item</option>
                    <option value="Custom Block">Custom Block</option>
                    <option value="Storage Items">Storage Items</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Texture/Icon Key</label>
                  <input
                    type="text"
                    className="input-control"
                    value={registryFormTexture}
                    onChange={e => setRegistryFormTexture(e.target.value)}
                    placeholder="e.g. apple, sword_diamond, or custom path"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Potion Effect Type (Optional)</label>
                  <input
                    type="text"
                    className="input-control"
                    value={registryFormPotionEffect}
                    onChange={e => setRegistryFormPotionEffect(e.target.value)}
                    placeholder="e.g. speed, healing, fire_resistance"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setEditingItem(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Registry Item Modal */}
      {isAddingItem && (
        <div className="modal-overlay" onClick={() => setIsAddingItem(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Register New Item</span>
              <button className="modal-close" onClick={() => setIsAddingItem(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddRegistryItem}>
              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Item Identifier (typeId)</label>
                  <input
                    type="text"
                    className="input-control"
                    value={registryFormTypeId}
                    onChange={e => setRegistryFormTypeId(e.target.value)}
                    placeholder="e.g. minecraft:potion, or custom:ruby"
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Display Name</label>
                  <input
                    type="text"
                    className="input-control"
                    value={registryFormDisplayName}
                    onChange={e => setRegistryFormDisplayName(e.target.value)}
                    placeholder="e.g. Ruby"
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Source Pack</label>
                  <input
                    type="text"
                    className="input-control"
                    value={registryFormSourcePack}
                    onChange={e => setRegistryFormSourcePack(e.target.value)}
                    placeholder="e.g. Vanilla, or MyCustomAddon"
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Category</label>
                  <select
                    className="input-control"
                    value={registryFormCategory}
                    onChange={e => setRegistryFormCategory(e.target.value)}
                  >
                    <option value="Vanilla Item">Vanilla Item</option>
                    <option value="Vanilla Block">Vanilla Block</option>
                    <option value="Custom Item">Custom Item</option>
                    <option value="Custom Block">Custom Block</option>
                    <option value="Storage Items">Storage Items</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Texture/Icon Key</label>
                  <input
                    type="text"
                    className="input-control"
                    value={registryFormTexture}
                    onChange={e => setRegistryFormTexture(e.target.value)}
                    placeholder="e.g. apple, ruby, sword_diamond"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Potion Effect Type (Optional)</label>
                  <input
                    type="text"
                    className="input-control"
                    value={registryFormPotionEffect}
                    onChange={e => setRegistryFormPotionEffect(e.target.value)}
                    placeholder="e.g. speed, healing"
                  />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                  <input
                    type="checkbox"
                    id="add_form_is_custom"
                    checked={registryFormIsCustom === 1}
                    onChange={e => setRegistryFormIsCustom(e.target.checked ? 1 : 0)}
                  />
                  <label htmlFor="add_form_is_custom" style={{ userSelect: 'none', cursor: 'pointer' }}>Is Custom Content (Resource Pack/Addon)</label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setIsAddingItem(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
