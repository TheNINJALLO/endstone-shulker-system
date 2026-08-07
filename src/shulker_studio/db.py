import os
import sqlite3
import json
import hashlib
import binascii
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

class DatabaseManager:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        # Create directories if they don't exist
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        with self._get_conn() as conn:
            cursor = conn.cursor()
            
            # Users table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL, -- Owner, Admin, Moderator, Viewer
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
            
            # Sessions table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
            )
            """)
            
            # Templates table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                shulker_type TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
            
            # Template slots table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS template_slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id INTEGER NOT NULL,
                slot INTEGER NOT NULL, -- 0-26
                type_id TEXT NOT NULL,
                amount INTEGER NOT NULL DEFAULT 1,
                name_tag TEXT,
                lore TEXT, -- JSON array of strings
                enchantments TEXT, -- JSON object of typeId -> level
                keep_on_death INTEGER DEFAULT 0, -- 0 or 1
                lock_mode TEXT, -- e.g. "none", "lock_in_slot", "lock_in_inventory"
                custom_metadata TEXT,
                potion_effect_type TEXT,
                FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
                UNIQUE(template_id, slot)
            )
            """)
            
            # Deliveries table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS deliveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                template_name TEXT,
                shulker_type TEXT NOT NULL,
                slots_data TEXT NOT NULL, -- JSON array of slots
                status TEXT NOT NULL, -- PENDING, DELIVERED, FAILED, SCHEDULED
                error_message TEXT,
                delivery_method TEXT NOT NULL, -- Feet, Give, Queue, Schedule, Join
                scheduled_time TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                delivered_at TIMESTAMP
            )
            """)
            
            # Audit logs table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
            
            # Item registry table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS item_registry (
                type_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                source_pack TEXT NOT NULL,
                category TEXT NOT NULL, -- Vanilla Item, Custom Item, Vanilla Block, Custom Block, etc.
                texture TEXT,
                is_custom INTEGER DEFAULT 0,
                potion_effect_type TEXT
            )
            """)
            
            # Addon registry table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS addon_registry (
                pack_id TEXT PRIMARY KEY,
                pack_type TEXT NOT NULL, -- behavior, resource
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)

            # Migrations for adding potion_effect_type to item_registry and template_slots
            try:
                cursor.execute("ALTER TABLE item_registry ADD COLUMN potion_effect_type TEXT")
            except sqlite3.OperationalError:
                pass
            
            try:
                cursor.execute("ALTER TABLE template_slots ADD COLUMN potion_effect_type TEXT")
            except sqlite3.OperationalError:
                pass
            
            conn.commit()

        # Seed initial Owner user if not exists
        self.create_default_owner_if_absent()

    # --- Secure Password Hashing Utilities ---
    @staticmethod
    def hash_password(password: str) -> str:
        salt = hashlib.sha256(os.urandom(60)).hexdigest().encode('ascii')
        pwdhash = hashlib.pbkdf2_hmac('sha512', password.encode('utf-8'), salt, 100000)
        pwdhash = binascii.hexlify(pwdhash)
        return (salt + pwdhash).decode('ascii')

    @staticmethod
    def verify_password(stored_password: str, provided_password: str) -> bool:
        salt = stored_password[:64].encode('ascii')
        stored_hash = stored_password[64:]
        pwdhash = hashlib.pbkdf2_hmac('sha512', provided_password.encode('utf-8'), salt, 100000)
        pwdhash = binascii.hexlify(pwdhash).decode('ascii')
        return pwdhash == stored_hash

    # --- User & Auth Operations ---
    def create_user(self, username: str, password_raw: str, role: str) -> bool:
        pw_hash = self.hash_password(password_raw)
        try:
            with self._get_conn() as conn:
                conn.execute(
                    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                    (username, pw_hash, role)
                )
                conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False

    def create_default_owner_if_absent(self):
        with self._get_conn() as conn:
            row = conn.execute("SELECT count(*) as count FROM users").fetchone()
            if row['count'] == 0:
                self.create_user("admin", "admin1234", "Owner")

    def get_user(self, username: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            return dict(row) if row else None

    def list_users(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT username, role, created_at FROM users").fetchall()
            return [dict(r) for r in rows]

    def delete_user(self, username: str) -> bool:
        with self._get_conn() as conn:
            cursor = conn.execute("DELETE FROM users WHERE username = ?", (username,))
            conn.commit()
            return cursor.rowcount > 0

    # --- Session Management ---
    def create_session(self, username: str, token: str, duration_hours: int = 24) -> bool:
        expires_at = datetime.datetime.now() + datetime.timedelta(hours=duration_hours)
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)",
                (token, username, expires_at.strftime('%Y-%m-%d %H:%M:%S'))
            )
            conn.commit()
        return True

    def get_session(self, token: str) -> Optional[Dict[str, Any]]:
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE token = ? AND expires_at > ?", 
                (token, now_str)
            ).fetchone()
            return dict(row) if row else None

    def delete_session(self, token: str):
        with self._get_conn() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()

    # --- Templates Operations ---
    def save_template(self, name: str, shulker_type: str, slots: List[Dict[str, Any]]) -> Optional[int]:
        try:
            with self._get_conn() as conn:
                # Insert or update templates
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO templates (name, shulker_type, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
                    "ON CONFLICT(name) DO UPDATE SET shulker_type = excluded.shulker_type, updated_at = CURRENT_TIMESTAMP",
                    (name, shulker_type)
                )
                
                # Get template ID
                row = cursor.execute("SELECT id FROM templates WHERE name = ?", (name,)).fetchone()
                template_id = row['id']
                
                # Delete existing slots for this template
                cursor.execute("DELETE FROM template_slots WHERE template_id = ?", (template_id,))
                
                # Insert new slots
                for s in slots:
                    cursor.execute(
                        "INSERT INTO template_slots (template_id, slot, type_id, amount, name_tag, lore, enchantments, keep_on_death, lock_mode, custom_metadata, potion_effect_type) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            template_id,
                            s['slot'],
                            s['typeId'],
                            s.get('amount', 1),
                            s.get('nameTag'),
                            json.dumps(s.get('lore', [])),
                            json.dumps(s.get('enchantments', {})),
                            1 if s.get('keepOnDeath', False) else 0,
                            s.get('lockMode', 'none'),
                            s.get('customMetadata'),
                            s.get('potionEffectType')
                        )
                    )
                conn.commit()
                return template_id
        except Exception as e:
            print(f"Error saving template: {e}")
            return None

    def get_template(self, name: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            tpl_row = conn.execute("SELECT * FROM templates WHERE name = ?", (name,)).fetchone()
            if not tpl_row:
                return None
            
            tpl = dict(tpl_row)
            slots_rows = conn.execute("SELECT * FROM template_slots WHERE template_id = ?", (tpl['id'],)).fetchall()
            
            slots = []
            for r in slots_rows:
                slots.append({
                    "slot": r['slot'],
                    "typeId": r['type_id'],
                    "amount": r['amount'],
                    "nameTag": r['name_tag'],
                    "lore": json.loads(r['lore']) if r['lore'] else [],
                    "enchantments": json.loads(r['enchantments']) if r['enchantments'] else {},
                    "keepOnDeath": bool(r['keep_on_death']),
                    "lockMode": r['lock_mode'] or 'none',
                    "customMetadata": r['custom_metadata'],
                    "potionEffectType": r['potion_effect_type']
                })
            tpl['contents'] = slots
            return tpl

    def list_templates(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT id, name, shulker_type, created_at, updated_at FROM templates ORDER BY name ASC").fetchall()
            return [dict(r) for r in rows]

    def delete_template(self, name: str) -> bool:
        with self._get_conn() as conn:
            cursor = conn.execute("DELETE FROM templates WHERE name = ?", (name,))
            conn.commit()
            return cursor.rowcount > 0

    # --- Deliveries Operations ---
    def create_delivery(self, player_name: str, template_name: Optional[str], shulker_type: str, slots_data: List[Dict[str, Any]], method: str, scheduled_time: Optional[str] = None) -> int:
        status = "SCHEDULED" if scheduled_time else "PENDING"
        with self._get_conn() as conn:
            cursor = conn.execute(
                "INSERT INTO deliveries (player_name, template_name, shulker_type, slots_data, status, delivery_method, scheduled_time) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (player_name, template_name, shulker_type, json.dumps(slots_data), status, method, scheduled_time)
            )
            conn.commit()
            return cursor.lastrowid

    def update_delivery_status(self, delivery_id: int, status: str, error_message: Optional[str] = None):
        delivered_at = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S') if status in ("DELIVERED", "FAILED") else None
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE deliveries SET status = ?, error_message = ?, delivered_at = ? WHERE id = ?",
                (status, error_message, delivered_at, delivery_id)
            )
            conn.commit()

    def get_pending_deliveries(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM deliveries WHERE status = 'PENDING'").fetchall()
            deliveries = []
            for r in rows:
                d = dict(r)
                d['slots_data'] = json.loads(d['slots_data'])
                deliveries.append(d)
            return deliveries

    def get_scheduled_deliveries(self) -> List[Dict[str, Any]]:
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM deliveries WHERE status = 'SCHEDULED' AND scheduled_time <= ?", (now_str,)).fetchall()
            deliveries = []
            for r in rows:
                d = dict(r)
                d['slots_data'] = json.loads(d['slots_data'])
                deliveries.append(d)
            return deliveries

    def get_delivery_logs(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM deliveries ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            logs = []
            for r in rows:
                l = dict(r)
                l['slots_data'] = json.loads(l['slots_data'])
                logs.append(l)
            return logs

    # --- Audit Logging ---
    def log_action(self, username: str, action: str, details: str):
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)",
                (username, action, details)
            )
            conn.commit()

    def get_audit_logs(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    # --- Item & Addon Registries ---
    def save_item_registry(self, items: List[Dict[str, Any]]):
        with self._get_conn() as conn:
            for item in items:
                conn.execute(
                    "INSERT INTO item_registry (type_id, display_name, source_pack, category, texture, is_custom, potion_effect_type) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?) "
                    "ON CONFLICT(type_id) DO UPDATE SET display_name = excluded.display_name, source_pack = excluded.source_pack, "
                    "category = excluded.category, texture = excluded.texture, is_custom = excluded.is_custom, potion_effect_type = excluded.potion_effect_type",
                    (item['typeId'], item['displayName'], item['sourcePack'], item['category'], item['texture'], item.get('isCustom', 0), item.get('potionEffectType'))
                )
            conn.commit()

    def get_registered_items(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM item_registry").fetchall()
            return [dict(r) for r in rows]

    def update_registered_item(self, type_id: str, display_name: str, category: str, texture: Optional[str], potion_effect_type: Optional[str]) -> bool:
        with self._get_conn() as conn:
            cursor = conn.execute(
                "UPDATE item_registry SET display_name = ?, category = ?, texture = ?, potion_effect_type = ? WHERE type_id = ?",
                (display_name, category, texture, potion_effect_type, type_id)
            )
            conn.commit()
            return cursor.rowcount > 0

    def add_registered_item(self, type_id: str, display_name: str, source_pack: str, category: str, texture: Optional[str], is_custom: int, potion_effect_type: Optional[str]) -> bool:
        try:
            with self._get_conn() as conn:
                conn.execute(
                    "INSERT INTO item_registry (type_id, display_name, source_pack, category, texture, is_custom, potion_effect_type) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (type_id, display_name, source_pack, category, texture, is_custom, potion_effect_type)
                )
                conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False

    def delete_registered_item(self, type_id: str) -> bool:
        with self._get_conn() as conn:
            cursor = conn.execute("DELETE FROM item_registry WHERE type_id = ?", (type_id,))
            conn.commit()
            return cursor.rowcount > 0

    def save_addon_registry(self, pack_id: str, pack_type: str, name: str, version: str):
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO addon_registry (pack_id, pack_type, name, version) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(pack_id) DO UPDATE SET pack_type = excluded.pack_type, name = excluded.name, "
                "version = excluded.version, deployed_at = CURRENT_TIMESTAMP",
                (pack_id, pack_type, name, version)
            )
            conn.commit()

    def get_registered_addons(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM addon_registry").fetchall()
            return [dict(r) for r in rows]
