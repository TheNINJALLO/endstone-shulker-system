import os
import json
import threading
import datetime
from pathlib import Path
from typing import Dict, Any

from endstone.plugin import Plugin
from endstone.event import event_handler, PlayerJoinEvent, ScriptMessageEvent
from endstone.command import Command, CommandSender

from shulker_studio.db import DatabaseManager
from shulker_studio.scanner import ContentScanner
from shulker_studio.deployment import AddonDeploymentManager
from shulker_studio.web import create_app

class ShulkerStudio(Plugin):
    api_version = "0.11"
    
    # Declare commands dictionary to handle Tebex integration console command
    commands = {
        "shulkertebex": {
            "description": "Handle Tebex donations and deliveries",
            "usages": ["/shulkertebex <player> <package_name>"],
            "permissions": ["shulker_studio.tebex"]
        }
    }

    permissions = {
        "shulker_studio.tebex": {
            "description": "Allow triggering Tebex packages",
            "default": "op"
        }
    }

    def on_load(self) -> None:
        self.logger.info("ShulkerStudio plugin loaded. Initializing assets...")

        # 1. Initialize configuration
        self.save_default_config()
        self.config_data = self._load_config()

        # 2. Initialize database
        db_path = self.data_folder / "shulker_studio.db"
        self.db = DatabaseManager(db_path)

        # 3. Initialize content scanner
        self.scanner = ContentScanner(self.db)
        
        # 3.5 Sync built addon assets from workspace package to plugin data folder
        try:
            import shulker_studio
            package_dir = Path(shulker_studio.__file__).parent
            
            src_addons = package_dir / "addons"
            dest_addons = self.data_folder / "addons"
            if src_addons.exists():
                self.logger.info(f"Syncing addon assets from {src_addons} to {dest_addons}")
                self._copytree_lenient(src_addons, dest_addons)
        except Exception as ex:
            self.logger.warning(f"Could not automatically sync workspace build assets: {ex}")

        # 4. Initialize deployment manager
        self.deployment = AddonDeploymentManager(
            plugin_data_folder=self.data_folder,
            server_root=self.server_root,
            config=self.config_data,
            db_manager=self.db
        )

    def on_enable(self) -> None:
        self.logger.info("ShulkerStudio plugin enabling...")

        # 6. Register event listeners
        self.register_events(self)

        # 7. Start FastAPI web server on port 9020
        import shulker_studio
        package_dir = Path(shulker_studio.__file__).parent
        dashboard_dir = package_dir / "dashboard" / "dist"
        self.app = create_app(self.db, self, dashboard_dir)
        self._start_web_server()

        # 8. Run scanning, dynamic seeder, and texture retrieval when server is fully enabled
        try:
            self.logger.info("Retrieving and updating custom textures from resource packs...")
            self.scanner.retrieve_and_update_textures(self.server_root, self.data_folder)
            self.scanner.scan_packs(self.server_root, self.server)
        except Exception as e:
            self.logger.error(f"Failed to scan addon content packs and textures: {e}")

        # 9. Start ticks scheduler (every 5 seconds = 100 ticks)
        # Periodically process scheduled tasks and watch files
        self.server.scheduler.run_task(self, self._on_tick_timer, delay=0, period=100)

        # 10. Start the built-in Tebex API Poller
        from shulker_studio.tebex_poller import TebexPoller
        self.tebex_poller = TebexPoller(self)
        self.tebex_poller.start()

        self.logger.info("ShulkerStudio plugin fully enabled!")

    def on_disable(self) -> None:
        self.logger.info("ShulkerStudio plugin disabling...")
        
        # Stop Tebex API Poller
        if hasattr(self, "tebex_poller"):
            try:
                self.tebex_poller.stop()
            except Exception as e:
                self.logger.error(f"Error stopping Tebex API Poller: {e}")

        # Web server is running in a daemon thread and will shut down with the process
        self.logger.info("ShulkerStudio plugin disabled.")

    def on_command(self, sender: CommandSender, command: Command, args: list[str]) -> bool:
        if command.name == "shulkertebex":
            # Strict validation: command can only be executed by the server console
            if sender != self.server.command_sender:
                sender.send_error_message("This command can only be executed by the server console.")
                return True
            
            if len(args) < 2:
                sender.send_message("Usage: /shulkertebex <player> <package_name>")
                return True
            
            player_name = args[0]
            package_name = args[1]
            
            from shulker_studio.tebex_rewards import process_tebex_package
            self.server.scheduler.run_task(self, lambda: process_tebex_package(self, player_name, package_name))
            return True
        return False

    @property
    def server_root(self) -> Path:
        # data_folder is: server_root/plugins/shulker_studio
        # We go up two levels to get server_root
        return self.data_folder.parent.parent

    def _copytree_lenient(self, src: Path, dst: Path):
        dst.mkdir(parents=True, exist_ok=True)
        for item in src.iterdir():
            s = src / item.name
            d = dst / item.name
            if s.is_dir():
                self._copytree_lenient(s, d)
            else:
                try:
                    import shutil
                    shutil.copy2(str(s), str(d))
                except PermissionError as e:
                    self.logger.warning(f"Could not overwrite locked file {item.name}: {e}")
                except Exception as e:
                    self.logger.warning(f"Failed to copy {item.name}: {e}")

    def _load_config(self) -> Dict[str, Any]:
        # Config property is a dict-like object provided by Endstone
        config_data = {
            "autoDeployAddons": self.config.get("autoDeployAddons", True),
            "deployToDevelopmentFolders": self.config.get("deployToDevelopmentFolders", True),
            "deployToProductionFolders": self.config.get("deployToProductionFolders", False),
            "developmentMode": self.config.get("developmentMode", True),
            "autoRedeploy": self.config.get("autoRedeploy", True),
            "worlds": self.config.get("worlds", []),
            "port": self.config.get("port", 9020),
            "tebexSecretKey": self.config.get("tebexSecretKey", "")
        }
        return config_data

    def _start_web_server(self):
        import uvicorn
        port = self.config_data.get("port", 9020)
        
        def run():
            try:
                self.logger.info(f"Starting web dashboard server on port {port}...")
                uvicorn.run(self.app, host="0.0.0.0", port=port, log_level="warning")
            except Exception as e:
                self.logger.error(f"Failed to start uvicorn web server: {e}")

        self.api_thread = threading.Thread(target=run, daemon=True)
        self.api_thread.start()

    def _on_tick_timer(self):
        # 1. Process development watch redeployment
        try:
            self.deployment.check_development_watch()
        except Exception as e:
            self.logger.error(f"Error checking development watch: {e}")

        # 2. Process scheduled deliveries
        try:
            now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            scheduled = self.db.get_scheduled_deliveries()
            for delivery in scheduled:
                player = self.server.get_player(delivery["player_name"])
                if player:
                    # Target player is online, dispatch now
                    self._dispatch_delivery(delivery)
        except Exception as e:
            self.logger.error(f"Error processing scheduled deliveries: {e}")

    def _dispatch_delivery(self, delivery: Dict[str, Any]):
        player = self.server.get_player(delivery["player_name"])
        if not player:
            return

        job_data = {
            "jobId": delivery["id"],
            "player": player.name,
            "shulker": delivery["shulker_type"],
            "method": delivery["delivery_method"],
            "slots": delivery["slots_data"]
        }

        # JSON-serialize job_data and chunk it to bypass Bedrock's 2048-char scriptevent message limit
        json_str = json.dumps(job_data)
        # Using chunk_size of 900 chars = 1800 hex chars, safely under the 2048 limit
        chunk_size = 900
        chunks = [json_str[i:i+chunk_size] for i in range(0, len(json_str), chunk_size)]
        total_chunks = len(chunks)

        for idx, chunk in enumerate(chunks):
            # Hex encode the chunk string (convert to bytes first using UTF-8)
            hex_chunk = chunk.encode('utf-8').hex()
            # Format: jobId_index_total_hexData (avoids any quotes, spaces, or braces in command args)
            payload_str = f"{delivery['id']}_{idx}_{total_chunks}_{hex_chunk}"
            cmd = f"scriptevent shulker_studio:deliver_chunk {payload_str}"
            self.server.dispatch_command(self.server.command_sender, cmd)
        
        # Mark as pending delivery (awaiting script callback)
        self.db.update_delivery_status(delivery["id"], "PENDING", f"Delivery hex-chunks (x{total_chunks}) dispatched to online player.")

    # --- Event Handlers ---
    @event_handler
    def on_player_join(self, event: PlayerJoinEvent):
        player = event.player
        # Check for any pending rewards for this joining player
        try:
            pending = self.db.get_pending_deliveries()
            for delivery in pending:
                if delivery["player_name"].lower() == player.name.lower():
                    # Dispatch reward
                    self._dispatch_delivery(delivery)
        except Exception as e:
            self.logger.error(f"Error checking pending deliveries for joining player {player.name}: {e}")

    @event_handler
    def on_script_message(self, event: ScriptMessageEvent):
        # Handle delivery confirmation from Script API
        if event.message_id == "shulker_studio:confirm":
            try:
                data = json.loads(event.message)
                job_id = int(data.get("jobId"))
                status = data.get("status") # success, failed
                error_msg = data.get("error")

                self.logger.info(f"Received delivery confirmation for job {job_id}: {status} (error: {error_msg})")
                
                db_status = "DELIVERED" if status == "success" else "FAILED"
                self.db.update_delivery_status(job_id, db_status, error_msg if db_status == "FAILED" else None)
                
                # Audit log
                self.db.log_action(
                    username="SYSTEM_SCRIPT_API",
                    action="Confirm Delivery",
                    details=f"Job {job_id} confirmed as {db_status}. Player: {data.get('player')}"
                )
            except Exception as e:
                self.logger.error(f"Failed to process script confirmation event message: {e}")
