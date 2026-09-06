# ARENA Portal

The player portal for the ARENA CS2 server: Steam sign-in, player dashboard, moderation records, appeals, tickets, and the Token Economy inventory, loadout, marketplace, trades, and staff item-management flows. Players buy crates and capsules from Market, then inspect and open owned containers from Inventory.

## 3D weapon customization

Inventory's workbench uses the supported [SkinHub viewer](https://github.com/SkinHubgg/skinhub-viewer), with SkinCraft as the interaction reference. It supports orbit/zoom, first-person views, five sticker slots with rotation/wear/placement, charm placement, and CS2 inspect links. Changes are staged until Save placement. New attachments must be owned; repositioning preserves item float, pattern, StatTrak and charm seed. Saves, inventory consumption, audits and game refresh jobs share one transaction and retry receipt.

Weapon cards use saved 640×360 WebP renders keyed by the complete item: definition, paint, full float, seed, model, StatTrak, name tag, stickers and charm placement. All 20 cards on the current page request their thumbnails together, including rows below the fold. Finished images are shared by the backend, and a bounded browser index remembers the last 512 exact image URLs across reloads. Uncached cards immediately display their normal catalogue image while the backend saves the exact WebP. Catalogue artwork stays visible until the exact image has decoded successfully, and its label distinguishes it from the finished float/seed render. Item grids never mount live 3D frames. Unrolled reward previews identify their sample float/seed. Unsupported custom finishes report that exact rendering is unavailable rather than substituting another skin. Non-weapon items retain their normal images.

The market lets players choose seed **0–1000**, float within the finish's legal range, and supported StatTrak. Preview, inspection, quote and purchase use that selection; changing it invalidates the previous quote and purchase retry key. Seed-matched CSFloat listings require `CSFLOAT_API_KEY`. Otherwise the UI explicitly identifies the wear-based market estimate, without inventing rare-pattern premiums. Custom server finishes such as Glock-18 | Case Hardened remain eligible when staff set a positive last-known price; that configured price is used for checkout and sellback. Missing public prices alone do not invalidate a released Steam skin.

Inspection dialogs expand to 1120px wide, with a responsive stage up to 680px tall. The customization stage grows to 600px, and sticker buttons and inputs have at least 44px touch targets. Direct previews require access to `https://skinhub.gg` (allow it in `frame-src` if adding a CSP). Legacy sixth-slot stickers remain stored but are not supported by the viewer.

Thumbnail rendering requires a persistent **Node host with Chromium**, not the Cloudflare Workers runtime. Run `npm run thumbnails:install` locally; Linux hosts may need `npx playwright install --with-deps --only-shell chromium`. The FreakHosting workflow packages the Linux browser and preserves images outside releases. The host still needs Chromium's system libraries. Set `WEAPON_THUMBNAIL_BROWSER_PATH` for a host-provided Chromium, or `WEAPON_THUMBNAIL_CACHE_DIR` for a persistent writable directory. Defaults are `.cache/weapon-thumbnails` locally and `~/arena-portal/cache/weapon-thumbnails` under the provided hosting launcher. Run `npm run thumbnails:warm -- --inventory` before rollout, then `npm run thumbnails:warm -- --catalogue`; these read the database and only write image files. The default command warms both and can be limited with `--limit=100`. It resumes from existing files. Cold renders still take seconds; cached images avoid repeating that work.

Windows uses full Chromium with hardware GPU access by default, avoiding the headless shell's software WebGL bottleneck. The renderer stays warm for five idle minutes. Set `WEAPON_THUMBNAIL_GPU=false` to use software rendering. Linux keeps the packaged headless shell by default; opting in with `WEAPON_THUMBNAIL_GPU=true` requires full Chromium (`npm run thumbnails:install`) and working GPU drivers.

Float/seed updates reuse the loaded viewer. Finish changes also reuse it when the weapon, mesh generation and customization are unchanged and no charm is present. The renderer waits for the new finish to load, verifies the complete accepted item identity, and completes only the canvas opacity fade before capturing the painted frame. Weapon/model/attachment changes navigate afresh; charms keep their normal settling time. Cached images keep the same complete item identity regardless of how they were generated.

