# ARENA Portal

The player portal for the ARENA CS2 server: Steam sign-in, player dashboard, moderation records, appeals, tickets, and the Token Economy inventory, crates, marketplace, trades, and staff item-management flows.

## Start locally

1. Copy `.env.example` to `.env.local` and set `SITE_URL` to `http://localhost:3000` for local testing.
2. Set a long random `SESSION_SECRET` for CSRF protection on sensitive staff actions.
3. Run `npm install`, then `npm run dev`.
4. For tickets, appeals, login sessions, player settings, the Token Economy, and portal identity groups, create a separate `utf8mb4` database and run the SQL files in `db/` in numerical order through `015_group_reward_entitlements.sql`. Do not run these migrations in the game database. Migration 012 also pins its identity tables and decorated chat-tag text to `utf8mb4` so symbols remain lossless on servers whose global default differs. Migration 014 stores Admins.Core/VIPCore definitions and permission-discovery provenance; when either external catalogue is empty, the Founder groups page imports its available Swiftly JSON/JSONC config automatically. Migration 015 makes account-bound group rewards follow the granting membership without restoring independently revoked items.
5. Add a read-only `GAME_DATABASE_URL` to display real data from K4 LevelRanks, VIPCore, and Admins.
6. Install TAPPED.Inventory with its Swiftly database connection named `portal`, then run `!inventory_sync_catalogue` once after the migration. This imports the retained WeaponSkins catalogue and creates the initial container/drop tables without modifying the legacy cache.
7. Install GlobalChatTags with its Swiftly database connection named `portal`. Migration 012 supplies the shared Admins.Core, VIPCore, custom-group, tag, badge, privilege, preference, and reward records; migration 015 lets the runtime revoke account-bound rewards when membership disappears. Deploy `Dapper.dll` beside the plugin DLL.

External identity bootstrap resolves the installed Swiftly tree automatically when the portal is beside `addons/`. For split deployments, set `ARENA_SWIFTLY_CONFIG_ROOT` to the Swiftly `configs` directory, or set `ADMINS_GROUPS_CONFIG_PATH` and `VIP_GROUPS_CONFIG_PATH` to the exact group files. `IDENTITY_PERMISSION_SOURCE_PATHS` accepts a platform-delimited list of optional C# source roots for deployment-time permission discovery; registered command and Admins.Core permissions are also refreshed by GlobalChatTags at runtime.

For local testing with `http://localhost`, the session cookie is deliberately non-secure. Any public deployment must use an `https://` `SITE_URL`; its session cookie is always marked `Secure`.

## Security boundaries

- Steam OpenID is verified server-side before a cryptographically random HTTP-only session token is issued. Only its SHA-256 hash, SteamID64, expiry, and last-seen time are stored in the portal database.
- The game database account must be read-only.
- The portal database is separate and owns website/bot data, Token Economy wallets/items/trades, plus `portal_outbox` bridge jobs.
- Enable `PORTAL_BRIDGE_ENABLED=true` only after `TAPPED.PortalBridge` is installed and its `portal` Swiftly database connection points to `PORTAL_DATABASE_URL`. Website moderation is validated, queued, and then executed in-process through Swiftly's plugin APIs; it never writes game tables directly.
- Economy prices are held as immutable EUR-cent snapshots: 1 EUR equals 100 Tokens for every item type, including crates and capsules. Promotions are separate audited discount rules; one item-specific or category rule may apply, rules never stack, and purchase transactions re-check the active winner before debiting Tokens. Marketplace cards prefer Skinport's public CS2 sales median, then automatically fall back to current CSFloat and SkinCash public indexes when that market identity has no sale history. USD index values are converted server-side from the ECB-backed Frankfurter EUR rate; clients never submit a price. In production, the portal refreshes every enabled exact market-hash item hourly (configurable through `ECONOMY_PRICE_REFRESH_INTERVAL_MINUTES`) and persists only changed snapshots. Set `CSFLOAT_API_KEY` on the server to additionally price an inventory sale or float-market purchase from a matching CSFloat listing filtered by its exact float and paint seed; without it, the safe exterior-level cross-market quote remains available.
- Public price refresh is used only for an exact market-hash name (and an optional `marketVersion`, `skinportVersion`, or `priceVersion` catalogue metadata field for phase variants). The retained WeaponSkins cache lacks exterior/StatTrak variants for many skins, so staff must record an appropriate last-known EUR-cent snapshot or set the exact variant name in Staff > Item management before those imported items can be sold.
- The old WeaponSkins portal Loadout API/page and server plugin are intentionally retained as disabled backups. Do not turn either legacy feature back on alongside TAPPED.Inventory.

See [the website plan](docs/website-plan.md) and [the Discord bot plan](docs/discord-bot-plan.md) for the next milestones.

## Token Economy rollout

1. Back up the portal database and run migrations 001 through 015 against it in order; keep the game database read-only. Migration 011 introduces Special/custom item taxonomy and transferability, 012 introduces identity groups, 013 binds equipped profile themes to concrete owned inventory instances, 014 persists external Admin/VIP definitions plus discovered permission sources, and 015 makes account-bound reward items follow group membership.
2. Deploy the TAPPED.Inventory and GlobalChatTags builds (including `Dapper.dll`) and config, then restart/reload the server only after step 1 is complete.
3. From the server console or an authorised Director/Founder account, run `!inventory_sync_catalogue`. It imports the old cosmetic catalogue and bootstraps the initial crate/capsule/drop tables.
4. Confirm a player can run `!tokens`, earn a kill/headshot in a normal 4+ human-player match, and browse Inventory, Crates, Market, and Trades in the portal.
5. Use Portal > Staff > Item management for grants, customisation, price refresh/overrides, inventory changes, stickers, and player loadouts. Exact externally assigned Founders can use Portal > Staff > Groups for identity groups, tags, badges, privileges, and catalogue rewards.

No production database migration or server restart is performed by the portal application itself.

## Automatic economy price refresh

On a normal Node.js deployment, `instrumentation.ts` starts an in-process price worker after the portal boots. It refreshes every catalogue item with an enabled, exact public market-hash name; multiple portal instances are serialized with a MySQL named lock. Items with no public match retain their current staff/default snapshot, so the branded TAPPD case remains at its configured 2,000-Token base/direct price. Existing `bootstrap-default` 2,000-cent rows already map to 2,000 Tokens and are intentionally untouched by migration 010; only legacy `staff-custom-crate` rows created by the former doubling workaround are corrected.

For serverless hosting, schedule `GET /api/cron/economy-prices` at the same interval and send `Authorization: Bearer <ECONOMY_PRICE_REFRESH_SECRET>`. The endpoint returns counts for scanned, matched, updated, and unmatched catalogue items. Keep the secret outside source control.
