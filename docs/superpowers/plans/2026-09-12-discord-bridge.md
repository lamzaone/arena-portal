# Discord bridge implementation plan

**Goal:** Link Discord and Steam identities from the portal or game, synchronize group roles, and notify staff of reports, tickets, and appeals.

**Architecture:** A standalone Node/discord.js process uses authenticated portal endpoints. The portal owns one-time codes, identity mappings, role mappings, and a durable notification queue. ArenaAdminExtensions redeems the same codes and writes reports into the portal queue through its named portal connection.

**Spec:** The user's four requested capabilities supersede the older direction of code issuance in `docs/discord-bot-plan.md`: Discord issues codes; website and game redeem them.

**Constraints:** Preserve existing uncommitted portal UI changes. Develop in the current shared workspace with exclusive file ownership across agents. Do not deploy, migrate live databases, register commands, or send Discord messages. Secrets stay in environment/configuration. Run the bot on a persistent Node host. The game database remains read-only for the bot integration.

- [x] Portal linking: hashed 12-hex-digit codes, ten-minute expiry, issuance cooldown, authenticated and CSRF-protected redemption, unique Steam/Discord mapping, audit. Verify reuse, conflicts, expiry, throttling, and rollback.
- [x] Bot runtime: private `/link`, authenticated portal client, managed group-role creation/update/reconciliation, bounded and explicit admin mentions, notification delivery/acknowledgement/retry. Verify with isolated fake transports and no live Discord connection.
- [x] Game integration: `/discordlink`, safe asynchronous replies, exclude codes from command logs, enqueue `/report` and `/calladmin` durably, acknowledge only successful delivery. Verify NUnit tests and plugin build.
- [x] Portal bridge service: authenticate before data access; resolve current authoritative groups and memberships; retain mappings by group ID; lease and acknowledge queued notifications; enqueue ticket/appeal alerts in their creation transaction. Verify SQL fixtures, auth rejection, retry/reclaim, stale lease protection, and failure-safe role snapshots.
- [x] Integration: run portal typecheck and tests, runtime tests, plugin build/tests; review all changed integration boundaries. Document migration order and separate bot setup. Record live-service checks as pending until configuration and deployment.

Decisions: one configured Discord guild per portal deployment; one running role-sync process; no unlink or moderation commands in this initial version. Existing webhook logging remains available for unrelated plugin events. Ticket/appeal notification production is opt-in via `DISCORD_NOTIFICATIONS_ENABLED=true` after migrations 027 and 028.

Verification on 2026-09-12: full existing portal suite passed; Discord portal suite 37 passed/1 MySQL test skipped; bot suite 15 passed; game suite 39 passed/5 MySQL tests skipped. Portal production hosting build and TypeScript checks passed. A compiled-portal smoke check rendered `/discord-link` and verified all five protected routes return 401 with live database connections disabled. Peer review fixes covered public `!discordlink` disclosure, game queue UTC timestamps, code expiry while waiting for insertion, notification event-type compatibility, and connection release when guild configuration is invalid. No live migrations, deployment, slash registration, or Discord messages were performed.
