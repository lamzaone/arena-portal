# Profile community

Reputation, commendations and profile comments are implemented locally. At the user's request, `db/043_profile_community.sql` was applied and verified on 18 October 2026 against the configured **portal database** (`s6702_portal`, MariaDB 10.5.19). Its five new InnoDB tables have the expected columns, indexes, defaults and enforced CHECK constraints. No existing tables or data were modified. The game database was not connected, and no plugin update or hosted portal deployment was performed.

The schema-only recovery record, migration copy and verified receipt are saved under `D:/ARENA/.backups/portal-043-2026-10-18T03-51-38-205Z`. Read-only checks using the actual community repositories confirmed that public snapshots and Staff summaries are available, commenting defaults to enabled and initial data is empty. The migration SHA256 is `69fbaa7b58cb750cff25cbca48b7a77f35473e74eca196424ba43561d3099282`.

Without the migration, the existing player profile still renders. Community features show an unavailable notice, and staff statistics show unavailable community totals as a dash.

## Player behavior

- Signed-in players can give another player +1 or -1 reputation. Selecting the same vote removes it; changing the vote replaces it. One actor/target row prevents score farming.
- Helpful, Teacher, Funny, Pro player and GOAT commendations are submitted together. An account has one mutable selection per other player, with each category counted once.
- Comments are plain text, 1–1000 characters, displayed ten per page. Each comment retains its author's equipped theme across the complete message container.
- The author or the profile owner can delete a comment after confirmation. Deleted records remain unavailable to public readers and cannot be resurrected by a delayed request retry.
- Owners can turn off new comments from their profile Settings. Existing comments stay visible. The server enforces this setting inside the same profile transaction used to post comments.
- Reputation and commendation totals appear beside the player identity and in the community section. Staff cards consume the same aggregate repository.

## Mutation boundaries

`GET/POST /api/players/[steamId]/community` returns private, uncached snapshots. Writes require a valid Steam session and a session-bound profile CSRF token. The actor comes exclusively from the session; target IDs, actions and fields are validated at both the route and repository boundaries. Self-votes, self-commendations and self-comments are rejected.

InnoDB target-profile row locks serialize vote/commendation replacements, comment settings, creation and deletion. A separate actor row enforces a 500 ms mutation cooldown across browser tabs. Repeated identical votes/commendation sets are no-ops. Comments use a unique actor/request UUID, so retrying a failed response cannot post the same comment twice. Comment posting is additionally limited to six per minute per actor.

Client actions lock synchronously before the first render, remain locked in flight, and observe the 500 ms minimum. Confirmed responses replace the displayed snapshot and refresh server-owned profile counters. Voting and deletion retain the current comment page through refreshes, while deletion on the final page uses server clamping. Keyed profile components clear drafts and pending interface state when navigating between players; delayed responses from an unmounted profile cannot repaint the next player.

## Verification

```powershell
node --experimental-transform-types --test lib/data/profile-community.test.ts
node --experimental-transform-types 'app/api/players/[steamId]/community/route.test.ts'
node --test components/profile-community.browser.test.mjs
npx tsc --noEmit --incremental false
```

The API test is invoked directly because Node's `--test` glob treats the literal brackets in `[steamId]` specially and can silently run zero tests. The data tests use an in-memory SQLite adapter, with serialized transaction connections to exercise replay and rollback behavior without connecting to production. Browser checks exercise real React controls with mocked API boundaries and verify all 13 registered themes at 1440 px and 390 px. Preview images live under `.cache/profile-community-previews/` and contain test fixtures only.
