# Portal panel UI review

Reviewed September 12, 2026. The implementation keeps the existing theme registry and gameplay, economy, and staff authorization boundaries.

## Shared changes

| Element | Finding | Change |
| --- | --- | --- |
| Site navigation | Small targets, quiet active state, mobile menu remained open | Consistent active tabs, 44px mobile controls, Escape and outside-click dismissal, route-change dismissal |
| Account navigation | Settings absent; a future Discord feature occupied navigation space | Direct Settings link and nine available tools; visible three-column mobile navigation |
| Page layout | Large introductions, repeated insets, uneven spacing | Shared gutters, compact headings, consistent panel padding and action heights |
| Persistent controls | Navigation disappeared during long desktop pages | Sticky desktop header/account navigation with matching staff-rail offsets |
| Restricted/error screens | Sign-in screens occupied most of the viewport | Shared compact empty-state panel, clear main heading and next action |
| Tables and forms | Hard-to-find focus and inconsistent reading rhythm | Visible keyboard focus, contained horizontal table scrolling, tabular numbers and tighter headings |
| Motion | Decorative effects could compete with controls | Pointer-driven perspective on artwork only, scroll reveals, themed glows and short transitions; reduced motion remains authoritative |
| Theme support | Several account/commerce surfaces used fixed colors | Semantic theme variables in all new shared styles; global/profile/compact/player-container ownership remains separate |

## Page coverage

Every page route was inspected, including redirects and sign-in boundaries. Detailed findings and implementation notes are in:

- [Public pages and profiles](ui-review-public.md): Home, Dashboard, Modes, Ranking, public Staff, VIP, VIP perks, player profile and profile settings.
- [Player tools](ui-review-player-tools.md): Inventory, Market, Trades, Loadout, Crates redirect, legacy Skins, Redeem, Settings redirect, Tickets and Appeals.
- [Staff workspaces](ui-review-staff.md): Staff entry and legacy assignment redirects, Bans, Appeals, Tickets, Groups, perks, listings, Items, Inventories and Redeem campaigns.

Not-found and error routes also inherit the shared panel geometry. Existing redirects continue to lead to the supported tools rather than introducing duplicate pages.

## Verification

- `npm run build`, `npm run typecheck`, and `git diff --check` passed after removing the temporary fixture route. The production route list contains no UI review endpoint.
- Full `npm test`: 370 passed, zero failures, two database integration tests skipped because their separate test configuration was unavailable.
- Browser route sweep: public pages, player/staff sign-in boundaries and both not-found cases fit 320, 768 and 1440 pixels, with one main heading. Legacy Admins and VIPs return their existing 307 redirects to the correct Groups assignment views.
- Profile and Settings fixtures: all 12 registered themes at 320, 768 and 1440 pixels, with no document overflow or browser runtime errors.
- Player tools: 96 theme/viewport combinations plus search, selection, keyboard disclosure, error-feedback and reduced-motion interactions passed; see the player-tools audit for the fixture limits.
- Staff: 48 theme/viewport combinations across moderation, groups, catalogue editing and campaigns, including expanded controls; see the staff audit.
- Shared interactions: mobile menu Escape/focus return, outside click and link navigation; decorative pointer perspective and live reduced-motion changes passed.
- Settings privacy and theme changes expose the dirty state; Discard restores saved choices and disables Save again. No settings writes were submitted.
- Axe WCAG 2 A/AA checks found no violations in the scoped Home, sign-in, default profile and Owner settings checks. This is a representative automated check, not a claim of full accessibility conformance.
- Independent final code review found no material regressions in form actions, authorization fields, theme ownership, or the new disclosures. The earlier mobile focus-ring specificity finding was corrected.

## Maintenance

`app/panel-system.css` owns shared shell geometry, navigation and motion. `app/public-panels.css` owns public-route and profile density. Player tools use `components/economy/player-workspace.module.css`; support uses `app/tickets/support-workspace.module.css`. `app/staff-workspace.css` remains the authority for staff layout. All global finishing styles load before `app/themes/accessibility.css`.

`PanelEffects` adds no dependency and runs only in response to pointer movement. It transforms decorative artwork rather than table rows, form controls, item-action panels, or ancestors of player popovers. It cancels pending frames and resets styles when routes or motion preferences change.

Browser fixtures and screenshots are kept under the ignored `.superpowers/ui-review/` directory. Fixtures use local representative data and block mutations; they are not production routes. Live authenticated staff/economy transactions were not performed.
