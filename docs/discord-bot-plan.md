# Discord bridge

The first implementation connects Discord, the portal and ArenaAdminExtensions. The standalone [Discord bot](../discord-bot/README.md) uses authenticated portal HTTP endpoints; it has no database credentials. It requires a persistent Node host and runs separately from Next.js.

## Implemented flows

- `/link` in Discord privately issues a 12-character code. It expires after ten minutes, can be requested at most once per minute, and is stored only as a SHA-256 hash. Requesting a replacement invalidates the previous code.
- A player redeems the code while signed in with Steam at `/discord-link`, or by entering `/discordlink CODE` in-game. Both paths share transactional redemption and the same one-to-one Steam/Discord uniqueness rules. Reuse, expiration and account replacement are rejected. Codes are excluded from ArenaAdminExtensions command logs.
- Every enabled identity group receives a separate bot-managed Discord role. Roles retain their mapping through group renames; disabled groups lose members. Membership combines current Arena authority and scoped Admins.Core/VIPCore records, respecting expiry and native VIP suppression. Any failed membership read aborts role reconciliation. Existing unrelated Discord roles remain untouched.
- ArenaAdminExtensions queues `/report` and `/calladmin` alerts durably. New website tickets and ban appeals enqueue alerts in the same transaction as case creation. The bot tags every enabled admin-group role plus any explicitly configured admin roles in the staff channel. User-supplied mentions cannot trigger extra pings.
- Notification delivery uses a single-event, two-minute lease, completion receipts and exponential retries up to a five-minute interval. A crash releases the event when its lease expires. Discord nonces reduce duplicates, but delivery remains at least once.

Bot-created group roles have zero Discord permissions. Configure channel access separately, keep the bot above managed roles, and enable Server Members Intent. Run one active role-sync process per guild. Notification settings on individual Discord accounts still control which alerts users receive.

## Portal configuration and migration

1. Apply existing portal migrations through 026, then `db/027_discord_linking.sql` and `db/028_discord_bridge.sql`, to the **portal database**. Do not run these files against the game database. The current Arena group authority migration must already be installed in the game database for membership synchronization.
2. Configure `DISCORD_BRIDGE_SECRET` with a random secret of at least 32 characters and `DISCORD_GUILD_ID` with the intended Discord server ID. The separate bot must use the same values. The bot token belongs only to the bot process.
3. Set `DISCORD_NOTIFICATIONS_ENABLED=true` after migration to queue new website tickets and appeals. It defaults to false so existing deployments can upgrade before applying migrations. Historical cases are not backfilled.
4. Keep `SITE_URL`, `SESSION_SECRET`, `PORTAL_DATABASE_URL`, `GAME_DATABASE_URL`, `GAME_SERVER_GUID` and `GAME_VIP_SERVER_ID` configured normally. The bridge only reads game data and needs no additional game-table write permissions. Native Admins.Core/VIPCore reads and Arena authority reads must all succeed before role changes proceed.
5. The portal SQL account needs `SELECT`, `INSERT`, `UPDATE` on the new Discord tables and existing `portal_discord_links`, plus `INSERT` on `portal_audit_events`. Existing identity/case access remains necessary. Tables use InnoDB; notification claims require `FOR UPDATE SKIP LOCKED` (MySQL 8 or compatible MariaDB).

Authenticated bot endpoints are under `/api/discord/bot/`: `link-code`, `snapshot`, `roles` and `notifications`. All require `Authorization: Bearer <DISCORD_BRIDGE_SECRET>` and return non-cacheable responses. Website redemption uses Steam session identity and a session-bound CSRF token. Neither redemption path accepts a player-selected Steam identity.

## Game plugin configuration

Build/deploy the updated ArenaAdminExtensions package with its dependencies. Add a Swiftly database connection named `portal` for the separate portal database, then configure the plugin:

```json
{
  "Portal": {
    "Enabled": true,
    "ConnectionName": "portal",
    "ServerName": "ARENA",
    "LinkCooldownSeconds": 10
  }
}
```

The plugin database account needs `SELECT`, `UPDATE` on `portal_discord_link_codes`, `SELECT`, `INSERT` on `portal_discord_links`, and `INSERT` on `portal_discord_notifications` and `portal_audit_events`. Existing webhook logging remains usable for connects/admin commands; queued reports replace direct report webhooks when the portal bridge is enabled. Players receive success only after persistence or successful legacy webhook delivery.

See [bot installation and operation](../discord-bot/README.md) for Discord application setup, environment variables, command registration and process startup. Neither bot registration nor production migration/deployment happens automatically during builds or tests.

## Verification

From the portal: `npm run test:discord`, `npm run typecheck`, then `npm test`. From `discord-bot`: `npm ci`, `npm run build`, `npm test`. NUnit tests cover the game plugin, redemption transactions and report acknowledgement.

Portal SQL fixture tests exercise the actual queries using isolated SQLite. They verify rollback and replay behavior, but do not establish MySQL locking correctness. Optional link concurrency tests require `DISCORD_LINK_TEST_DATABASE_URL` pointing to a disposable MySQL database. Game integration tests use `TAPPED_DISCORD_TEST_DB` as documented in the plugin README. Never point these tests at a production database.

Before enabling the service, verify in a staging guild/server: website and game redemption, reuse rejection across both paths, expiry, assignment/removal after group changes, server join, notifications for all four event types, admin pings, bot restart/retry, and outage behavior. Live Discord/game verification remains a deployment step.

## Later extensions

Unlink/relink recovery, report threads and staff claim/resolve workflows, player notification preferences, and moderation commands are outside this initial implementation. Existing moderation continues through the portal and TAPPED.PortalBridge.
