# ARENA Discord bot

A separate persistent Node process that links Discord accounts to the portal's Steam identity, synchronizes effective portal/game groups, and delivers staff alerts. It uses only the authenticated portal HTTP bridge; it does not read the game or portal database.

## Setup

1. Use Node 24 (minimum 22.14). From this directory, run `npm ci`, then `npm run build` and `npm test`.
2. Create a Discord application/bot in the [Developer Portal](https://discord.com/developers/applications). Enable **Server Members Intent** on the Bot page. The runtime requests only Guilds and Guild Members; Message Content Intent is unnecessary.
3. Install the bot in the intended server with the `bot` and `applications.commands` scopes. Grant **Manage Roles**, and **View Channel**, **Send Messages**, and **Embed Links** in the staff text channel. Put the bot's role above all roles it creates/manages. Administrator permission is unnecessary.
4. Copy `.env.example` to `.env`, then enter the bot token, guild ID, staff channel ID, portal origin and the same `DISCORD_BRIDGE_SECRET` configured on the portal (at least 32 random characters). Use HTTPS except for localhost development. Treat `.env` as a secret; do not commit it. The portal must use this same `DISCORD_GUILD_ID`.
5. Run `npm run register` once to create/update the guild-scoped `/link` command. This is an explicit Discord API write and is never performed by build, tests, or startup. It preserves other slash commands.
6. Run `npm start` using a persistent service host/process supervisor with automatic restart. Use **one active bot process per guild/portal**. This is not a Cloudflare Worker or request-only/serverless process.

No live registration, login, or Discord messages are required by tests.

## Automatic deployment on FreakHosting

The **Discord bot deployment** GitHub Actions workflow builds and uploads one
compressed release over SSH. It reuses the portal's five `FREAKHOSTING_SSH_*` /
`FREAKHOSTING_KNOWN_HOSTS` secrets from the [portal deployment setup](../docs/freakhosting-cicd.md#github-configuration).
You do not need FTP or an npm install on the host for updates.

One-time setup, after these changes are pushed to `main`:

1. In GitHub **Settings > Secrets and variables > Actions > Variables**, add
   `FREAKHOSTING_BOT_DEPLOY_ENABLED` with value `true`. This is separate from the
   portal's deployment switch.
2. Open **Actions > Discord bot deployment > Run workflow**, selecting `main`.
   The first deployment stages the runtime at `~/arena-discord-bot/current`.
   It prints **First bot release staged**; the bot starts only after the panel setup.
3. Create or retain `~/arena-discord-bot/.env` using [.env.example](.env.example).
   Keep the same token, IDs and bridge secret if you already configured them.
   Set permissions to `600`. This file stays outside releases and is never
   uploaded by CI or overwritten during deployment.
4. If replacing an FTP installation, stop its existing bot application by
   switching it to Manual mode. Configure the bot's Node.js application as follows:

   | Field | Value |
   | --- | --- |
   | Node | `24` |
   | Working directory | `arena-discord-bot` |
   | Startup command | `bash start-hosting.sh` |
   | Mode | Automatic (Production) |
   | Proxy | Disabled; no application port needed |

5. If `/link` has never been registered, run this once in the hosting terminal
   with Node 24 selected: `cd ~/arena-discord-bot` followed by
   `node --env-file=.env current/src/register.mjs`.
6. Check the bot is online and review its `~/persistent_app_<ID>.log` in Enhance.

After setup, push bot changes to `main`, or use **Run workflow**, to deploy.
GitHub tests the bot, bundles its dependencies, uploads the archive and switches
the active release. Enhance restarts the bot automatically. No panel restart is
needed for routine updates. A short reconnect occurs during the restart.

The deployment checks that the new process connects to Discord, validates its
guild/channel permissions and reads the portal snapshot. A local heartbeat
provides readiness without an HTTP port; it does not prove every later role sync
or notification succeeds. A failed update restores the previous release and
launcher and reports failure. The launcher prevents overlapping managed bot
processes. Only the verified bot PID is signalled; the website process is separate.
Shutdown allows 30 seconds for in-flight work before forcibly stopping a still
verified bot process. A stopped/crashed release can receive a repair deployment,
provided Enhance Automatic mode is enabled to start the replacement.

Successful updates retain the active and previous release. Failed releases remain
available for investigation until a later successful deployment removes them.
If the recorded PID belongs to an unverified live process or an untracked process
holds the launcher lock, deployment stops before switching releases: check the
startup command, `bot.pid` and application log.
After an SSH disconnect during activation, inspect `~/arena-discord-bot/current`
and the log before retrying; the remote activation may already have started.

Without `FREAKHOSTING_BOT_DEPLOY_ENABLED=true`, the workflow still tests and saves
a downloadable artifact but does not contact the host. Neither database migrations
nor slash-command registration run automatically. Hosting requirements and SSH
troubleshooting are the same as for the portal. See also
[Enhance's Node.js process settings](https://enhance.com/docs/website-tools/nodejs).

## Linking and roles

In Discord, `/link` returns a private, one-use code and expiry. The user signs in with Steam on `/discord-link` and enters the code, or uses `/discordlink CODE` in game. The code belongs to the invoking Discord user and is never logged. The portal owns expiry, replay prevention and account-conflict handling.

Every 60 seconds after the previous sync finishes, the bot fetches the full portal snapshot and all guild members. Each enabled group gets a separate Discord role named/colored after that group; membership uses effective, unexpired groups. Disabled groups and stale/unlinked users lose the corresponding managed roles. Unrelated roles remain untouched. Linked users absent from the guild are skipped and receive roles after joining on a later sync.

Only persisted role IDs are managed. Existing roles with matching names are never adopted. New mappings are persisted before assignment; role recreation uses compare-and-swap with `previousRoleId`. Bot-created roles grant **zero Discord permissions**. An admin group denotes portal/game admins and makes its role mentionable; it does not grant Discord Administrator. Do not manually assign Discord permissions to managed roles because synchronization resets them to zero. For channel access, use separate Discord roles or explicit channel overwrites.

The bot aborts on unavailable/malformed snapshots, failed member fetches, protected mapped roles, or roles above its hierarchy. It never interprets an upstream outage as an empty membership list. Deleted mapped roles are recreated for enabled groups. Disabled roles are retained empty so historical mappings remain safe. A role whose mapping cannot be persisted is deleted on a best-effort basis; a crash in that short window can leave an unassigned, zero-permission orphan for manual cleanup.

## Staff alerts

The bot polls every five seconds after the previous poll finishes. Before claiming events, it refreshes admin groups and requires all enabled admin-group roles plus every configured `DISCORD_ADMIN_ROLE_IDS` role to exist and be mentionable. If no roles resolve or one cannot be pinged, the bot logs a configuration warning and leaves events queued. Optional fallback roles can be marked mentionable manually, or grant the bot **Mention Everyone** only in the staff channel. Explicit allowed mentions still permit only the resolved admin role IDs; user mentions and `@everyone`/`@here` in submitted content cannot ping.

Reports, `/calladmin`, appeals and tickets use bounded embeds. Only URLs on `PORTAL_URL` become embed links. Messages are acknowledged as complete only after Discord returns a message ID; send failures are retried using the portal's durable lease. A deterministic nonce with `enforceNonce` reduces duplicates after a crash or lost acknowledgement. Discord's deduplication window is limited, so delivery is at least once and an occasional duplicate remains possible. A send/ack failure never silently marks an event sent.

## HTTP contract

All requests include `Authorization: Bearer DISCORD_BRIDGE_SECRET`, reject redirects, time out after ten seconds, and limit responses to 16 MiB. Secrets, private codes, event text and raw upstream errors are excluded from logs.

| Endpoint | Request / response |
| --- | --- |
| `POST /api/discord/bot/link-code` | `{discordUserId}` → `{code, expiresAt, linkUrl}` |
| `GET /api/discord/bot/snapshot` | `{groups:[{id,name,color,isAdmin,enabled}], members:[{discordUserId,groupIds}], roles:[{groupId,discordRoleId}]}` |
| `POST /api/discord/bot/roles` | `{groupId,discordRoleId,previousRoleId}` → JSON success; `previousRoleId:null` for new mapping |
| `POST /api/discord/bot/notifications` | `{action:"claim"}` → `{events:[{id,leaseToken,eventType,title,body,url,steamId}]}` |
| Same notification endpoint | `{action:"complete",id,leaseToken,messageId}` or `{action:"retry",id,leaseToken,error}` → JSON success |

The portal must retain all known group definitions, including disabled/archived ones, and return a failure if any authoritative membership source cannot be read. It must serialize durable claims, reject stale lease acknowledgements, and release expired leases for retry. Only one event per claim is recommended so the lease cannot expire while waiting behind other Discord sends.

## Verification and references

`npm run build` checks native ESM syntax. `npm test` exercises configuration, authenticated requests, snapshot failure safety, managed role creation/cleanup, private links, admin mention restrictions, send/ack ordering, retries and serialized polling using controlled Discord/HTTP boundaries without credentials or network.

Pinned dependency: discord.js 14.27.0. Behavior was checked against the installed package declarations and official documentation for [role creation](https://discord.js.org/docs/packages/discord.js/14.27.0/RoleCreateOptions:Interface), [member fetching](https://discord.js.org/docs/packages/discord.js/14.27.0/GuildMemberManager:Class), [message nonce and mentions](https://discord.js.org/docs/packages/discord.js/14.27.0/MessageCreateOptions:Interface), and [Discord role hierarchy](https://docs.discord.com/developers/topics/permissions).
