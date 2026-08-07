import json
import secrets
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Request, Response, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from shulker_studio.db import DatabaseManager

class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: str

class SlotSchema(BaseModel):
    slot: int
    typeId: str
    amount: int = 1
    nameTag: Optional[str] = None
    lore: Optional[List[str]] = []
    enchantments: Optional[Dict[str, int]] = {}
    keepOnDeath: Optional[bool] = False
    lockMode: Optional[str] = "none"
    customMetadata: Optional[str] = None
    potionEffectType: Optional[str] = None

class TemplateSchema(BaseModel):
    name: str
    shulker_type: str
    contents: List[SlotSchema]

class DeliverRequest(BaseModel):
    player_name: str
    template_name: Optional[str] = None
    shulker_type: str = "minecraft:purple_shulker_box"
    slots: List[SlotSchema]
    method: str = "Give" # Give, Feet, Join, Schedule
    scheduled_time: Optional[str] = None

class RegistryItemEditSchema(BaseModel):
    displayName: str
    category: str
    texture: Optional[str] = None
    potionEffectType: Optional[str] = None

class RegistryItemAddSchema(BaseModel):
    typeId: str
    displayName: str
    sourcePack: str
    category: str
    texture: Optional[str] = None
    isCustom: int = 0
    potionEffectType: Optional[str] = None

