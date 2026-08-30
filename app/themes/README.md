# Portal theme authoring

Every trusted theme has two source-controlled files:

- `lib/themes/<theme>.ts` declares its independently toggleable `global`, `profile`, and `smallProfile` surfaces.
- `app/themes/<theme>.css` supplies the visual tokens and optional theme-specific effects.

To add a theme, copy the token block from `default.css`, choose a stable theme key, add its manifest to `lib/themes/registry.ts`, and import its stylesheet in `app/layout.tsx`. A database entitlement may select that key, but it must never provide CSS, class names, or markup.

`shared.css` is the component contract. Reusable UI exposes `data-ui` and `data-part` hooks for panels, headings, item cards and artwork, tables, searches, section navigation, pagination, notices, loading states, player objects, hover cards, and item modals. New themes should normally customize tokens rather than repeat route selectors.

Keep page canvases transparent. Full-page backgrounds belong in a manifest-backed runtime background slot so a viewed player's profile theme can replace the signed-in viewer's global theme without an opaque layer hiding animations.

Before shipping a theme, verify:

- all three surfaces can be independently disabled in the manifest;
- global routes and the large header use the same theme;
- a viewed profile owns its header, page, background, and controls;
- compact player objects and table rows inherit that player's theme;
- focus, reduced-motion, forced-colors, loading, empty, error, and modal states remain readable.
