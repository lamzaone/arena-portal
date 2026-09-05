# Live server status setup

`TAPPED.ServerLink` replaces the homepage's direct UDP query. The separate plugin
sends public snapshots to the portal over authenticated HTTPS. PortalBridge does
not need to be changed or enabled for this feature.

## Configuration and rollout order

1. Back up the portal database, then apply `db/027_server_link.sql` to
   `PORTAL_DATABASE_URL`, not the game database. This adds the server snapshot
   table without changing existing tables. The portal account needs SELECT,
   INSERT and UPDATE on this table; runtime DDL permission is unnecessary.
2. Generate a dedicated random secret (for example, 32 random bytes encoded as
   hex). Store the same value in the plugin's private config and the Worker's
   `SERVER_LINK_SECRET` secret. Never use a `NEXT_PUBLIC_` variable, put the token
   in a URL, or commit it to Git. Do not reuse `SESSION_SECRET`.
3. Ensure `GAME_SERVER_GUID` in the portal matches the plugin's server ID. Keep
   the existing `PORTAL_DATABASE_URL`, Steam key, session secret and resource
   bindings unchanged. Do not bulk-copy `.env.local` into production.
4. Build and deploy the portal using the existing OpenNext pipeline and
   `wrangler.jsonc`. Its entry point must remain `cloudflare/worker.mjs` to
   preserve request-scoped MySQL sockets. `npm run build` alone produces a Next.js
   build, not a deployable Cloudflare Worker bundle.
5. Publish and install `TAPPED.ServerLink` following its README. Configure the
   HTTPS endpoint `https://tapped.ro/api/server-link/heartbeat`, the matching
   server ID and secret, then enable the plugin. It needs outbound HTTPS access;
   no new inbound game-server port is needed.

## Observable behavior

### Live terminal stats (ServerLink 1.1.0)

Apply `db/028_server_link_time_left.sql` after migration 027 and before deploying
the updated portal. Install the rebuilt `TAPPED.ServerLink` plugin to supply
`timeLeftSeconds` and roster `connectedSeconds` / `score`. Existing plugin
configuration and credentials remain compatible. Old senders remain accepted;
missing stats display a dash instead of a fabricated zero.

Time left uses `mp_timelimit` and the current game rules' match start time.
Warmup, untimed maps, and unavailable game rules display a dash. Empty-server
snapshots keep the captured game timer stationary while the server hibernates.
Player time online is the current connection duration in seconds; score is the
live scoreboard score, not a persistent ranking total. The portal adjusts times
for snapshot age and updates visible clocks once per second between polls.

The terminal uses semantic theme variables for Default, Beta Tester and Tap God.
Each roster entry and floating preview belongs to the displayed player's equipped
theme. Public identities and group badges are resolved in batches; opening a
preview does not fetch data.

The homepage loads independently from server status. Map/count/roster arrive
without waiting for Steam avatars. Player names link to `/players/{steamId}`;
Steam links use the public profile URL. Player IPs and private account data are
not part of the heartbeat or public response.

The plugin sends every ten seconds; the visible homepage polls every ten seconds.
An empty online server is distinct from missing status. After 45 seconds without
a fresh accepted heartbeat, the page shows Connection lost and stops presenting
the old roster as current. A missing snapshot or failed read shows Status
unavailable, not Offline. Database or HTTP outages do not prove the game server
is down.

## Release checks

- GET `/api/server-status` returns current map, counts, roster and last receipt
  time, without a token or plugin session identifier.
- An unauthenticated POST to `/api/server-link/heartbeat` is rejected and does
  not update the stored heartbeat time.
- Connect and disconnect a player; confirm the roster follows and both profile
  links work. Names remain visible when avatar lookup fails.
- Change maps; verify the old map/roster cannot return from an in-flight update.
- Leave the server empty long enough to hibernate; verify updates continue.
- Reload the plugin and confirm the new session takes over. Disable it and wait
  over 45 seconds; verify Connection lost instead of an apparently live roster.
- Check the homepage on mobile and desktop, including a full server and long
  names. Verify Steam login/session behavior remains unchanged.

Local unit tests and browser fixtures are not a substitute for those live checks.

## Rollback

Disable ServerLink first, then restore the prior portal Worker version and plugin
files if necessary. Leave the additive snapshot table in place: it is inert when
unused and preserves rollback data. Do not drop tables or rotate unrelated
secrets as part of rollback. The previous portal version may again show the
unsupported UDP check's misleading Offline state on Workers.
