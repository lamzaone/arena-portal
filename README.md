# ARENA Portal

The player portal for the ARENA CS2 server: Steam sign-in, player dashboard, moderation records, appeals, tickets, and the Token Economy inventory, crates, marketplace, trades, and staff item-management flows.

## Start locally

1. Copy `.env.example` to `.env.local` and set `SITE_URL` to `http://localhost:3000` for local testing.
2. Set a long random `SESSION_SECRET` for CSRF protection on sensitive staff actions.
3. Run `npm install`, then `npm run dev`.
4. For tickets, appeals, login sessions, player settings, the Token Economy, and portal identity groups, create a separate `utf8mb4` database and run the SQL files in `db/` in numerical order through `020_identity_group_listings.sql`. Do not run these migrations in the game database. Migration 012 introduces the shared identity model, 014 stores Admins.Core/VIPCore definitions, 015–018 complete group rewards and profile-theme surfaces, 019 adds individually grantable VIP perks, and 020 adds the canonical EUR/Token membership listings used by both the VIP page and Market.
5. Add a read-only `GAME_DATABASE_URL` to display real data from K4 LevelRanks, VIPCore, and Admins.
6. Install TAPPED.Inventory with its Swiftly database connection named `portal`, then run `!inventory_sync_catalogue` once after the migration. This imports the retained WeaponSkins catalogue and creates the initial container/drop tables without modifying the legacy cache. Configure the same `portal` connection for VIPCore and Admins.Core so active portal membership purchases are applied as additive runtime grants.
7. Install GlobalChatTags with its Swiftly database connection named `portal`. Migration 012 supplies the shared Admins.Core, VIPCore, custom-group, tag, badge, privilege, preference, and reward records; migration 015 lets the runtime revoke account-bound rewards when membership disappears. Deploy `Dapper.dll` beside the plugin DLL.

External identity bootstrap resolves the installed Swiftly tree automatically when the portal is beside `addons/`. For split deployments, set `ARENA_SWIFTLY_CONFIG_ROOT` to the Swiftly `configs` directory, or set `ADMINS_GROUPS_CONFIG_PATH` and `VIP_GROUPS_CONFIG_PATH` to the exact group files. `IDENTITY_PERMISSION_SOURCE_PATHS` accepts a platform-delimited list of optional C# source roots for deployment-time permission discovery; registered command and Admins.Core permissions are also refreshed by GlobalChatTags at runtime.

For local testing with `http://localhost`, the session cookie is deliberately non-secure. Any public deployment must use an `https://` `SITE_URL`; its session cookie is always marked `Secure`.

## Security boundaries

- Steam OpenID is verified server-side before a cryptographically random HTTP-only session token is issued. Only its SHA-256 hash, SteamID64, expiry, and last-seen time are stored in the portal database.
- The game database account must be read-only.
- The portal database is separate and owns website/bot data, Token Economy wallets/items/trades, plus `portal_outbox` bridge jobs.
- Enable `PORTAL_BRIDGE_ENABLED=true` only after `TAPPED.PortalBridge` is installed and its `portal` Swiftly database connection points to `PORTAL_DATABASE_URL`. Website moderation is validated, queued, and then executed in-process through Swiftly's plugin APIs; it never writes game tables directly.
- Economy prices are held as immutable EUR-cent snapshots: 1 EUR equals 100 Tokens for every item type, including crates and capsules. Promotions are separate audited discount rules; one item-specific or category rule may apply, rules never stack, and purchase transactions re-check the active winner before debiting Tokens. Marketplace cards prefer Skinport's public CS2 sales median, then automatically fall back to current CSFloat and SkinCash public indexes when that market identity has no sale history. USD index values are converted server-side from the ECB-backed Frankfurter EUR rate; clients never submit a price. In production, the portal refreshes every enabled exact market-hash item hourly (configurable through `ECONOMY_PRICE_REFRESH_INTERVAL_MINUTES`) and persists only changed snapshots. When an inventory sale has no reusable price, the server queries a matching CSFloat listing by exact float and paint seed when `CSFLOAT_API_KEY` is configured; otherwise it retains the safe exterior-level cross-market fallback.
- Public price refresh is used only for an exact market-hash name (and an optional `marketVersion`, `skinportVersion`, or `priceVersion` catalogue metadata field for phase variants). The retained WeaponSkins cache can contain custom weapon/paint-kit combinations that have no real public-market identity. A batch sale leaves those entries unsold after its online lookups instead of rejecting the priced items; staff can assign a last-known price if the custom item should be sellable.
- The old WeaponSkins portal Loadout API/page and server plugin are intentionally retained as disabled backups. Do not turn either legacy feature back on alongside TAPPED.Inventory.

See [the theme system](docs/theme-system.md), [the website plan](docs/website-plan.md), and [the Discord bot plan](docs/discord-bot-plan.md) for extension guidance and the next milestones.

## Token Economy rollout

1. Back up the portal database and run migrations 001 through 020 against it in order; keep the game database read-only. Migration 020 is required before opening Staff > Groups > Listings or publishing a membership product.
2. Deploy the TAPPED.Inventory, GlobalChatTags, VIPCore, and Admins.Core builds (including their dependencies) and config, then restart/reload the server only after step 1 is complete.
3. From the server console or an authorised Director/Founder account, run `!inventory_sync_catalogue`. It imports the old cosmetic catalogue and bootstraps the initial crate/capsule/drop tables.
4. Confirm a player can run `!tokens`, earn a kill/headshot in a normal 4+ human-player match, and browse Inventory, Crates, Market, and Trades in the portal.
5. Use Portal > Staff > Item management for grants, customisation, price refresh/overrides, inventory changes, stickers, and player loadouts. Exact externally assigned Founders can use Portal > Staff > Groups for identity groups, tags, badges, privileges, and catalogue rewards.

No production database migration or server restart is performed by the portal application itself.

## Automatic economy price refresh

On a normal Node.js deployment, `instrumentation.ts` starts an in-process price worker after the portal boots. It refreshes every catalogue item with an enabled, exact public market-hash name; multiple portal instances are serialized with a MySQL named lock. Items with no public match retain their current staff/default snapshot, so the branded TAPPD case remains at its configured 2,000-Token base/direct price. Existing `bootstrap-default` 2,000-cent rows already map to 2,000 Tokens and are intentionally untouched by migration 010; only legacy `staff-custom-crate` rows created by the former doubling workaround are corrected.

For serverless hosting, schedule `GET /api/cron/economy-prices` at the same interval and send `Authorization: Bearer <ECONOMY_PRICE_REFRESH_SECRET>`. The endpoint returns counts for scanned, matched, updated, and unmatched catalogue items. Keep the secret outside source control.
