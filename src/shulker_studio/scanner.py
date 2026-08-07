import os
import shutil
import json
from pathlib import Path
from typing import List, Dict, Any, Tuple

class ContentScanner:
    def __init__(self, db_manager):
        self.db_manager = db_manager
        self.vanilla_seeded = False

    def retrieve_and_update_textures(self, server_root: Path, data_folder: Path):
        dest_textures_dir = data_folder / "textures"
        dest_textures_dir.mkdir(parents=True, exist_ok=True)
        
        rp_paths = [
            server_root / "development_resource_packs",
            server_root / "resource_packs"
        ]
        
        # Add world-specific resource pack directories
        worlds_dir = server_root / "worlds"
        if worlds_dir.exists():
            for wdir in worlds_dir.iterdir():
                if wdir.is_dir():
                    rp_paths.append(wdir / "resource_packs")
                    rp_paths.append(wdir / "development_resource_packs")
        
        copied_count = 0
        total_found = 0
        
        for base_path in rp_paths:
            if not base_path.exists():
                continue
                
            for pack_dir in base_path.iterdir():
                if not pack_dir.is_dir():
                    continue
                    
                if self.is_standard_pack(pack_dir.name):
                    continue
                    
                # Manifest check
                manifest_path = pack_dir / "manifest.json"
                if not manifest_path.exists():
                    continue
                
                # Check for pack_icon.png
                icon_path = pack_dir / "pack_icon.png"
                if icon_path.exists():
                    total_found += 1
                    dest_file = dest_textures_dir / pack_dir.name / "pack_icon.png"
                    if not dest_file.exists() or icon_path.stat().st_mtime > dest_file.stat().st_mtime:
                        dest_file.parent.mkdir(parents=True, exist_ok=True)
                        try:
                            shutil.copy2(str(icon_path), str(dest_file))
                            copied_count += 1
                        except Exception as e:
                            print(f"[ShulkerStudio] Failed to copy pack icon for {pack_dir.name}: {e}")
                
                # Check recursively inside textures folder
                textures_dir = pack_dir / "textures"
                if textures_dir.exists():
                    for root, _, files in os.walk(str(textures_dir)):
                        for file in files:
                            if file.lower().endswith(".png"):
                                src_file = Path(root) / file
                                rel_path = src_file.relative_to(pack_dir)
                                dest_file = dest_textures_dir / pack_dir.name / rel_path
                                
                                total_found += 1
                                if not dest_file.exists() or src_file.stat().st_mtime > dest_file.stat().st_mtime:
                                    dest_file.parent.mkdir(parents=True, exist_ok=True)
                                    try:
                                        shutil.copy2(str(src_file), str(dest_file))
                                        copied_count += 1
                                    except Exception as e:
                                        print(f"[ShulkerStudio] Failed to copy texture {rel_path} for {pack_dir.name}: {e}")
                                        
        if copied_count > 0:
            print(f"[ShulkerStudio] Retrieved/updated {copied_count} texture files in local cache (Total found: {total_found}).")
        else:
            print(f"[ShulkerStudio] Texture cache up-to-date. (Checked {total_found} files).")

    def seed_vanilla_items(self):
        # First try loading comprehensive packaged items list
        try:
            json_path = Path(__file__).parent / "vanilla_items.json"
            if json_path.exists():
                with open(json_path, "r", encoding="utf-8") as f:
                    vanilla_items = json.load(f)
                self.db_manager.save_item_registry(vanilla_items)
                self.vanilla_seeded = True
                print(f"[ShulkerStudio] Loaded {len(vanilla_items)} vanilla items/blocks from packaged JSON.")
                return
        except Exception as e:
            print(f"[ShulkerStudio] Failed to load vanilla_items.json: {e}")

        # Fallback to standard standard vanilla items/blocks if file missing or error
        vanilla_items = [
            # Items
            {"typeId": "minecraft:diamond", "displayName": "Diamond", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "diamond", "isCustom": 0},
            {"typeId": "minecraft:iron_ingot", "displayName": "Iron Ingot", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "iron_ingot", "isCustom": 0},
            {"typeId": "minecraft:gold_ingot", "displayName": "Gold Ingot", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "gold_ingot", "isCustom": 0},
            {"typeId": "minecraft:netherite_ingot", "displayName": "Netherite Ingot", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "netherite_ingot", "isCustom": 0},
            {"typeId": "minecraft:emerald", "displayName": "Emerald", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "emerald", "isCustom": 0},
            {"typeId": "minecraft:coal", "displayName": "Coal", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "coal", "isCustom": 0},
            {"typeId": "minecraft:redstone", "displayName": "Redstone Dust", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "redstone_dust", "isCustom": 0},
            {"typeId": "minecraft:lapis_lazuli", "displayName": "Lapis Lazuli", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "lapis_lazuli", "isCustom": 0},
            {"typeId": "minecraft:apple", "displayName": "Apple", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "apple", "isCustom": 0},
            {"typeId": "minecraft:golden_apple", "displayName": "Golden Apple", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "apple_golden", "isCustom": 0},
            {"typeId": "minecraft:bread", "displayName": "Bread", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "bread", "isCustom": 0},
            {"typeId": "minecraft:totem_of_undying", "displayName": "Totem of Undying", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "totem", "isCustom": 0},
            
            # Tools & Weapons
            {"typeId": "minecraft:diamond_sword", "displayName": "Diamond Sword", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "sword_diamond", "isCustom": 0},
            {"typeId": "minecraft:diamond_pickaxe", "displayName": "Diamond Pickaxe", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "pickaxe_diamond", "isCustom": 0},
            {"typeId": "minecraft:diamond_axe", "displayName": "Diamond Axe", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "axe_diamond", "isCustom": 0},
            {"typeId": "minecraft:diamond_shovel", "displayName": "Diamond Shovel", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "shovel_diamond", "isCustom": 0},
            {"typeId": "minecraft:netherite_sword", "displayName": "Netherite Sword", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "sword_netherite", "isCustom": 0},
            {"typeId": "minecraft:netherite_pickaxe", "displayName": "Netherite Pickaxe", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "pickaxe_netherite", "isCustom": 0},
            {"typeId": "minecraft:bow", "displayName": "Bow", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "bow_standby", "isCustom": 0},
            {"typeId": "minecraft:elytra", "displayName": "Elytra", "sourcePack": "Vanilla", "category": "Vanilla Item", "texture": "elytra", "isCustom": 0},

            # Shulker Boxes
            {"typeId": "minecraft:purple_shulker_box", "displayName": "Purple Shulker Box", "sourcePack": "Vanilla", "category": "Storage Items", "texture": "shulker_box", "isCustom": 0},
            {"typeId": "minecraft:shulker_box", "displayName": "Shulker Box (Undyed)", "sourcePack": "Vanilla", "category": "Storage Items", "texture": "shulker_box", "isCustom": 0},
            {"typeId": "minecraft:chest", "displayName": "Chest", "sourcePack": "Vanilla", "category": "Storage Items", "texture": "chest", "isCustom": 0},
            
            # Blocks
            {"typeId": "minecraft:grass_block", "displayName": "Grass Block", "sourcePack": "Vanilla", "category": "Vanilla Block", "texture": "grass_side_carried", "isCustom": 0},
            {"typeId": "minecraft:dirt", "displayName": "Dirt", "sourcePack": "Vanilla", "category": "Vanilla Block", "texture": "dirt", "isCustom": 0},
            {"typeId": "minecraft:stone", "displayName": "Stone", "sourcePack": "Vanilla", "category": "Vanilla Block", "texture": "stone", "isCustom": 0},
            {"typeId": "minecraft:cobblestone", "displayName": "Cobblestone", "sourcePack": "Vanilla", "category": "Vanilla Block", "texture": "cobblestone", "isCustom": 0},
            {"typeId": "minecraft:obsidian", "displayName": "Obsidian", "sourcePack": "Vanilla", "category": "Vanilla Block", "texture": "obsidian", "isCustom": 0},
            {"typeId": "minecraft:diamond_block", "displayName": "Block of Diamond", "sourcePack": "Vanilla", "category": "Vanilla Block", "texture": "block_diamond", "isCustom": 0},
            {"typeId": "minecraft:gold_block", "displayName": "Block of Gold", "sourcePack": "Vanilla", "category": "Vanilla Block", "texture": "block_gold", "isCustom": 0},
            {"typeId": "minecraft:beacon", "displayName": "Beacon", "sourcePack": "Vanilla", "category": "Vanilla Block", "texture": "beacon", "isCustom": 0}
        ]
        self.db_manager.save_item_registry(vanilla_items)
        self.vanilla_seeded = True

    def seed_all_vanilla_items(self, server):
        if not hasattr(server, "item_registry"):
            return

        def is_id_block(type_id: str) -> bool:
            short = type_id.split(":")[-1]
            block_suffixes = (
                '_block', '_ore', '_stairs', '_slab', '_wall', '_fence', '_gate', 
                '_button', '_pressure_plate', '_door', '_trapdoor', '_sign', '_bed', 
                '_candle', '_concrete', '_terracotta', '_wool', '_carpet', '_glass', 
                '_planks', '_log', '_wood', '_sapling', '_leaves', '_flower', 
                '_mushroom', '_coral', '_shulker_box', '_pillar', '_stem', '_hyphae',
                '_nylium', '_roots', '_wart', '_vines', '_fungus', '_lantern', 
                '_anvil', '_glazed_terracotta', '_copper'
            )
            if short.endswith(block_suffixes):
                return True
            block_names = {
                'stone', 'dirt', 'grass_block', 'sand', 'gravel', 'clay', 'obsidian', 
                'bedrock', 'ice', 'packed_ice', 'blue_ice', 'snow', 'mycelium', 'podzol', 
                'end_stone', 'netherrack', 'soul_sand', 'soul_soil', 'glowstone', 'sponge', 
                'magma', 'crying_obsidian', 'tnt', 'bookshelf', 'crafting_table', 'furnace', 
                'chest', 'ender_chest', 'barrel', 'spawner', 'beacon', 'bell', 'campfire', 
                'soul_campfire', 'conduit', 'cauldron', 'composter', 'lectern', 'grindstone', 
                'loom', 'stonecutter', 'smoker', 'blast_furnace', 'hopper', 'dropper', 
                'dispenser', 'observer', 'piston', 'sticky_piston', 'crying_obsidian', 
                'respawn_anchor', 'lodestone', 'target', 'honeycomb_block', 'scaffolding',
                'sea_lantern', 'shroomlight', 'wet_sponge'
            }
            return short in block_names

        vanilla_items = []
        try:
            for item_type in server.item_registry:
                type_id = item_type.id
                if not type_id.startswith("minecraft:"):
                    continue
                if type_id == "minecraft:air":
                    continue
                
                short_name = type_id.split(":")[-1]
                display_name = short_name.replace("_", " ").title()
                
                # Categorization
                if "shulker_box" in type_id or type_id in ("minecraft:chest", "minecraft:ender_chest", "minecraft:barrel"):
                    category = "Storage Items"
                elif is_id_block(type_id):
                    category = "Vanilla Block"
                else:
                    category = "Vanilla Item"
                
                vanilla_items.append({
                    "typeId": type_id,
                    "displayName": display_name,
                    "sourcePack": "Vanilla",
                    "category": category,
                    "texture": short_name,
                    "isCustom": 0
                })
            
            if vanilla_items:
                self.db_manager.save_item_registry(vanilla_items)
                print(f"[ShulkerStudio] Dynamically seeded {len(vanilla_items)} vanilla items from server registry.")
                self.vanilla_seeded = True
        except Exception as e:
            print(f"[ShulkerStudio] Failed to seed vanilla items dynamically: {e}")

    def is_standard_pack(self, name: str) -> bool:
        name_lower = name.lower()
        if name_lower in ("vanilla", "chemistry", "editor", "server_library", "server_ui_library", "server_editor_library"):
            return True
        if name_lower.startswith("vanilla_") or name_lower.startswith("chemistry_") or name_lower.startswith("editor_"):
            return True
        if name_lower.startswith("experimental_") or name_lower.startswith("server_"):
            return True
        if "shulker_studio" in name_lower or "shulker_system" in name_lower:
            return True
        return False

    def scan_packs(self, server_root: Path, server=None):
        # 1. Seed vanilla if registry is empty
        if not self.vanilla_seeded:
            self.seed_vanilla_items()
            if not self.vanilla_seeded and server:
                self.seed_all_vanilla_items(server)

        scanned_items = []
        texture_mappings = {}  # Map short name -> full path or base64 (or path relative to RP)

        # 2. First scan resource packs to build texture dictionary
        rp_paths = [
            server_root / "development_resource_packs",
            server_root / "resource_packs"
        ]
        
        # Add world-specific resource pack directories
        worlds_dir = server_root / "worlds"
        if worlds_dir.exists():
            for wdir in worlds_dir.iterdir():
                if wdir.is_dir():
                    rp_paths.append(wdir / "resource_packs")
                    rp_paths.append(wdir / "development_resource_packs")

        for base_path in rp_paths:
            if not base_path.exists():
                continue
            
            # Iterate through subfolders in resource packs
            for pack_dir in base_path.iterdir():
                if not pack_dir.is_dir():
                    continue
                
                if self.is_standard_pack(pack_dir.name):
                    continue

                # Check for manifest
                manifest_path = pack_dir / "manifest.json"
                if not manifest_path.exists():
                    continue
                
                # Scan item textures mapping
                item_tex_path = pack_dir / "textures" / "item_texture.json"
                if item_tex_path.exists():
                    try:
                        with open(item_tex_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            tex_data = data.get("texture_data", {})
                            for tex_key, tex_val in tex_data.items():
                                tex_info = tex_val.get("textures", "")
                                # textures can be a string or array
                                if isinstance(tex_info, list) and len(tex_info) > 0:
                                    tex_info = tex_info[0]
                                if isinstance(tex_info, str):
                                    texture_mappings[tex_key] = {
                                        "pack_dir": pack_dir.name,
                                        "path": f"{tex_info}.png" if not tex_info.endswith(".png") else tex_info
                                    }
                    except Exception as e:
                        print(f"Error reading item_texture.json in {pack_dir.name}: {e}")

                # Scan block/terrain textures mapping
                terrain_tex_path = pack_dir / "textures" / "terrain_texture.json"
                if terrain_tex_path.exists():
                    try:
                        with open(terrain_tex_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            tex_data = data.get("texture_data", {})
                            for tex_key, tex_val in tex_data.items():
                                tex_info = tex_val.get("textures", "")
                                # terrains can also be lists or nested objects (like block faces)
                                if isinstance(tex_info, dict):
                                    # Take any face e.g. "up" or "side"
                                    for face_key, face_val in tex_info.items():
                                        if isinstance(face_val, str):
                                            tex_info = face_val
                                            break
                                        elif isinstance(face_val, list) and len(face_val) > 0:
                                            tex_info = face_val[0]
                                            break
                                elif isinstance(tex_info, list) and len(tex_info) > 0:
                                    tex_info = tex_info[0]
                                
                                if isinstance(tex_info, str):
                                    texture_mappings[tex_key] = {
                                        "pack_dir": pack_dir.name,
                                        "path": f"{tex_info}.png" if not tex_info.endswith(".png") else tex_info
                                    }
                    except Exception as e:
                        print(f"Error reading terrain_texture.json in {pack_dir.name}: {e}")

        # 3. Scan behavior packs to find items/blocks/entities
        bp_paths = [
            server_root / "development_behavior_packs",
            server_root / "behavior_packs"
        ]
        
        # Add world-specific behavior pack directories
        worlds_dir = server_root / "worlds"
        if worlds_dir.exists():
            for wdir in worlds_dir.iterdir():
                if wdir.is_dir():
                    bp_paths.append(wdir / "behavior_packs")
                    bp_paths.append(wdir / "development_behavior_packs")

        for base_path in bp_paths:
            if not base_path.exists():
                continue
            
            for pack_dir in base_path.iterdir():
                if not pack_dir.is_dir():
                    continue
                
                if self.is_standard_pack(pack_dir.name):
                    continue

                manifest_path = pack_dir / "manifest.json"
                if not manifest_path.exists():
                    continue
                
                # Read pack name
                source_pack_name = pack_dir.name
                try:
                    with open(manifest_path, 'r', encoding='utf-8') as f:
                        mdata = json.load(f)
                        source_pack_name = mdata.get("header", {}).get("name", pack_dir.name)
                except:
                    pass

                # Scan Items
                items_folder = pack_dir / "items"
                if items_folder.exists():
                    for item_file in items_folder.glob("*.json"):
                        try:
                            with open(item_file, 'r', encoding='utf-8') as f:
                                idata = json.load(f)
                                item_def = idata.get("minecraft:item", {})
                                desc = item_def.get("description", {})
                                type_id = desc.get("identifier")
                                if not type_id or type_id.startswith("minecraft:"):
                                    continue
                                
                                # Category/Display Name extraction
                                display_name = type_id.split(":")[-1].replace("_", " ").title()
                                comps = item_def.get("components", {})
                                
                                # Try to get display name from component if defined
                                if "minecraft:display_name" in comps:
                                    dn = comps["minecraft:display_name"]
                                    if isinstance(dn, str):
                                        display_name = dn
                                    elif isinstance(dn, dict) and "value" in dn:
                                        display_name = dn["value"]
                                
                                # Texture mapping
                                texture_name = type_id.split(":")[-1]  # fallback texture key
                                if "minecraft:icon" in comps:
                                    icon_comp = comps["minecraft:icon"]
                                    if isinstance(icon_comp, str):
                                        texture_name = icon_comp
                                    elif isinstance(icon_comp, dict):
                                        # can be key "texture" or "textures"
                                        texture_name = icon_comp.get("texture", icon_comp.get("textures", texture_name))
                                
                                # Check texture details
                                tex_val = texture_mappings.get(texture_name)
                                tex_path = f"{tex_val['pack_dir']}/{tex_val['path']}" if tex_val else None

                                category = "Custom Item"
                                # Check if it acts as a storage box or has custom storage
                                if "minecraft:inventory" in comps:
                                    category = "Custom Storage"

                                scanned_items.append({
                                    "typeId": type_id,
                                    "displayName": display_name,
                                    "sourcePack": source_pack_name,
                                    "category": category,
                                    "texture": tex_path,
                                    "isCustom": 1
                                })
                        except Exception as e:
                            print(f"Error reading item file {item_file.name}: {e}")

                # Scan Blocks
                blocks_folder = pack_dir / "blocks"
                if blocks_folder.exists():
                    for block_file in blocks_folder.glob("*.json"):
                        try:
                            with open(block_file, 'r', encoding='utf-8') as f:
                                bdata = json.load(f)
                                block_def = bdata.get("minecraft:block", {})
                                desc = block_def.get("description", {})
                                type_id = desc.get("identifier")
                                if not type_id or type_id.startswith("minecraft:"):
                                    continue
                                
                                display_name = type_id.split(":")[-1].replace("_", " ").title()
                                # Terrain blocks textures map from blocks components
                                texture_name = type_id.split(":")[-1]
                                tex_val = texture_mappings.get(texture_name)
                                tex_path = f"{tex_val['pack_dir']}/{tex_val['path']}" if tex_val else None

                                scanned_items.append({
                                    "typeId": type_id,
                                    "displayName": display_name,
                                    "sourcePack": source_pack_name,
                                    "category": "Custom Block",
                                    "texture": tex_path,
                                    "isCustom": 1
                                })
                        except Exception as e:
                            print(f"Error reading block file {block_file.name}: {e}")

        if scanned_items:
            self.db_manager.save_item_registry(scanned_items)
            print(f"[ShulkerStudio] Scanned and saved {len(scanned_items)} custom items/blocks.")
        else:
            print("[ShulkerStudio] No new custom items/blocks found during pack scan.")
        
        return scanned_items