def create_app(db: DatabaseManager, plugin_ref, dashboard_dir: Path):
    app = FastAPI(title="The Kingdom Shulker Studio API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Helper: Check Session & Role
    def get_current_user(request: Request):
        session_token = request.cookies.get("session_token")
        if not session_token:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                session_token = auth_header.split(" ")[1]

        if not session_token:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        session = db.get_session(session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired or invalid")
        
        user = db.get_user(session["username"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user

    def require_role(allowed_roles: List[str]):
        def dependency(user = Depends(get_current_user)):
            if user["role"] not in allowed_roles:
                raise HTTPException(status_code=403, detail="Permission denied")
            return user
        return dependency

    # --- Authentication Endpoints ---
    @app.post("/api/auth/login")
    def login(payload: LoginRequest, response: Response):
        user = db.get_user(payload.username)
        if not user or not db.verify_password(user["password_hash"], payload.password):
            raise HTTPException(status_code=400, detail="Invalid username or password")
        
        token = secrets.token_hex(32)
        db.create_session(user["username"], token)
        response.set_cookie(key="session_token", value=token, httponly=True, samesite="lax")
        db.log_action(user["username"], "Login", f"Successfully logged in from IP")
        return {"status": "success", "username": user["username"], "role": user["role"], "token": token}

    @app.post("/api/auth/logout")
    def logout(request: Request, response: Response):
        token = request.cookies.get("session_token")
        if token:
            db.delete_session(token)
        response.delete_cookie("session_token")
        return {"status": "success"}

    @app.get("/api/auth/me")
    def me(user = Depends(get_current_user)):
        return {"username": user["username"], "role": user["role"]}

    # --- User Management (Owner Only) ---
    @app.post("/api/users")
    def create_user(payload: UserCreateRequest, current_user = Depends(require_role(["Owner"]))):
        if payload.role not in ("Owner", "Admin", "Moderator", "Viewer"):
            raise HTTPException(status_code=400, detail="Invalid role specified")
        
        success = db.create_user(payload.username, payload.password, payload.role)
        if not success:
            raise HTTPException(status_code=400, detail="Username already exists")
        
        db.log_action(current_user["username"], "Create User", f"Created user {payload.username} with role {payload.role}")
        return {"status": "success"}

    @app.get("/api/users")
    def list_users(current_user = Depends(require_role(["Owner"]))):
        return db.list_users()

    @app.delete("/api/users/{username}")
    def delete_user(username: str, current_user = Depends(require_role(["Owner"]))):
        if username == current_user["username"]:
            raise HTTPException(status_code=400, detail="Cannot delete yourself")
        
        success = db.delete_user(username)
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        
        db.log_action(current_user["username"], "Delete User", f"Deleted user {username}")
        return {"status": "success"}

    # --- Player Discovery ---
    @app.get("/api/players")
    def get_online_players(current_user = Depends(require_role(["Owner", "Admin", "Moderator", "Viewer"]))):
        # Queries Minecraft online players dynamically
        players = []
        try:
            for p in plugin_ref.server.online_players:
                players.append({
                    "name": p.name,
                    "uuid": str(p.unique_id),
                    "xuid": p.xuid,
                    "address": str(p.address) if hasattr(p, "address") else "",
                    "isOp": p.is_op
                })
        except Exception as e:
            print(f"Error querying online players: {e}")
        return players

    # --- Templates Management ---
    @app.get("/api/templates")
    def get_templates(current_user = Depends(require_role(["Owner", "Admin", "Moderator", "Viewer"]))):
        return db.list_templates()

    @app.get("/api/templates/{name}")
    def get_template(name: str, current_user = Depends(require_role(["Owner", "Admin", "Moderator", "Viewer"]))):
        template = db.get_template(name)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        return template

    @app.post("/api/templates")
    def save_template(payload: TemplateSchema, current_user = Depends(require_role(["Owner", "Admin"]))):
        slots_list = [s.model_dump() for s in payload.contents]
        template_id = db.save_template(payload.name, payload.shulker_type, slots_list)
        if not template_id:
            raise HTTPException(status_code=500, detail="Failed to save template")
        
        db.log_action(current_user["username"], "Save Template", f"Saved template '{payload.name}' containing {len(slots_list)} items")
        return {"status": "success", "template_id": template_id}

    @app.delete("/api/templates/{name}")
    def delete_template(name: str, current_user = Depends(require_role(["Owner", "Admin"]))):
        success = db.delete_template(name)
        if not success:
            raise HTTPException(status_code=404, detail="Template not found")
        
        db.log_action(current_user["username"], "Delete Template", f"Deleted template '{name}'")
        return {"status": "success"}

    # --- Delivery Triggering & Logging ---
    @app.post("/api/deliver")
    def deliver_shulker(payload: DeliverRequest, current_user = Depends(require_role(["Owner", "Admin", "Moderator"]))):
        slots_dict = [s.model_dump() for s in payload.slots]
        
        # 1. Register in SQLite database
        delivery_id = db.create_delivery(
            player_name=payload.player_name,
            template_name=payload.template_name,
            shulker_type=payload.shulker_type,
            slots_data=slots_dict,
            method=payload.method,
            scheduled_time=payload.scheduled_time
        )
        
        db.log_action(
            current_user["username"], 
            "Create Delivery", 
            f"Created delivery {delivery_id} for {payload.player_name} (Method: {payload.method})"
        )

        # 2. Check scheduled or immediate
        if payload.method == "Schedule" and payload.scheduled_time:
            return {"status": "scheduled", "delivery_id": delivery_id}

        # 3. For immediate deliveries:
        # Check if the player is online
        player = plugin_ref.server.get_player(payload.player_name)
        if not player:
            db.update_delivery_status(delivery_id, "PENDING", "Player is offline. Queued for join.")
            return {"status": "queued_offline", "delivery_id": delivery_id}

        # Schedule the dispatch to run synchronously on the server thread to prevent threading issues
        def run_on_main():
            try:
                delivery_item = {
                    "id": delivery_id,
                    "player_name": payload.player_name,
                    "shulker_type": payload.shulker_type,
                    "delivery_method": payload.method,
                    "slots_data": slots_dict
                }
                plugin_ref._dispatch_delivery(delivery_item)
            except Exception as e:
                plugin_ref.logger.error(f"Failed to dispatch delivery from main thread: {e}")

        plugin_ref.server.scheduler.run_task(plugin_ref, run_on_main)
        
        return {"status": "dispatched", "delivery_id": delivery_id}

    @app.get("/api/logs")
    def get_logs(limit: int = 100, current_user = Depends(require_role(["Owner", "Admin", "Moderator", "Viewer"]))):
        return {
            "deliveries": db.get_delivery_logs(limit),
            "audits": db.get_audit_logs(limit)
        }

    # --- Item & Addon Registries ---
    @app.get("/api/scanner/registry")
    def get_item_registry(current_user = Depends(require_role(["Owner", "Admin", "Moderator", "Viewer"]))):
        return {
            "items": db.get_registered_items(),
            "addons": db.get_registered_addons()
        }

    @app.put("/api/scanner/registry/{type_id:path}")
    def update_registry_item(type_id: str, payload: RegistryItemEditSchema, current_user = Depends(require_role(["Owner", "Admin"]))):
        success = db.update_registered_item(
            type_id=type_id,
            display_name=payload.displayName,
            category=payload.category,
            texture=payload.texture,
            potion_effect_type=payload.potionEffectType
        )
        if not success:
            raise HTTPException(status_code=404, detail="Item not found in registry")
        db.log_action(current_user["username"], "Update Registry Item", f"Updated registry item: {type_id}")
        return {"status": "success"}

    @app.post("/api/scanner/registry")
    def add_registry_item(payload: RegistryItemAddSchema, current_user = Depends(require_role(["Owner", "Admin"]))):
        success = db.add_registered_item(
            type_id=payload.typeId,
            display_name=payload.displayName,
            source_pack=payload.sourcePack,
            category=payload.category,
            texture=payload.texture,
            is_custom=payload.isCustom,
            potion_effect_type=payload.potionEffectType
        )
        if not success:
            raise HTTPException(status_code=400, detail="Item ID already exists or invalid data")
        db.log_action(current_user["username"], "Add Registry Item", f"Added new registry item: {payload.typeId}")
        return {"status": "success"}

    @app.delete("/api/scanner/registry/{type_id:path}")
    def delete_registry_item(type_id: str, current_user = Depends(require_role(["Owner", "Admin"]))):
        success = db.delete_registered_item(type_id)
        if not success:
            raise HTTPException(status_code=404, detail="Item not found in registry")
        db.log_action(current_user["username"], "Delete Registry Item", f"Deleted registry item: {type_id}")
        return {"status": "success"}

    # --- Resource Pack Texture Proxy ---
    @app.get("/api/textures/{pack_dir}/{path:path}")
    def get_pack_texture(pack_dir: str, path: str):
        # Allows dashboard to load custom addon icons directly
        # Checks local cache folder first, then development/production folders
        local_path = plugin_ref.data_folder / "textures" / pack_dir / path
        if local_path.exists():
            return FileResponse(str(local_path))

        dev_path = plugin_ref.server_root / "development_resource_packs" / pack_dir / path
        prod_path = plugin_ref.server_root / "resource_packs" / pack_dir / path

        if dev_path.exists():
            return FileResponse(str(dev_path))
        elif prod_path.exists():
            return FileResponse(str(prod_path))
        
        # Check world directories
        worlds_dir = plugin_ref.server_root / "worlds"
        if worlds_dir.exists():
            for wdir in worlds_dir.iterdir():
                if wdir.is_dir():
                    world_rp_path = wdir / "resource_packs" / pack_dir / path
                    if world_rp_path.exists():
                        return FileResponse(str(world_rp_path))
                    world_dev_rp_path = wdir / "development_resource_packs" / pack_dir / path
                    if world_dev_rp_path.exists():
                        return FileResponse(str(world_dev_rp_path))
        
        raise HTTPException(status_code=404, detail="Texture not found")

    # --- Static Files / Single Page App Support ---
    if dashboard_dir.exists() and (dashboard_dir / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=str(dashboard_dir / "assets")), name="assets")
        
        @app.get("/{full_path:path}")
        def serve_dashboard(full_path: str):
            if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
                raise HTTPException(status_code=404, detail="Not found")
            return FileResponse(str(dashboard_dir / "index.html"))
    else:
        # Fallback index if frontend hasn't been built yet
        @app.get("/")
        def serve_fallback():
            html_content = """
            <html>
                <head>
                    <title>Shulker Studio Dashboard</title>
                    <style>
                        body { background: #0c0f1d; color: #f1f5f9; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .card { background: #161b30; padding: 40px; border-radius: 12px; text-align: center; border: 1px solid #232a45; }
                        h1 { color: #818cf8; margin-bottom: 10px; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Shulker Studio Dashboard</h1>
                        <p>Frontend is currently compiling or not found in dashboard/dist.</p>
                        <p>FastAPI Server is running on port 9020 successfully.</p>
                    </div>
                </body>
            </html>
            """
            return Response(content=html_content, media_type="text/html")

    return app
