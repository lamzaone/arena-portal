# Discord bot plan

## Purpose

The Discord bot is the moderation and community bridge. It should never write directly to game-plugin tables. Instead, it creates auditable portal actions that a small Swiftly bridge plugin applies in-game.

## Milestone 1 — reports and staff workflow

1. Add `/report` with Steam profile/player search, category, description, optional evidence links, and anti-spam limits.
2. Save the report in the portal database and open a Discord thread in the configured staff channel.
3. Let staff claim, update, resolve, or dismiss reports. Mirror each update to the player’s website ticket timeline.
4. Notify the reporter through Discord only when they have linked their account and enabled notifications.
5. Log every staff action with Discord user ID, target Steam ID, timestamp, and reason.

## Milestone 2 — Discord linking and roles

1. The website creates a short-lived, one-time link code for an authenticated Steam account.
2. The player runs `/link <code>` in Discord. The bot verifies and stores the Steam ID ↔ Discord ID mapping.
3. A `RolePolicy` table maps in-game groups / point thresholds to Discord roles.
4. The bot periodically evaluates point thresholds and current admin/VIP groups from the read model, then grants or removes only managed roles.
5. Manual staff roles remain untouched; the bot logs every role reconciliation.

## Milestone 3 — moderation and appeals

1. Post ban-appeal updates to a private staff thread and let reviewers change status or request details.
2. Allow approved appeal decisions to create a signed command for the Swiftly bridge plugin; the bridge executes the unban and records the result.
3. Add staff commands for ticket queues, player lookup, sanction history, and safe deep links to the portal.

## Implementation choices

- TypeScript, discord.js, MySQL/PostgreSQL via the same portal data-access package.
- Separate bot token, least-privilege Discord permissions, and per-guild configuration.
- A queue/outbox table between website/bot/game bridge for retries and an immutable audit trail.
