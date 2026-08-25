# Website plan

## Foundation delivered in this first implementation

- Next.js App Router website with real Steam OpenID login and signed, HTTP-only sessions.
- Public dashboard: server features, Connect action, live-status endpoint contract, and server statistics display.
- Authenticated account areas for player profile, appeals, tickets, and WeaponSkins setup.
- Read-only integration adapter for existing Swiftly data and a separate portal database schema for website-owned records.

## Data boundaries

| Source | Website access | Purpose |
| --- | --- | --- |
| `lvl_base` | Read only | points, playtime, rank, gameplay stats |
| `admins`, `vip_users`, `bans`, `sanctions` | Read only | groups and moderation history |
| `wp_player_*` | Read initially; write later through a Swiftly bridge | current WeaponSkins choices |
| `arena_portal` | Read/write | Steam/Discord links, tickets, appeals, audit, outbox |

The portal must use a database user without `INSERT`, `UPDATE`, or `DELETE` rights on the game database. Group changes, unbans, and WeaponSkins updates are submitted to the portal outbox and applied by a dedicated server bridge after authorization checks.

## Milestone 1 — player portal

1. Configure the environment and run `db/001_portal.sql` in the separate portal database.
2. Enable the game read-only connection to show real K4 ranks playtime, VIP/admin groups, bans, and comms history.
3. Enable ticket and appeal submission, status updates, and staff responses.
4. Add a server-status provider from a safe Swiftly HTTP bridge or query service.

## Milestone 2 — staff and Discord

1. Build staff ticket/report queues with authorization based on linked Discord roles and/or admin groups.
2. Add Discord linking and outbox workers.
3. Add the Discord bot report and appeal synchronization.

## Milestone 3 — WeaponSkins and rewards

1. Import the allowed WeaponSkins catalog and permissions from the plugin configuration.
2. Render loadouts by T/CT and validate each desired skin, knife, gloves, agents, music kit, stickers, and charm server-side.
3. Send approved changes through the Swiftly bridge; the WeaponSkins plugin remains the final authority.
4. Add point-funded group/role policies, cooldowns, and audit views.
