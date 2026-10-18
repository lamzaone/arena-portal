# Portal refresh — 18 October 2026

Implemented in the existing portal checkout. No upload, Git push, deployment, database migration or CS2 plugin change was performed.

## Experience

- Home uses the existing TAPPED emblem in a CSS 3D scene, with a pause control and reduced-motion support. Live server status and approximate Discord member/online counts sit together, followed by clear links into Features, rankings, inventory and memberships.
- `/features` replaces Modes with a sectioned guide covering arena preferences, round formats, challenges, custom duels/stakes, Tokens/drops, cases, market/trading, loadout, casino, ranking/VIP, Discord/chat/maps and support. `/modes` permanently redirects; compatible section IDs remain available. Arena details were checked against staged local configuration.
- Shared ambient lighting, translucent navigation, surface highlights, focus states and artwork depth use the existing semantic theme colors. Equipped themes remain independent; interactive controls stay stable.
- Groups & accesses retains the horizontal group selector and full-width editor, with clearer navigation, scoped metrics, rail controls, selection context, member shortcuts and optional forms behind disclosures.
- Profile warnings, bans and communications initially show three records. Show more reveals ten records with independent server pagination, including history beyond the previous caps. Bans stay above gags/mutes. Private record visibility is preserved.
- The public profile marker uses the CS2 heartbeat roster, refreshes while visible, and expires stale snapshots. Website or Steam activity does not establish server presence.

## Actions and confirmation

- Button and submit capture guards reject rapid repeat actions within 500ms. Identical economy requests share their in-flight operation and remain busy for at least 500ms; existing idempotency keys and error handling remain intact.
- Progressive forms keep pending state through completion and refresh after the destination commits, including redirects with encoded warning messages. Discord linking now refreshes confirmed server state and immediately locks duplicate submissions.
- Moderation follows the existing queue without replaying mutations. The private status endpoint requires staff access and exact job ownership. A completed bridge job is not enough for bans/gags/mutes: the endpoint verifies the matching saved native record, both kinds for silence, or absence of every active target ban for unban. Only then does the UI announce confirmation and refresh.
- Confirmation polling is bounded to 40 seconds. Unavailable or unconfirmed outcomes remain explicit. New bans include millisecond `queuedAt` in their JSON job payload; no schema change is needed. Existing native records have no portal job ID, so full fingerprint/timestamp matching is used. Ambiguous legacy insert jobs remain unconfirmed; portal/server clocks must agree.
- Disabled legacy WeaponSkins `/skins` behavior was preserved. Active inventory/loadout/trade/casino paths already reconcile confirmed state.

## Verification

- `npm test` passed. Optional database-backed integrations remain skipped when their dedicated test database is not configured.
- `npm run test:portal-ui`: 26/26 browser checks passed, covering phone/desktop layouts, themes, expansion/paging, presence, Groups permissions/actions, motion, Discord failures/linking, duplicate submissions and destination refreshes.
- `npm run test:moderation:browser`: 18/18 passed; `npm run test:navigation:browser`: 1/1 passed.
- Focused moderation, economy request, server presence and Discord tests passed, including eight durable moderation-status tests.
- `npm run typecheck` and `npm run build:release` passed. A pre-existing empty `.next/dev/types/routes.d.ts` was repaired from freshly generated route declarations to unblock build verification; no application configuration was weakened.
- Screenshots were reviewed under `.cache/home-features-previews/` and `.cache/group-workspace-previews/`. Browser fixtures use simulated state; live CS2 moderation was not exercised.

The standalone build is under `.next/standalone`. Use the repository's existing hosting process when deployment is requested; Windows build output is local verification, not a replacement for the Linux hosting bundle.
