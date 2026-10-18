# Arena portal workspace upgrade - 18 October 2026

The existing portal features remain available through the reorganized staff navigation. Portal database migrations 041 and 042 were subsequently applied and verified on 18 October 2026 at the user's request. No hosted portal deployment or remote CS2 connection was performed.

## Database preparation

These additive SQL files have been applied to the configured **Portal database** (`s6702_portal`):

1. `db/041_staff_recruitment.sql`: recruitment settings and private applications. Recruitment starts **closed**. Reapplying the migration preserves its current state. Staff can open it from Staff > Recruitment or the recruitment section on the public Staff page.
2. `db/042_case_priority.sql`: staff appeal/ticket priorities. Existing queues stay readable before this migration; priority editing shows an unavailable state.

Live verification confirmed all three new tables use InnoDB, their columns and indexes match the migrations, and recruitment is **closed**. The active-application uniqueness constraint and the case-priority queue index are present. The database now has 91 objects, up from 88; no existing tables or rows were modified.

The schema recovery record, exact migration copies and application receipt are saved in `D:/ARENA/.backups/portal-041-042-2026-10-18T02-15-20-537Z`. This record contains the previous schema definitions, not a full data backup. The three new tables were absent before application; the receipt includes migration hashes and the verified resulting schemas.

## Runtime files

PortalBridge **1.0.3** is built and staged directly in:

`D:/ARENA/addons/swiftlys2/plugins/TAPPED.PortalBridge`

Upload the staged plugin folder using your usual CS2 server process, retaining the existing server configuration. The staged files include the new `Admins.Comms.Contract.dll` export. Admins.Comms must be available for gag, mute and silence actions. The plugin should be reloaded through the usual server maintenance process after copying the files.

The bridge rechecks server scope, current staff permissions and immunity. Kick jobs expire after 30 seconds and check the player's connection identity/age before applying. Native moderation APIs dispatch persistence asynchronously, so server plugin logs remain the authority for a later database-write failure.

## Where the controls live

- **Staff > Groups & access > Admin / VIP / Custom**: use the horizontal group selector with search and sorting, then edit the selected group and its exact memberships at full width. Create Admin/VIP/Custom group is at the top of each type page, with an optional tag created and assigned immediately. Delete is beside the selected group's name. Founder remains protected; VIP deletion requires resolving active memberships. Custom deletion archives the group and revokes memberships/rewards while retaining history under Show disabled groups. Native Admin records remain permanent; change their exact group, or use a separate timed Arena assignment.
- **Custom tags & permissions**: create and assign player/group tags, grant/revoke direct privileges and timed player awards, manage the permission catalogue, and use the full VIP perk definition/assignment/grant ledger. Select Tag, Player name or Message to edit one channel at a time; drafts for all channels are retained and saved together. Tag records, color swatches and each effect's options start collapsed. Every effect has an independent toggle; opening options or toggling an effect preserves its settings. Shop listings retain their own tab.
- **Staff > Recruitment**: open/close recruitment and review every application. Applications retain the measured playtime and Discord link state at submission; under-30-hour applicants can submit and receive a visible warning. Accepting an application records the decision; assign staff access explicitly through Groups & access.
- **Bans / Communications**: separate staff pages. Communications is staff-only; the old `/communications` URL redirects to the protected staff workspace, and public navigation/search indexing omit it. The public Bans page remains read-only.
- **Appeals / Tickets**: staff queue filters/search and priority labels; player pages put active punishments first and closed history last.
- **Staff > Items**: Refresh all prices uses the existing full-catalogue refresh and database lock; a busy response is distinct from completion.
- **Player profiles**: permission-aware ban/kick/gag/mute/silence/warn controls and links to that player's group management. Warn uses the persistent warning system, with expiry, audit history and in-game acknowledgement, and returns staff to the same profile. Warning expiry must be at least one minute. Immunity is checked again on submit. Kick appears only for players on the current server. Players without a ranking record still have staff moderation controls when authorized.

Profiles also show stored round wins, win rate, assists, accuracy, damage and matches played. The current K4 version keeps killstreaks in memory; the portal displays a historical highest streak only if the game database actually has a `highest_killstreak` column, so it does not fabricate past records.

## Verification

Run `npm test`, `npm run typecheck`, `npm run build:hosting`, and `npm run test:workspaces:browser`. The browser fixtures are local-only with external requests blocked and cover mobile/desktop layouts and multiple themes. Runtime tests live in `D:/ARENA/tests/PortalBridge.Tests`.

Preview screenshots are in `.cache/group-workspace-previews`, `.cache/recruitment-previews` and `.cache/staff-inventories`.

Final local verification: production build and TypeScript checks passed; the full npm suite reported 698 test cases with 0 failures; all 15 workspace browser tests and 52 PortalBridge .NET tests passed. Independent code review findings were resolved and their regressions checked. Those local checks used no production connections. The subsequent migration application and schema verification connected only to the configured portal database.

Follow-up verification for staff-only Communications and profile Warn: all 702 npm test cases passed, as did TypeScript and the production build. Browser checks verified guest/member denial before reading records, safe legacy redirects, staff search and pagination, warning permissions, protected submissions, and phone/desktop layouts across default, TAP GOD and Beta Tester themes. Existing Bans, Warnings and staff-entry browser checks also passed. This follow-up requires no new migration or plugin changes.

Group-layout follow-up: 33 group tests, 24 chat-color/data tests and 8 browser test cases passed, along with TypeScript and the production build. Browser coverage includes horizontal selection and full-width panels, creation at the top, source-specific deletion/cancellation, Founder protection, archived-group access, channel draft preservation, and independent collapsed effect settings across phone/desktop sizes and Default, Shadow and TAP GOD themes. No new migration or plugin changes are required.
