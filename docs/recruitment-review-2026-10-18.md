# Recruitment review follow-up

The portal code now shows applicant names in collapsed review rows. Status, identifiers, facts, baseline assessment, application text and review actions appear only after expanding a row. The review workspace filters all applications by literal player-name substring and status before counting or paginating. Filters reset the page on a new search and remain in pagination links and confirmed review/open/close redirects.

Staff can save an optional plain-text response of up to 2,000 characters alongside a review. The applicant sees that response on their own latest application, including closed recruitment and final decisions. Staff may edit or clear feedback on a final application while preserving its decision. Session-derived staff authorization, CSRF checks, row locks, idempotent unchanged reviews and transactional audit persistence remain in place. Accepting an application does not automatically grant staff access.

The agreed baseline is **age 18+, 30 server hours, verified Steam + Discord linking, and Steam group membership**. The shared policy powers the applicant's live checklist and the staff review snapshot. Missing or unverified criteria appear in red with text and icons. Players see that they may have a lower chance of acceptance and can still apply. Basic form validation remains separate: for example, age 17 with a valid Discord contact and a “No” group answer can still be submitted. Steam group membership remains self-reported; server playtime and Discord-link verification remain server-derived.

## Database migration

At the user's standing request to apply completed migrations, `db/044_staff_recruitment_responses.sql` was applied to the configured portal database (`s6702_portal`, MariaDB 10.5.19). It adds nullable `admin_response TEXT` to `portal_staff_applications`. Both existing applications, their generated active-application uniqueness key, all existing column metadata/indexes and recruitment settings were verified unchanged. Existing feedback starts NULL.

The exact SQL/hash, full backup of the target application rows and settings, previous schema and verified receipt are under `D:/ARENA/.backups/portal-044-2026-10-18T04-02-30-040Z`. This is a target-table backup, not a complete portal backup. Read-only checks through the actual repository confirmed listing, own-application reads and escaped name/status filtering against MariaDB. No live reviews were submitted, no game database connection was opened and no hosted portal upload was performed.

## Staff cards and profile themes

Staff role panels and cards now center within the roster, including single-member groups, filtered single results and the final card of an odd row. Cards retain their 540px cap and larger framed portraits. Bans, confirmed portal kicks and warnings appear together in an **Admin actions taken** strip matching the communication restrictions strip. Hours and reputation use a compact standing band. The commendations section shows its total plus Helpful, Teacher, Funny, Pro player and GOAT counts from the existing batched community summaries. Unavailable data stays a dash rather than an invented zero.

The default and Beta profile backgrounds could cover static sections even though their text had valid colors and opacity. The shared full-profile shell now establishes the foreground layer above its background. This fixes administrative options, combat/arena performance, groups, community controls and comments when no theme is equipped, while preserving each nested author's theme. The regression renders the real profile and measures painted heading pixels, since computed visibility alone did not detect the obstruction. Desktop and phone checks cover all 13 registered themes, own profiles, reduced motion, persisted effects pause and tab changes.

## Verification

- The full `npm test` suite passed; optional dedicated live-database integration tests remain skipped when their test variables are absent.
- `npm run test:staff` passed all 49 checks after the final Staff data changes, including real commend-count mapping, unavailable values, response permissions/limits, immutable final decisions, rollback, literal filtering and advisory requirements.
- `npm run test:portal-ui` passed all 127 checks. Recruitment/Staff coverage includes compact reviews, full-list GET filters, pagination and action context, safe feedback rendering and ownership, live red requirements, a JavaScript-disabled native application submission, centered single/odd rosters, complete commend counts and unavailable states. Full-profile paint checks cover all 13 themes at 390px and 1440px, own settings, default-themed authors in equipped profiles, reduced motion and global pause.
- TypeScript, whitespace checks and the final `npm run build:release` passed. No hosted portal deployment was performed.

Fixture-only screenshots are under `.cache/recruitment-previews/` (`admin-collapsed-*`, `admin-expanded-*`, `criteria-*`, `member-redesign-*`, `public-*`) and `.cache/player-profile-theme-previews/`. SQL application and repository read checks are recorded separately in the migration receipt above; live account mutation and database isolation stress tests were not performed.
