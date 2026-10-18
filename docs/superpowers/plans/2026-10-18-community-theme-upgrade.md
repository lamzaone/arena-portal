# Community profiles and theme collection upgrade

**Goal:** Improve every portal surface, repair public Staff sizing, clarify VIP and trade states, and add real social interactions to player profiles.

**Design:** Boxed, architectural surfaces with precise corners, clear text spacing and a strong distinction between controls and decorative motion. Keep all theme palettes and ownership boundaries. Default receives a restrained crimson/gunmetal atmosphere; Beta has blue/yellow circuitry; Shadow uses platinum and obsidian; TAP GOD retains gothic crimson; ranked themes gain progressively richer geometry, reflections and glow. Reduced-motion, keyboard focus and phone layouts remain first-class.

**Social behavior:** Signed-in players interact with other players. One mutable reputation vote and one mutable set of Helpful/Teacher/Funny/Pro player/GOAT commendations per voter-target prevent repeated submissions from inflating totals. Plain-text comments are paginated; authors and profile owners can delete them. Profile owners control whether new comments are accepted. Public counts are read-only to guests. Prepare a local migration, preserve graceful unavailable states, and never apply migrations or upload without authorization.

- [x] Staff: fix the public/admin class collision, align recruitment/nav/shell widths, redesign member cards and add truthful batched moderation/playtime/community statistics.
- [x] Profiles: schema, repository, authenticated mutations, CSRF, social summary, multi-select commendations, reputation, themed comments, deletion and comment preference.
- [x] VIP/trades: clearer membership hierarchy/comparison/activation, separate pending offers from finished history, preserve every existing calculation/action.
- [x] Theme collection: default/Beta atmosphere slots, theme-specific boxed surfaces, progressive lighting and decorative geometry, stable controls and accessible motion across public/player/staff/economy pages.
- [x] Audit: review all route/component families for joined text, hidden linebreaks, width differences, overflow, readability and interactions; fix concrete issues at the source.
- [x] Verification: independent reviews, unit/data/API checks, responsive/theme browser fixtures, full tests, typecheck and local production build. Record migration and verification limits in the handoff.
- [x] Follow-up: larger Staff portraits, compact capped cards, mobile label spacing and focused responsive checks.
- [x] Apply migration 043 at the user's explicit request, preserve a schema recovery record and verify the live portal schema and repository reads.
