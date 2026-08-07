import urllib.request
import urllib.error
import json
import time
import threading
import traceback
from typing import List, Dict, Any

class TebexPoller:
    def __init__(self, plugin):
        self.plugin = plugin
        self.secret_key = plugin.config_data.get("tebexSecretKey", "")
        self.check_interval = 120  # default interval in seconds (updated dynamically by Tebex)
        self.running = False
        self.thread = None
        self.logger = plugin.logger

    def start(self):
        if not self.secret_key:
            self.logger.info("Tebex built-in API polling is disabled (tebexSecretKey is empty).")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._poll_loop, daemon=True)
        self.thread.start()
        self.logger.info("Tebex built-in API polling started.")

    def stop(self):
        self.running = False
        self.logger.info("Tebex built-in API polling stopped.")

    def _poll_loop(self):
        # Initial sleep of 10 seconds to allow server boot logic to complete
        time.sleep(10)
        while self.running:
            try:
                self._check_queue()
            except Exception as e:
                self.logger.error(f"Error in Tebex poll loop: {e}")
                self.logger.error(traceback.format_exc())
            
            # Sleep respect next_check interval
            sleep_time = max(10, self.check_interval)
            # Sleep in small increments to be able to stop quickly
            for _ in range(int(sleep_time)):
                if not self.running:
                    break
                time.sleep(1)

    def _make_request(self, endpoint: str, method: str = "GET", data: Dict[str, Any] = None) -> Any:
        url = f"https://plugin.tebex.io{endpoint}"
        headers = {
            "X-Tebex-Secret": self.secret_key,
            "User-Agent": "Endstone-Shulker-System-Poller/1.0"
        }
        
        req_data = None
        if data is not None:
            req_data = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"
            
        req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                response_body = res.read().decode("utf-8")
                if response_body:
                    return json.loads(response_body)
                return {}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8") if e else ""
            self.logger.error(f"Tebex API HTTP Error {e.code}: {e.reason} - Body: {body}")
            raise e
        except Exception as e:
            self.logger.error(f"Tebex API request failed: {e}")
            raise e

    def _check_queue(self):
        # 1. Get Due Players & Queue metadata
        self.logger.info("Polling Tebex command queue...")
        queue_data = self._make_request("/queue")
        if not queue_data:
            return

        # Update check interval dynamically as requested by Tebex to respect rate limits
        meta = queue_data.get("meta", {})
        next_check = meta.get("next_check", 120)
        if next_check != self.check_interval:
            self.check_interval = next_check
            self.logger.info(f"Tebex check interval updated to {next_check} seconds.")

        executed_command_ids = []

        # 2. Process offline commands if execute_offline is True
        execute_offline = meta.get("execute_offline", False)
        if execute_offline:
            self.logger.info("Fetching Tebex offline commands...")
            offline_data = self._make_request("/queue/offline-commands")
            if offline_data and "commands" in offline_data:
                for cmd in offline_data["commands"]:
                    cmd_id = cmd.get("id")
                    command_str = cmd.get("command")
                    player_info = cmd.get("player", {})
                    player_name = player_info.get("name")
                    player_uuid = player_info.get("uuid")
                    
                    self.logger.info(f"Processing Tebex offline command {cmd_id}: {command_str}")
                    success = self._execute_tebex_command(command_str, player_name, player_uuid, cmd.get("payment"))
                    if success:
                        executed_command_ids.append(cmd_id)

        # 3. Process online commands for online players
        players = queue_data.get("players", [])
        for p in players:
            player_name = p.get("name")
            player_id = p.get("id")
            player_uuid = p.get("uuid")
            
            # Check if player is currently online in the game server
            online_player = self.plugin.server.get_player(player_name)
            if not online_player and player_uuid:
                # Also check by uuid/xuid
                online_player = self.plugin.server.get_player(player_uuid)
                
            if online_player:
                self.logger.info(f"Player {player_name} is online. Fetching pending Tebex commands...")
                online_commands = self._make_request(f"/queue/online-commands/{player_id}")
                if online_commands and "commands" in online_commands:
                    for cmd in online_commands["commands"]:
                        cmd_id = cmd.get("id")
                        command_str = cmd.get("command")
                        
                        self.logger.info(f"Processing Tebex online command {cmd_id}: {command_str}")
                        success = self._execute_tebex_command(command_str, player_name, player_uuid, cmd.get("payment"))
                        if success:
                            executed_command_ids.append(cmd_id)

        # 4. Confirm execution to Tebex to delete completed commands from queue
        if executed_command_ids:
            self.logger.info(f"Confirming execution for Tebex commands to clear queue: {executed_command_ids}")
            try:
                self._make_request("/queue", method="DELETE", data={"ids": executed_command_ids})
            except Exception as e:
                self.logger.error(f"Failed to clear commands {executed_command_ids} from Tebex queue: {e}")

    def _execute_tebex_command(self, command_str: str, player_name: str, player_uuid: str, payment_id: str) -> bool:
        try:
            # Replace placeholders
            parsed_command = command_str
            if "{username}" in parsed_command:
                parsed_command = parsed_command.replace("{username}", player_name or "")
            if "{id}" in parsed_command:
                parsed_command = parsed_command.replace("{id}", player_uuid or "")
            if "{transaction}" in parsed_command:
                parsed_command = parsed_command.replace("{transaction}", payment_id or "")
            if "{payment}" in parsed_command:
                parsed_command = parsed_command.replace("{payment}", payment_id or "")
            
            # Remove leading slash if present (Minecraft server console commands do not prefix with slash)
            if parsed_command.startswith("/"):
                parsed_command = parsed_command[1:]

            # Dispatch command safely on main thread via Endstone scheduler
            self.logger.info(f"Scheduling Tebex command for execution: {parsed_command}")
            
            def run_cmd():
                self.plugin.server.dispatch_command(self.plugin.server.command_sender, parsed_command)
                
            self.plugin.server.scheduler.run_task(self.plugin, run_cmd)
            return True
        except Exception as e:
            self.logger.error(f"Failed to parse or dispatch Tebex command '{command_str}': {e}")
            return False
