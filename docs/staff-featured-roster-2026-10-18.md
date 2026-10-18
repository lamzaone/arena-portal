# Staff roster and profile header

Implemented the selected option C mockup in the existing public `/staff` route.

The desktop layout places the introduction, role filters, recruitment link and motion control in a 240px sidebar. Search and a synchronized set of role filters sit above the directory. Founder and Owner groups have wide, expanded cards; other roles use compact rows showing hours, reputation and commend totals. Native Details disclosures reveal the full administrative actions, communication restrictions, commendation breakdown, profile and Discord links.

Group names, order, counts, Steam avatars, presence and statistics still come from the existing public directory. Member surfaces use each player's equipped theme. No mockup portraits, fictional biographies or demonstration numbers were added to production. Missing statistics remain unavailable rather than becoming zero.

Recruitment appears above the roster at the existing `#recruitment` anchor, with its application, status and staff review flow intact. The roster adapts to its available container width. Narrow screens place the sidebar content above the directory and stack the member cards. Single-member compact groups use the same left-aligned column width as other compact cards, capped at 640px when the directory is narrower. Each rank heading has an opaque crimson divider, 2px tall with at least 48px of space reserved for the rule.

The shared badge catalogue now offers 24 symbols. The 18 added options include medals, trophies, gems, swords, crosshairs, flames, community and support symbols. Group create/edit selectors and server validation consume the same catalogue; Staff and profile badges share the exhaustive icon renderer. Existing group assignments and selected symbols are preserved.

The player profile header separates avatar/name and live status from Steam/theme metadata, additional group badges and action links. Scoped styles keep control sizing and wrapping consistent across equipped themes. The server-presence panel names ARENA.TAPPED.RO and retains the existing live-roster polling, failed-heartbeat expiry and recovery behavior. Steam presence never substitutes for CS2 roster membership.

## Verification

- New browser regression failed against the previous implementation before production changes.
- `npm run test:staff`: 51 tests passed.
- `node --test app/staff/recruitment.browser.test.mjs`: 23 tests passed, covering keyboard disclosures, profile/Discord destinations, filters, search, theme ownership, unavailable values, top recruitment placement, singleton geometry and painted red dividers against all 13 actual global-theme backgrounds.
- `npm run test:groups`: 37 tests passed, including actual badge rendering, create/update validation, legacy symbols and unknown-icon fallback.
- `npm run test:portal-ui`: all 136 checks passed with zero failures or skipped checks, including the updated Staff and profile regressions.
- `npm run test:server-status`: 40 tests passed; two optional live integration checks were skipped.
- Profile browser coverage includes crowded headers across five themes at 390px, 768px and 1440px, all three server-presence states, motion controls, failed-heartbeat expiry and fresh-roster recovery. Existing full-profile painting and ownership checks still cover all 13 themes.
- `npm run typecheck`: passed.
- `npm run build:release`: passed; the updated local standalone build is in `.next/standalone`.
- Independent code review found no blocking issues.

Visually reviewed fixture screenshots include `.cache/recruitment-previews/crowded-tap-god-{390,768,1440,1920}.png`, `.cache/player-profile-theme-previews/header-{tap_god,default,beta_tester,owner,shadow}-{390,768,1440}.png` and `presence-{online,offline,unknown}-{390,768,1440}.png`. These use demonstration accounts and statistics.

The implementation and build are local. No hosted deployment was performed.