Models, textures, viewer resources and shaders now persist across renderer shutdowns and portal restarts. This asset cache is separate from the final float/seed WebP cache: new item configurations reuse downloaded resources while keeping their own exact images. Weapon definitions map to eight stable Chromium profiles, each targeting a 1 GiB HTTP cache (8 GiB total target; other profile storage is additional). GPU hosts use two render lanes with disjoint even/odd model buckets; software-rendering hosts keep one lane. Each lane keeps at most one browser open. Each lane independently groups a bounded batch of its oldest jobs by model bucket, keeping the other lane busy if one render is slow. Finished images wake pending status requests immediately instead of waiting for a fixed polling interval. The Simple cache backend avoids Windows blockfile startup resets after large preloads, and Chromium still honors provider freshness headers and evicts older resources. The default root is `.cache/weapon-thumbnail-assets`, or `~/arena-portal/cache/weapon-thumbnail-assets` under the hosting launcher; override it with `WEAPON_THUMBNAIL_ASSET_CACHE_DIR`. Each concurrently running portal process needs its own asset-cache root. These profiles never use a player's browser profile or portal session.

Before starting the portal, run `npm run thumbnails:warm -- --models --profile=server` to preload a representative released finish for every supported weapon, knife and glove mesh generation without database access. This loads shared model/material resources, not every possible finish/float/seed image; previously unseen finish textures are cached on first use. `--limit=20` permits a shorter preload. The server profile must be closed while this command runs. Ordinary inventory/catalogue warm commands use a separate `warmer` profile so they can run alongside the portal and share finished WebP files.

`node scripts/sync-weapon-models.mjs` refreshes the compact weapon/finish mesh table after CS2 updates. The portal and `TAPPED.Inventory` embed the same `lib/economy/cs2-skin-models.json`; rebuild both after refreshing it. Fifth-slot native anchors use the pinned SDK's conversion table. Existing name tags that exceed the inspect codec's limit remain intact; link export is unavailable for those items.

`npm run test:loadout`, `npm run test:thumbnails` and `npm run test:catalogue` cover placement, exact image identities, rendering queue/cache, HTTP validation and isolated repository transactions. SQLite does not verify MySQL locking or CS2 replication. Before a production rollout, confirm ordinary and zero-count StatTrak weapons/knives, fifth-slot stickers, charms, drop/equip refreshes, and first-person inspection on a staging CS2 server. No database migration is required for these changes.

## Start locally

