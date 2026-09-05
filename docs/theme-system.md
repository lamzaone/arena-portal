# Portal theme system

Portal themes are trusted, source-controlled presentation packages. Database
records may grant and equip a registered theme key, but they never supply CSS,
class names, components, or asset paths.

## Feature surfaces

Every manifest in `lib/themes/` declares three independent surfaces:

- `global` styles the signed-in viewer's portal shell, controls, searches,
  panels, tables, and pagination.
- `profile` styles the full public player profile page.
- `smallProfile` styles reusable player objects in ranking, VIP, staff, search,
  trade, case, mention, and hover-card contexts.

On a successful `/players/[steamId]` route, the viewed player is the full-page
theme owner. Their resolved `profile` surface controls profile content and
background, while their resolved `global` surface controls the header and
account navigation. Missing surfaces still fall back to the stable default;
they never fall back to the signed-in viewer's theme. Compact `PlayerIdentity`
objects remain owned by the player they represent.

Profile backgrounds and document effects have route priority. The viewer's
global background is suppressed while a real profile is mounted, and the
profile document-effect registration outranks the global registration. Leaving
the profile route restores the viewer's effects.

Set any surface to `false` when a theme does not provide that feature. The
renderer then uses the stable ARENA default for that surface. The default theme
must always define all three surfaces.

## Add a theme

1. Copy one manifest in `lib/themes/` and give it a unique key. Keep the
   manifest serializable. Use only the allowlisted icon/background keys from
   `lib/themes/types.ts`.
2. Register the manifest in `lib/themes/registry.ts`.
3. Add one stylesheet in `app/themes/`. Scope full-page rules to the manifest's
   global/profile class and compact rules to its small-profile class. Override
   the semantic `--theme-*` and `--player-identity-*` variables before adding
   bespoke effects.
4. Import the stylesheet in `app/layout.tsx`, before `accessibility.css`.
5. If the theme needs a new React-rendered icon or background, add a string key
   to `lib/themes/types.ts` and its trusted component mapping to
   `components/theme-runtime-assets.tsx`.
6. Add the matching theme/catalogue entitlement through a portal database
   migration. The database key must match the source-controlled registry key.

Run `npm run typecheck`, `npm run build`, and `git diff --check` before shipping.

## Shared UI rules

- Shared components consume semantic variables; they do not branch on theme
  keys.
- Persistent navigation reads its effective theme from its own `data-theme`
  boundary. Pass a route override to `SiteHeader` only when that route owns the
  full-page presentation.
- Use `PortalShell`, `Panel`, `DataTable`, `LinkPagination`, and
  `PlayerIdentity` instead of recreating page chrome, tables, navigation, or
  player links.
- Resolve visible players in one batch with `resolvePlayerIdentities`; hover
  cards render only supplied public data and make no request when opened.
  Omitted `identityGroups` now loads all effective public group badges in that
  batch. Pass a group array only when it is already authoritative, including an
  intentional empty array. Keep the complete badge array in search results and
  player identities. To show fewer badges beside a name, use `inlineBadgeGroups`;
  this does not filter the badges inside the hover preview.
- Keep theme-specific geometry and animation inside that theme's stylesheet.
  Respect the reduced-motion and forced-colors rules imported last from
  `app/themes/accessibility.css`.
