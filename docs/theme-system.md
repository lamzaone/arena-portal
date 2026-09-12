# Portal theme system

Portal themes are trusted, source-controlled presentation packages. Database
records may grant and equip a registered theme key, but they never supply CSS,
class names, components, or asset paths.

## Feature surfaces

Every current theme styles all four surfaces. Each manifest in `lib/themes/`
declares them separately so future themes can target individual surfaces:

- `global` styles the signed-in viewer's portal shell, controls, searches,
  panels, tables, and pagination.
- `profile` styles the full public player profile page.
- `smallProfile` styles reusable player objects in ranking, VIP, staff, search,
  trade, case, mention, and hover-card contexts.
- `playerContainer` styles a represented player's surrounding record, message,
  search result, or table row independently of the viewer's theme.

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

Future themes may set a surface to `false` when they do not provide that feature.
The renderer then uses the stable ARENA default for that surface. All currently
registered themes, including BETA TESTER, TAP GOD and Shadow, define all four surfaces;
the default theme must always do so.

## VIP and staff themes

`lib/themes/ranks.ts` defines nine trusted themes. Standard and Founder have no
new theme. All colors match the group's public badge palette at registration.

| Themes | Coverage | Visual progression |
| --- | --- | --- |
| VIP Silver | All four surfaces | Brushed silver, satin reflections and a metallic avatar crest |
| VIP Gold | All four surfaces | Gold grain, gilded borders and moving metallic highlights |
| VIP Diamond | All four surfaces | Diamond facets, geometric gems and prismatic glints |
| VIP Ultimate | All four surfaces | Electric amethyst, branching arcs and charged geometry |
| Staff | All four surfaces | Brushed steel, precise grid details and a shield crest |
| Moderator | All four surfaces | Jade edges and sweeping scanner details |
| Administrator | All four surfaces | Amber traces, illuminated geometry and sweeping highlights |
| Sr. Administrator | All four surfaces | Violet orbital details, layered geometry and drifting particles |
| Owner | All four surfaces | Crimson crown halo and layered crest |

Every current tier applies to site navigation, compact identities and player
containers. Each represented player still owns their local theme boundary,
including hover and selected shadow tokens as well as base colors. Enabling a
surface does not grant the theme: the player must own its available inventory
item before selecting it.

`app/themes/ranks.css` owns the palettes and foundational effects;
`app/themes/rank-details.css` adds tier-specific materials and motion. The
shared `RankThemeBackground` and `RankThemeGeometry` render decorative markup
without animation JavaScript. Motion is restrained on touch devices, disabled
for reduced motion, and decorations disappear in forced-colors mode. SVG
previews live under `public/images/economy/profile-themes/`.

Migration `db/026_rank_themes.sql` registers the nine enabled, **unlisted** items
and matching profile themes. `marketEnabled=false` excludes them from public
Market listing and purchase. It creates no prices, rewards, inventory grants,
or equipped selections. Staff can find each name ending in “Theme” in Items and
assign it through Groups & access. Choose `account_bound` for a reward that
expires with membership; tradable rewards and direct grants retain normal
inventory ownership behavior. No theme name implies a permission or forces a
particular reward group.

Migration `db/029_global_theme_metadata.sql` updates descriptions and canonical
surface metadata for existing registered BETA TESTER, TAP GOD and rank themes.
It preserves listing status, enabled flags, prices, rewards, inventory ownership
and equipped selections. Fresh rank registrations in migration 026 also name
all four surfaces. Runtime presentation still comes from the trusted registry;
metadata does not authorize theme access or inject styling.

The selected theme is stored on the account and persists across sessions while
its registered, enabled theme item remains available in that player's inventory.
Session/profile reads, Settings reads/writes, and inventory equip use this same
ownership check. Membership lookups and catalogue listing changes cannot hide
an item the player still owns or silently select the default theme. The existing
reward lifecycle remains responsible for revoking membership rewards; once the
inventory item is revoked, transferred, or otherwise unavailable, it no longer
authorizes the theme. Selecting ARENA default explicitly remains supported.

`npm run test:themes` covers surface fallbacks, progression, existing-theme
compatibility, session renewal, membership outages, inventory revocation,
permanent grants and both equip paths. The
entitlement tests use isolated SQLite fixtures with the real relational queries;
they do not claim to exercise MySQL locking or cross-database atomicity.

## Shadow

Shadow is a standalone owned theme for all four surfaces. Its black palette
uses obsidian panels, an embossed TAPPED monogram, drifting shadow forms and a
moving platinum edge. It follows the same inventory ownership and equipped
selection checks as every other registered theme; its name grants no rank or
permission.

Migration `db/030_shadow_theme.sql` registers the Special-grade **Shadow Theme**
item with catalogue key `arena:special:profile_theme:shadow` and trusted theme
key `shadow`. Its thumbnail is `/images/economy/profile-themes/shadow.svg`.
The first registration is enabled and unlisted (`marketEnabled=false`), with
no price or inventory grant. Staff can grant it through Items or associate it
with an existing group reward. A player who owns an available copy can equip
it through Inventory or Settings.

Run migration 030 against the portal database with the Shadow build available.
It requires the existing theme/inventory entitlement schema from migrations
008 and 013-015, and does not require rerunning older product migrations.
Reruns update presentation metadata while preserving listing status, enabled
flags, prices, existing IDs, catalogue associations, ownership and equipped
selections. Registration does not publish the item to Market.

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
- Use `SearchField`, `ServerSearchField`, and `PlayerSearchField` for search.
  Their outer `[data-part="control"]` owns the themed surface and focus ring;
  inner inputs carry `data-search-input` and are excluded from generic form
  skins and input focus outlines. Keep those inputs transparent with no
  border or shadow. The icon and trailing action columns provide the inset.
  Labels use a 16px line and 8px gap; `SearchSubmitButton alignWithLabel` uses
  the matching 24px offset. `labelHidden` preserves an accessible label in
  compact directory filters.
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
  Respect the reduced-motion and forced-colors rules in
  `app/themes/accessibility.css`. Styles imported after that file must include
  equivalent preference guards, as `app/themes/rank-details.css` does.

Staff pages pass their authorized `StaffSubmenu` through `PortalShell.navigation`.
The shell provides the `staff-content` size container; responsive Staff module
rules use that container rather than the full viewport. Groups detail panels
provide a nested container with the same name so their forms respond to the
space left beside the group browser.

Use `PortalToast` for action feedback and `ConfirmSubmitButton` for existing
confirmation flows. Their CSS modules consume the semantic theme tokens and
handle reduced motion. Keep `app/staff-workspace.css`,
`app/themes/refinements.css`, `app/panel-system.css`, and
`app/public-panels.css` before the accessibility stylesheet.

The shared desktop navigation is sticky. Nested sticky directories and section
headings use `--portal-sticky-offset` so navigation does not cover them. Shared
pointer depth affects decorative artwork only; forms, item actions and player
popover ancestors retain their normal positioning. All motion respects the
viewer’s reduced-motion preference.
