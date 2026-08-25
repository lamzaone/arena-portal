# ARENA Portal

The player portal for the ARENA CS2 server: Steam sign-in, player dashboard, moderation records, appeals, tickets, and the foundation for Discord linking and WeaponSkins loadouts.

## Start locally

1. Copy `.env.example` to `.env.local` and set `SITE_URL` to `http://localhost:3000` for local testing.
2. Set a long random `SESSION_SECRET` for CSRF protection on sensitive staff actions.
3. Run `npm install`, then `npm run dev`.
4. For tickets, appeals, and login sessions, create a separate database and run the SQL files in `db/` in numerical order. Do not run these migrations in the game database.
5. Add a read-only `GAME_DATABASE_URL` to display real data from K4 LevelRanks, VIPCore, Admins, and WeaponSkins.

For local testing with `http://localhost`, the session cookie is deliberately non-secure. Any public deployment must use an `https://` `SITE_URL`; its session cookie is always marked `Secure`.

## Security boundaries

- Steam OpenID is verified server-side before a cryptographically random HTTP-only session token is issued. Only its SHA-256 hash, SteamID64, expiry, and last-seen time are stored in the portal database.
- The game database account must be read-only.
- The portal database is separate and owns only website/bot data plus `portal_outbox` bridge jobs.
- Enable `PORTAL_BRIDGE_ENABLED=true` only after `TAPPED.PortalBridge` is installed and its `portal` Swiftly database connection points to `PORTAL_DATABASE_URL`. Website moderation is validated, queued, and then executed in-process through Swiftly's plugin APIs; it never writes game tables directly.

See [the website plan](docs/website-plan.md) and [the Discord bot plan](docs/discord-bot-plan.md) for the next milestones.
