# Community profiles, Staff and theme collection

Implemented locally in the existing portal. Portal migration 043 was applied and verified at the user's request on 18 October 2026. No hosted portal deployment, server upload, or CS2 plugin change was performed.

## Public Staff

The public Staff route no longer uses the admin-only `staff-page` class, which forced different shell and navigation dimensions. Recruitment fills the shared public shell at phone, tablet and desktop widths. The directory now uses searchable, filtered role sections and themed boxed member cards with real batched statistics: bans, gags, mutes, paired silences, completed portal kicks, warnings, recorded hours, reputation and commendations. Cards cap at 540px, including single members, with framed 92px desktop and 72px phone portraits. Role sections stay compact around their roster. Missing data remains a dash; kicks explicitly identify their portal scope. Author and player theme boundaries are preserved.

## Profiles

Signed-in players can give another player one mutable +1/-1 reputation vote and a submitted selection of Helpful, Teacher, Funny, Pro player and GOAT commendations. Unique records and transaction locks prevent duplicate requests from inflating totals. Profile comments are plain text and paginated; authors and profile owners can delete them. The complete comment container keeps its author's equipped theme. Owners can disable new comments from Settings; existing comments remain readable.

The new API verifies the session, CSRF scope, target and action, enforces permissions and a database cooldown, and returns a fresh confirmed snapshot. Profile navigation clears drafts and ignores stale in-flight responses. Voting and deleting preserve the current comment page through route refreshes; deleting the last comment on a page uses the server's clamped page. A malformed Unicode action token now safely fails verification across all token scopes.

**Migration applied:** `db/043_profile_community.sql` was applied to the configured **portal database** (`s6702_portal`, MariaDB 10.5.19). Its five new InnoDB tables, 18 columns, eight indexes, defaults, unique request key and five enforced CHECK constraints were verified. The database now has 96 objects, up from 91. Existing objects and rows were not modified. Live repository reads confirmed public community snapshots and Staff aggregates are available, with commenting enabled by default. The game database was not connected.

The schema-only recovery record, exact migration copy/hash and verified receipt are in `D:/ARENA/.backups/portal-043-2026-10-18T03-51-38-205Z`. This is a schema recovery record, not a full data backup. No SQL was reapplied during postflight metadata normalization. See `docs/profile-community-2026-10-18.md` for the full data and mutation behavior.

## Trades and VIP

Pending incoming/outgoing trade offers appear separately above finished history. Each queue expands independently; resolved offers move out of the actionable queues after confirmation. Memberships now have a tier overview, exact available-benefit comparison, current membership context, and clear request/delivery/activation steps. The perk shop follows the same boxed layout. Existing membership conversion, activation, pricing and trade callbacks are preserved.

## Theme collection and page audit

Every trusted theme retains its source-controlled palette and ownership boundary. Default and Beta now have manifest-backed atmospheric backgrounds with layered lighting, perspective geometry and circuits. Silver, Gold, Diamond, Ultimate and the five Staff tiers have progressively richer reflections, materials and geometry. Shadow retains obsidian/platinum monograms; TAP GOD keeps gothic crimson, rain and sigils. The shared UI has precise boxed corners, themed surfaces, hover lighting, stable control feedback and artwork depth.

The global visual-effects control persists a decorative-motion preference without pausing loading feedback or game results. System reduced-motion preferences and reduced transparency remain respected; background motion pauses when the tab is hidden. Nested player surfaces resolve their own visual tokens, and outer cards cannot tilt another player's artwork.

All route families and TSX inline-text adjacency candidates were reviewed, including hidden linebreak rules. Shared sizing, wrapping and spacing remain consistent; deliberate block labels are not converted into invented inline prose. Responsive browser checks cover public, player, staff, VIP, trade, inventory, support and casino interfaces.

## Verification

- `npm test` passed, including new Staff statistics, community repository/API and all action-token scopes. Optional live database integration tests remain skipped when dedicated test database variables are absent.
- `npm run test:portal-ui` passed 98 checks, including all 13 themes at phone and desktop widths, actual Staff navigation/recruitment widths at three sizes, VIP/trade state transitions, community permissions and comments, history expansion, motion controls and theme ownership. The final Staff card refinement also passed all six focused browser checks, including width caps, portrait sizing and mobile word spacing.
- Additional existing VIP and support/communications/inventory/casino browser suites passed.
- TypeScript, whitespace checks and `npm run build:release` passed.
- Browser/data verification uses local fixtures and simulated storage. Live migration schema checks and read-only repository queries passed against the configured portal database. Live account mutations and MySQL isolation stress were not exercised.

Screenshots are under `.cache/theme-collection-previews/`, `.cache/recruitment-previews/`, `.cache/profile-community-previews/` and `.cache/vip-trades-previews/`. They contain test fixtures only. The local standalone build is under `.next/standalone`; retain the existing Linux hosting build/deployment process when publishing is requested.

The subsequent [recruitment review and Staff/profile follow-up](recruitment-review-2026-10-18.md) adds collapsed reviews, admin responses, full-list filters, the agreed age-18 advisory baseline, centered Staff cards with complete commend counts and the default/Beta profile foreground fix. Migration 044 was also applied and verified without changing existing application data or recruitment settings.
