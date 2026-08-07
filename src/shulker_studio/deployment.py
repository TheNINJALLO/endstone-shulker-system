import os
import shutil
import json
import time
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

class AddonDeploymentManager:
    def __init__(self, plugin_data_folder: Path, server_root: Path, config: Dict[str, Any], db_manager):
        self.plugin_data_folder = plugin_data_folder
        self.server_root = server_root
        self.config = config
        self.db_manager = db_manager
        self.backup_root = server_root / "backups"
        self.last_watch_check = 0.0

    def get_config_val(self, key: str, default: Any) -> Any:
        return self.config.get(key, default)

    def validate_manifest(self, manifest_path: Path) -> Tuple[bool, str, Dict[str, Any]]:
        if not manifest_path.exists():
            return False, "manifest.json does not exist", {}
        
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            header = data.get("header", {})
            uuid = header.get("uuid")
            version = header.get("version")
            name = header.get("name", "Unknown")

            if not uuid or not version:
                return False, "Missing header UUID or version in manifest", {}
            
            # Check modules
            modules = data.get("modules", [])
            if not modules:
                return False, "No modules declared in manifest", {}
                
            return True, "Success", {
                "uuid": uuid,
                "version": version,
                "name": name,
                "raw": data
            }
        except Exception as e:
            return False, f"Failed to parse manifest JSON: {e}", {}

    def backup_file(self, target_file: Path, backup_subfolder: str) -> Optional[Path]:
        if not target_file.exists():
            return None
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = self.backup_root / backup_subfolder
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        backup_path = backup_dir / f"{target_file.name}_{timestamp}"
        if target_file.is_dir():
            shutil.copytree(str(target_file), str(backup_path))
        else:
            shutil.copy2(str(target_file), str(backup_path))
        return backup_path

    def deploy_pack(self, src_pack_dir: Path, pack_type: str) -> Optional[Dict[str, Any]]:
        # pack_type is "behavior" or "resource"
        if not src_pack_dir.exists():
            print(f"[ShulkerStudio] Source pack directory not found: {src_pack_dir}")
            return None

        manifest_path = src_pack_dir / "manifest.json"
        is_valid, msg, manifest_info = self.validate_manifest(manifest_path)
        if not is_valid:
            print(f"[ShulkerStudio] Manifest validation failed for {pack_type} pack: {msg}")
            return None

        # Determine target folders based on configuration
        deploy_dev = self.get_config_val("deployToDevelopmentFolders", True)
        deploy_prod = self.get_config_val("deployToProductionFolders", False)
        
        dest_folders = []
        if deploy_dev:
            folder_name = "development_behavior_packs" if pack_type == "behavior" else "development_resource_packs"
            dest_folders.append(self.server_root / folder_name)
        if deploy_prod:
            folder_name = "behavior_packs" if pack_type == "behavior" else "resource_packs"
            dest_folders.append(self.server_root / folder_name)

        target_name = "shulker_studio_bp" if pack_type == "behavior" else "shulker_studio_rp"

        for dest_base in dest_folders:
            dest_base.mkdir(parents=True, exist_ok=True)
            target_dest = dest_base / target_name
            
            # Backup if it already exists
            if target_dest.exists():
                self.backup_file(target_dest, "deployment_backups")
            
            # Deploy files cleanly using lenient copy to handle Windows file locks
            self._copytree_lenient(src_pack_dir, target_dest)
            print(f"[ShulkerStudio] Deployed {pack_type} pack (lenient) to {target_dest}")
            
        # Register in DB
        self.db_manager.save_addon_registry(
            pack_id=manifest_info['uuid'],
            pack_type=pack_type,
            name=manifest_info['name'],
            version=".".join(map(str, manifest_info['version']))
        )

        return manifest_info

    def _copytree_lenient(self, src: Path, dst: Path):
        dst.mkdir(parents=True, exist_ok=True)
        for item in src.iterdir():
            s = src / item.name
            d = dst / item.name
            if s.is_dir():
                self._copytree_lenient(s, d)
            else:
                try:
                    shutil.copy2(str(s), str(d))
                except PermissionError as e:
                    print(f"[ShulkerStudio] Warning: Could not overwrite locked file {item.name}: {e}")
                except Exception as e:
                    print(f"[ShulkerStudio] Warning: Failed to copy {item.name}: {e}")

    def register_in_world_json(self, world_dir: Path, json_filename: str, pack_uuid: str, version: List[int]) -> bool:
        json_path = world_dir / json_filename
        
        # Load or create JSON list
        entries = []
        if json_path.exists():
            try:
                # Backup before modifying
                self.backup_file(json_path, "world_backups")
                with open(json_path, 'r', encoding='utf-8') as f:
                    entries = json.load(f)
            except Exception as e:
                print(f"[ShulkerStudio] Warning: Failed to read {json_path}. Overwriting. Error: {e}")
        
        if not isinstance(entries, list):
            entries = []
        else:
            # Clean up deprecated/old entries
            deprecated_uuids = {
                "e46c764e-289c-473d-9d41-450917e75459",
                "b7a7bebc-6bc2-466d-a3df-7b24320b9c3e",
                "fd082bb4-a82f-4a0d-b4f8-df1c1722e032",
                "a0f27c3e-e67c-47db-b82b-f1de13ea8cd2",
                "b2cf47e9-a29d-43c2-bf72-de36e921b7c1"
            }
            entries = [entry for entry in entries if entry.get("pack_id") not in deprecated_uuids]

        # Check if already registered
        for entry in entries:
            if entry.get("pack_id") == pack_uuid:
                # Update version if changed
                if entry.get("version") != version:
                    entry["version"] = version
                    # Save back
                    with open(json_path, 'w', encoding='utf-8') as f:
                        json.dump(entries, f, indent=2)
                    print(f"[ShulkerStudio] Updated version registration for {pack_uuid} in {json_filename}")
                return True
        
        # If not present, append
        entries.append({
            "pack_id": pack_uuid,
            "version": version
        })
        
        try:
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(entries, f, indent=2)
            print(f"[ShulkerStudio] Registered pack {pack_uuid} in {json_path.name}")
            return True
        except Exception as e:
            print(f"[ShulkerStudio] Failed to write to {json_path}: {e}")
            return False

    def deploy_and_register_all(self) -> bool:
        if not self.get_config_val("autoDeployAddons", True):
            print("[ShulkerStudio] Auto-deployment is disabled by config.")
            return False
            
        src_bp = self.plugin_data_folder / "addons" / "shulker_studio_bp"

        # Check if source directory or manifest exists, otherwise create templates
        if not src_bp.exists() or not (src_bp / "manifest.json").exists():
            self._create_addon_templates(src_bp)

        print("[ShulkerStudio] Starting deployment process...")
        bp_manifest = self.deploy_pack(src_bp, "behavior")

        if not bp_manifest:
            print("[ShulkerStudio] Deployment failed during pack copy.")
            return False

        # Register packs with configured worlds
        worlds = self.get_config_val("worlds", [])
        if not worlds:
            # Fallback: find any worlds in worlds/ directory
            worlds_dir = self.server_root / "worlds"
            if worlds_dir.exists():
                worlds = [w.name for w in worlds_dir.iterdir() if w.is_dir()]
        
        for wname in worlds:
            world_dir = self.server_root / "worlds" / wname
            if not world_dir.exists():
                print(f"[ShulkerStudio] World directory '{wname}' does not exist. Skipping registration.")
                continue
            
            # Register BP
            self.register_in_world_json(
                world_dir=world_dir,
                json_filename="world_behavior_packs.json",
                pack_uuid=bp_manifest['uuid'],
                version=bp_manifest['version']
            )

            # Clean up deprecated resource packs from world_resource_packs.json
            rp_json_path = world_dir / "world_resource_packs.json"
            if rp_json_path.exists():
                try:
                    with open(rp_json_path, 'r', encoding='utf-8') as f:
                        rp_entries = json.load(f)
                    if isinstance(rp_entries, list):
                        deprecated_uuids = {
                            "e46c764e-289c-473d-9d41-450917e75459",
                            "b7a7bebc-6bc2-466d-a3df-7b24320b9c3e",
                            "fd082bb4-a82f-4a0d-b4f8-df1c1722e032",
                            "a0f27c3e-e67c-47db-b82b-f1de13ea8cd2",
                            "b2cf47e9-a29d-43c2-bf72-de36e921b7c1"
                        }
                        new_rp_entries = [entry for entry in rp_entries if entry.get("pack_id") not in deprecated_uuids]
                        if len(new_rp_entries) != len(rp_entries):
                            if new_rp_entries:
                                with open(rp_json_path, 'w', encoding='utf-8') as f:
                                    json.dump(new_rp_entries, f, indent=2)
                            else:
                                os.remove(rp_json_path)
                            print(f"[ShulkerStudio] Cleaned up deprecated resource pack entries in {rp_json_path.name}")
                except Exception as e:
                    print(f"[ShulkerStudio] Warning: Failed to clean up {rp_json_path}: {e}")

        print("[ShulkerStudio] Auto-deployment completed successfully.")
        return True

    def _create_addon_templates(self, bp_path: Path):
        # Create directories
        bp_path.mkdir(parents=True, exist_ok=True)
        (bp_path / "scripts").mkdir(parents=True, exist_ok=True)

        bp_uuid = "e74f1b8a-9cd2-43c2-bf72-de36e921b7c2"
        bp_module_uuid = "c2cf47e9-a29d-43c2-bf72-de36e921b7d5"

        # Write BP manifest
        bp_manifest = {
            "format_version": 2,
            "header": {
                "name": "Shulker Studios Addon (BP)",
                "description": "Auto-generated Bedrock Script API system for Shulker Studio",
                "uuid": bp_uuid,
                "version": [1, 0, 0],
                "min_engine_version": [1, 20, 120]
            },
            "modules": [
                {
                    "type": "script",
                    "uuid": bp_module_uuid,
                    "version": [1, 0, 0],
                    "entry": "scripts/main.js"
                }
            ],
            "dependencies": [
                {
                    "module_name": "@minecraft/server",
                    "version": "beta"
                }
            ]
        }
        with open(bp_path / "manifest.json", 'w', encoding='utf-8') as f:
            json.dump(bp_manifest, f, indent=2)

        # Write default empty main.js to prevent script load error if it doesn't exist
        js_path = bp_path / "scripts" / "main.js"
        if not js_path.exists():
            with open(js_path, 'w', encoding='utf-8') as f:
                f.write("// Shulker Studio Script API - Main\nconsole.warn('[ShulkerStudio] Script loaded!');\n")

    def check_development_watch(self) -> bool:
        # Development watch to auto-redeploy files when they change in plugins/shulker_studio/addons/
        if not self.get_config_val("developmentMode", True) or not self.get_config_val("autoRedeploy", True):
            return False

        src_addons = self.plugin_data_folder / "addons"
        if not src_addons.exists():
            return False

        # Gather max modification time recursively
        max_mtime = 0.0
        try:
            for root, dirs, files in os.walk(str(src_addons)):
                for file in files:
                    file_path = Path(root) / file
                    mtime = file_path.stat().st_mtime
                    if mtime > max_mtime:
                        max_mtime = mtime
        except Exception:
            return False

        if self.last_watch_check == 0.0:
            self.last_watch_check = max_mtime
            return False

        if max_mtime > self.last_watch_check:
            print("[ShulkerStudio] Detected changes in source addon files. Redeploying...")
            self.last_watch_check = max_mtime
            self.deploy_and_register_all()
            return True

        return False
