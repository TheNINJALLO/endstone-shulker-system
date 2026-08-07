# Tebex Setup & Commands Configuration Guide

This guide provides step-by-step instructions on how to configure your Tebex webstore, packages, and commands to link directly with your `endstone-shulker-system` plugin.

---

## 1. General Tebex Package Configuration Settings

When setting up or editing a package on your **Tebex Control Panel** under the **Packages** page, ensure you configure the following delivery settings under the **Game Server Commands** section:

1. **Add Command**: Click the "Add Command" button.
2. **Offline Setting**: Check **"Execute command even if player is offline"**. This is crucial because our plugin uses a local database queue to deliver items immediately when the player joins if they are not online at the moment of purchase.
3. **Execution Delay**: Keep the delay set to **0** (Immediate).
4. **Execution Event**: Set the event type to **"Online"** (meaning Tebex dispatches the command to your server queue as soon as your game server polls).
5. **Command Structure**: Use the exact command templates detailed in Section 3, ensuring the player username variable is entered exactly as `"{username}"` (including the quotes).

---

## 2. Tebex Command Variables & Placeholders

The built-in Tebex poller in the Shulker System automatically replaces the following variables before dispatching commands:

- `"{username}"` (Tebex variable: `{username}`) - Replaced with the purchaser's Minecraft in-game username.
- `{id}` (Tebex variable: `{id}`) - Replaced with the purchaser's game UUID or Xbox XUID.
- `{transaction}` / `{payment}` (Tebex variable: `{transaction}`) - Replaced with the Tebex transaction ID (e.g. `tbx-1234567890`).

> [!WARNING]
> Always wrap the player username placeholder in double quotes: `"{username}"`. This ensures that players with spaces or special characters in their Gamertags do not cause the command syntax to break.

---

## 3. Package Configurations & Console Commands

Below is the complete list of all donation kits pre-configured in the `endstone-shulker-system` plugin. Copy and paste the command for your respective Tebex package:

### 🌟 Category: TP Rope Subscriptions (Warp Codes)
These packages generate specialized teleportation rope codes, write them to the `warp-codes` database, and post them automatically to your Discord webhook.

| Tebex Package | Price | Tebex Console Command |
| :--- | :--- | :--- |
| **Level 1 TP Rope (1 Month)** | $15 | `shulkertebex "{username}" rope_level1` |
| **Level 1 TP Rope (1 Year)** | $100 | `shulkertebex "{username}" rope_level1_year` |
| **Level 2 TP Rope (1 Month)** | $20 | `shulkertebex "{username}" rope_level2` |
| **Level 2 TP Rope (1 Year)** | $150 | `shulkertebex "{username}" rope_level2_year` |

---

### 🛡️ Category: Armor Trims & Custom Vouchers
These packages deliver custom items inside a shulker box (e.g., armor templates or custom-named printed vouchers for staff actions).

| Tebex Package | Price | Tebex Console Command |
| :--- | :--- | :--- |
| **Armor Trims (9 Choices)** | $5 | `shulkertebex "{username}" trims_9` |
| **Armor Trims (18 Choices)** | $10 | `shulkertebex "{username}" trims_18` |
| **Structure Move Voucher** | $10 | `shulkertebex "{username}" structure_move` |

---

### 🏛️ Category: The Vault (TK Coins)
Directly updates the scoreboard currency (`Money`) for the player.

| Tebex Package | Price | Tebex Console Command |
| :--- | :--- | :--- |
| **15k TK Coins** | $5 | `shulkertebex "{username}" vault_15k` |
| **50k TK Coins** | $10 | `shulkertebex "{username}" vault_50k` |
| **200k TK Coins** | $15 | `shulkertebex "{username}" vault_200k` |
| **500k TK Coins** | $25 | `shulkertebex "{username}" vault_500k` |
| **1.25 Million TK Coins** | $50 | `shulkertebex "{username}" vault_125m` |
| **3 Million TK Coins** | $100 | `shulkertebex "{username}" vault_3m` |

---

### 🔨 Category: Creative Mode Packs
Grants build-mode warp codes and deposits structure move vouchers in a delivered shulker.

| Tebex Package | Price | Tebex Console Command |
| :--- | :--- | :--- |
| **Creative Pack (3 Days)** | $15 | `shulkertebex "{username}" creative_3d` |
| **Creative Pack (7 Days)** | $25 | `shulkertebex "{username}" creative_7d` |
| **Creative Pack (15 Days)** | $50 | `shulkertebex "{username}" creative_15d` |
| **Creative Pack (30 Days)** | $80 | `shulkertebex "{username}" creative_30d` |