1. Copy `.env.example` to `.env.local` and set `SITE_URL` to `http://localhost:3000` for local testing.
2. Set a long random `SESSION_SECRET` for CSRF protection on sensitive staff actions.
3. Run `npm install`, then `npm run dev`.
4. For tickets, appeals, login sessions, player settings, the Token Economy, and portal identity groups, create a separate `utf8mb4` database and run the SQL files in `db/` in numerical order through `026_inventory_sale_locks.sql`. Do not run these migrations in the game database. Migration 012 introduces the shared identity model, 014 stores Admins.Core/VIPCore definitions, 015–018 complete group rewards and profile-theme surfaces, 019 adds individually grantable VIP perks, 020 adds the canonical EUR/Token membership listings used by both the VIP page and Market, 022 serializes portal item activations so each successful activation leaves one effective VIP tier while cross-tier duration is recalculated from current marketplace rates, 023 records when each runtime definition table has become authoritative, 024 durably coordinates runtime group renames while retaining historical aliases for immutable owned items, 025 adds the arena group commerce bridge, and 026 adds Inventory sale locks. Migration 022 is required before enabling source-aware VIP management or VIP item activation, and migration 026 is required before enabling Inventory sale-lock controls. While a portal VIP entitlement is active, the updated VIPCore build honors migration 022's suppression marker so retained or later native `vip_users` rows cannot stack beside it; timed suppression follows the final portal expiry and permanent portal VIP suppresses native rows permanently. Preserved game rows are not deleted and remain visible to staff as inactive remediation records.
5. Set `GAME_DATABASE_URL` to display real data from K4 LevelRanks, VIPCore, and Admins. A read-only account is sufficient for display-only deployments. Enabling database-authoritative group and membership management requires the narrowly scoped table permissions described under [Security boundaries](#security-boundaries); do not grant schema-wide write access.
   Set `GAME_VIP_SERVER_ID` to VIPCore's effective arena server ID (currently `1`). Together with `GAME_SERVER_GUID`, it explicitly links VIPCore and Admins.Core to one physical Arena server scope. Never use `vip_servers.GUID` as the Admins.Core GUID because the plugins generate those values independently. Use `0` only with `ShareServerId=true`; in that mode staff assignments intentionally include every VIPCore scope and label each raw record with its `sid`.
6. Install TAPPED.Inventory with its Swiftly database connection named `portal`, then run `!inventory_sync_catalogue` once after the migration. This imports the retained WeaponSkins catalogue and creates the initial container/drop tables without modifying the legacy cache. Configure the same `portal` connection for VIPCore and Admins.Core so active portal membership purchases are applied as runtime grants; the VIPCore build deployed with migration 022 also enforces native-membership suppression after a conversion.
7. Install GlobalChatTags with its Swiftly database connection named `portal`. Migration 012 supplies the shared Admins.Core, VIPCore, custom-group, tag, badge, privilege, preference, and reward records; migration 015 lets the runtime revoke account-bound rewards when membership disappears. Deploy `Dapper.dll` beside the plugin DLL.

External identity bootstrap resolves the installed Swiftly tree automatically when the portal is beside `addons/`. Admins.Core and VIPCore JSON files are one-time seed inputs for a new database scope. After that scope is marked as bootstrapped, the `groups` and `vip_group_definitions` tables are authoritative: restarting a plug-in or editing the seed JSON does not overwrite database-managed definitions. Make ongoing changes in Portal > Staff > Groups. For split deployments, set `ARENA_SWIFTLY_CONFIG_ROOT` to the Swiftly `configs` directory, or set `ADMINS_GROUPS_CONFIG_PATH` and `VIP_GROUPS_CONFIG_PATH` to the exact seed files. `IDENTITY_PERMISSION_SOURCE_PATHS` accepts a platform-delimited list of optional C# source roots for deployment-time permission discovery; registered command and Admins.Core permissions are also refreshed by GlobalChatTags at runtime.

For local testing with `http://localhost`, the session cookie is deliberately non-secure. Any public deployment must use an `https://` `SITE_URL`; its session cookie is always marked `Secure`.

## FreakHosting deployment

For automatic deployments on Git pushes, follow
[FreakHosting CI/CD](docs/freakhosting-cicd.md). GitHub Actions tests and builds a
Linux runtime bundle, then uploads, restarts and checks the app over SSH. This
keeps dependency installation and compilation off the shared hosting account.

For a manual source deployment:

Run the frontend and backend together as one Node.js application. Use Node 24,
`npm ci --include=dev`, `npm run build:hosting`, and `npm run start:hosting`.
In the Enhance panel, enable Automatic mode and proxy the whole website to port
3000. See [the FreakHosting deployment guide](docs/freakhosting-deployment.md)
for upload, environment variables, database access, verification, and DNS cutover.

## Cloudflare Workers deployment (alternative)

See [the Cloudflare build and deployment instructions](cloudflare/README.md).
Workers Builds must run `npm run build:cloudflare` before
`npm run deploy:cloudflare`; the standard `npm run build` only generates `.next`.

## Render deployment

For the free Node.js web-service deployment, use the repository's `render.yaml`
Blueprint and follow [the Render deployment guide](docs/render-deployment.md).
The Render path uses the standard `npm run build` and `npm start` commands; it
does not use the OpenNext Cloudflare bundle.

## Security boundaries

- Steam OpenID is verified server-side before a cryptographically random HTTP-only session token is issued. Only its SHA-256 hash, SteamID64, expiry, and last-seen time are stored in the portal database.
- Keep `GAME_DATABASE_URL` read-only when the portal is used only for display. Database-authoritative Staff > Groups mutations need a dedicated least-privilege account with the portal's existing table-scoped `SELECT` grants plus `INSERT` and `UPDATE` on `groups`, `admins`, and `vip_group_definitions`, and `INSERT`, `UPDATE`, and `DELETE` on `vip_users`. `DELETE` is needed only on `vip_users` for exact membership removal and tier renames. Do not grant DDL, `GRANT OPTION`, or write access to unrelated game tables such as bans, sanctions, rankings, or WeaponSkins.
- The portal database is separate and owns website/bot data, Token Economy wallets/items/trades, plus `portal_outbox` bridge jobs.
- Enable `PORTAL_BRIDGE_ENABLED=true` only after `TAPPED.PortalBridge` is installed and its `portal` Swiftly database connection points to `PORTAL_DATABASE_URL`. Website moderation is validated, queued, and then executed in-process through Swiftly's plugin APIs; it never writes game tables directly.
- Economy prices are held as immutable EUR-cent snapshots: 1 EUR equals 100 Tokens for every item type, including crates and capsules. Promotions are separate audited discount rules; one item-specific or category rule may apply, rules never stack, and purchase transactions re-check the active winner before debiting Tokens. Marketplace cards prefer Skinport's public CS2 sales median, then automatically fall back to current CSFloat and SkinCash public indexes when that market identity has no sale history. USD index values are converted server-side from the ECB-backed Frankfurter EUR rate; clients never submit a price. In production, the portal refreshes every enabled exact market-hash item hourly (configurable through `ECONOMY_PRICE_REFRESH_INTERVAL_MINUTES`) and persists only changed snapshots. When an inventory sale has no reusable price, the server queries a matching CSFloat listing by exact float and paint seed when `CSFLOAT_API_KEY` is configured; otherwise it retains the safe exterior-level cross-market fallback.
- Public price refresh is used only for an exact market-hash name (and an optional `marketVersion`, `skinportVersion`, or `priceVersion` catalogue metadata field for phase variants). The retained WeaponSkins cache can contain custom weapon/paint-kit combinations that have no real public-market identity. A batch sale leaves those entries unsold after its online lookups instead of rejecting the priced items; staff can assign a last-known price if the custom item should be sellable.
- The old WeaponSkins portal Loadout API/page and server plugin are intentionally retained as disabled backups. Do not turn either legacy feature back on alongside TAPPED.Inventory.

See [the theme system](docs/theme-system.md), [the website plan](docs/website-plan.md), and [the Discord bot plan](docs/discord-bot-plan.md) for extension guidance and the next milestones.

## Token Economy rollout

1. Back up the portal database and run migrations 001 through 026 against it in order. Migration 020 is required before opening Staff > Groups > Listings or publishing a membership product; migration 022 is required before source-aware VIP management or consuming VIP membership items; migration 024 is required before renaming a connected runtime group; migration 025 is required for arena-backed group commerce; and migration 026 is required before enabling Inventory sale-lock controls. Keep the game database read-only unless Staff > Groups management is enabled, in which case grant only the table-scoped DML permissions listed above.
2. Deploy the TAPPED.Inventory, GlobalChatTags, VIPCore, and Admins.Core builds (including their dependencies) and config, then restart/reload the server only after step 1 is complete.
3. From the server console or an authorised Director/Founder account, run `!inventory_sync_catalogue`. It imports the old cosmetic catalogue and bootstraps the initial crate/capsule/drop tables.
4. Confirm a player can run `!tokens`, earn a kill/headshot in a normal 4+ human-player match, and browse Inventory, Loadout, Market, and Trades in the portal. Verify that Market sells crates and capsules in the chosen quantity with optional drop previews, and that owned containers show their drops and open from Inventory.
5. Use Portal > Staff > Item management for grants, customisation, price refresh/overrides, inventory changes, stickers, and player loadouts. Exact externally assigned Founders can use Portal > Staff > Groups for identity groups, tags, badges, privileges, and catalogue rewards.

No production database migration or server restart is performed by the portal application itself.

## Automatic economy price refresh

On a normal Node.js deployment, `instrumentation.ts` starts an in-process price worker after the portal boots. It refreshes every catalogue item with an enabled, exact public market-hash name; multiple portal instances are serialized with a MySQL named lock. Items with no public match retain their current staff/default snapshot, so the branded TAPPD case remains at its configured 2,000-Token base/direct price. Existing `bootstrap-default` 2,000-cent rows already map to 2,000 Tokens and are intentionally untouched by migration 010; only legacy `staff-custom-crate` rows created by the former doubling workaround are corrected.

For serverless hosting, schedule `GET /api/cron/economy-prices` at the same interval and send `Authorization: Bearer <ECONOMY_PRICE_REFRESH_SECRET>`. The endpoint returns counts for scanned, matched, updated, and unmatched catalogue items. Keep the secret outside source control.
