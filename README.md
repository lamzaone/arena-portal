# ARENA Portal

The player portal for the ARENA CS2 server: Steam sign-in, player dashboard, moderation records, appeals, tickets, and the foundation for Discord linking and WeaponSkins loadouts.

## Start locally

1. Copy `.env.example` to `.env.local` and set `SITE_URL` to `http://localhost:3000` for local testing.
2. Set a long random `SESSION_SECRET`.
3. Run `npm install`, then `npm run dev`.
4. For tickets and appeals, create a separate database and run `db/001_portal.sql` against it. Do not run this migration in the game database.
5. Add a read-only `GAME_DATABASE_URL` to display real data from K4 LevelRanks, VIPCore, Admins, and WeaponSkins.

## Security boundaries

- Steam OpenID is verified server-side before a signed HTTP-only session cookie is issued.
- The game database account must be read-only.
- The portal database is separate and owns only website/bot data.
- Future game-changing actions are put in `portal_outbox` and consumed by a Swiftly bridge plugin after validation and audit logging.

See [the website plan](docs/website-plan.md) and [the Discord bot plan](docs/discord-bot-plan.md) for the next milestones.