---

### 💎 Category: The Ore Bags
Delivers shulker boxes packed with high-tier survival materials.

| Tebex Package | Price | Tebex Console Command |
| :--- | :--- | :--- |
| **Ore Bag (Ingots x4)** | $5 | `shulkertebex "{username}" ore_bag_ingots_4` |
| **Ore Bag (Ingots x9)** | $10 | `shulkertebex "{username}" ore_bag_ingots_9` |
| **Ore Bag (Ingots x18)** | $15 | `shulkertebex "{username}" ore_bag_ingots_18` |
| **Ore Bag (Blocks x10)** | $25 | `shulkertebex "{username}" ore_bag_blocks_10` |
| **Ore Bag (Blocks x27)** | $50 | `shulkertebex "{username}" ore_bag_blocks_27` |

---

### ⚔️ Category: The Armory (Enchanted Sets)
Delivers sets of enchanted armor/tools plus TK scoreboard coins and corresponding book bundles.

| Tebex Package | Price | Tebex Console Command |
| :--- | :--- | :--- |
| **The Armory ($5)** | $5 | `shulkertebex "{username}" armory_5` |
| **The Armory ($10)** | $10 | `shulkertebex "{username}" armory_10` |
| **The Armory ($15)** | $15 | `shulkertebex "{username}" armory_15` |
| **The Armory ($20)** | $20 | `shulkertebex "{username}" armory_20` |
| **The Armory ($25)** | $25 | `shulkertebex "{username}" armory_25` |
| **The Armory ($50)** | $50 | `shulkertebex "{username}" armory_50` |

---

### 📦 Category: Contractors Boxes
Provides bulk building blocks alongside Builder Sacks and scoreboard coins.

| Tebex Package | Price | Tebex Console Command |
| :--- | :--- | :--- |
| **Contractors Box ($5)** | $5 | `shulkertebex "{username}" contractor_5` |
| **Contractors Box ($10)** | $10 | `shulkertebex "{username}" contractor_10` |
| **Contractors Box ($15)** | $15 | `shulkertebex "{username}" contractor_15` |
| **Contractors Box ($25)** | $25 | `shulkertebex "{username}" contractor_25` |

---

### 🏪 Category: Shop Restock Packages
Delivers Shop Restock vouchers alongside common premium stock items inside shulker boxes.

| Tebex Package | Price | Tebex Console Command |
| :--- | :--- | :--- |
| **Shop Owners Only ($5)** | $5 | `shulkertebex "{username}" shop_5` |
| **Shop Owners Only ($10)** | $10 | `shulkertebex "{username}" shop_10` |
| **Shop Owners Only ($15)** | $15 | `shulkertebex "{username}" shop_15` |
| **Shop Owners Only ($20)** | $20 | `shulkertebex "{username}" shop_20` |
| **Shop Owners Only ($25)** | $25 | `shulkertebex "{username}" shop_25` |
| **Shop Owners Only ($50)** | $50 | `shulkertebex "{username}" shop_50` |

---

### 👑 Category: Cracked Pack Nation
Deliveries of massive custom shulker kits, pet vouchers, structure moves, custom tags, and scoreboard coins.

| Tebex Package | Price | Tebex Console Command |
| :--- | :--- | :--- |
| **Cracked Pack ($50)** | $50 | `shulkertebex "{username}" cracked_50` |
| **Super Cracked Pack ($100)** | $100 | `shulkertebex "{username}" cracked_100` |
| **Cracked King Pack ($150)** | $150 | `shulkertebex "{username}" cracked_150` |
| **Cracked God Pack ($200)** | $200 | `shulkertebex "{username}" cracked_200` |

---

## 4. Verification & Testing

Once you have configured the commands in Tebex:

1. Perform a test checkout (e.g. creating a 100% discount coupon in Tebex and checking out).
2. The Tebex built-in API poller will pick up the payment within 120 seconds.
3. If you are online:
   - The plugin immediately prints a server notification.
   - For shulker deliveries, a segmented hex payload will fire, spawn a temporary shulker near you, and collect it instantly.
   - Scoreboard coins or custom tags will be added immediately.
   - Any generated warp codes will be output directly in your game chat and posted to your configured Discord webhook.
4. If you are offline:
   - The poller queues the delivery in the local SQLite database.
   - As soon as you log in, the Join listener detects the pending queue and processes the delivery.
