# Staff workspace UI review

Reviewed the staff routes, their page sections, shared navigation, and management controls. The design uses the existing semantic theme variables and preserves server authorization, mutation endpoints, CSRF fields, action names, and destructive-action confirmations.

| Page or view | Review and changes |
| --- | --- |
| `/admin` | Verified the canonical moderation redirect and the legacy Admin/VIP assignment redirects, including notice/error propagation. These routes have no separate interface. |
| `/admin/admins`, `/admin/vips` | Verified the redirects into group assignments. The destination now uses more compact summary cards and a two-column mobile filter selector, keeping records nearer the top. |
| `/admin/bans` | Reviewed search, write availability, ban fields, player/issuer identities, reason/date columns, status, unban confirmations, communication history, and pagination. The ban composer now expands from a compact, labeled action; record headings and rows use consistent spacing. Search retains space beside its submit button at narrow widths. |
| `/admin/appeals` | Original appeal, player identity, status, case number, and dates remain visible. Conversation, screenshot upload, reply, and decision controls expand together. Decision confirmations remain in place; denial inside the page now uses an h2 under its existing h1. |
| `/admin/tickets` | Subject, player, status, case number, category, original report, and dates form the summary. Conversation and response actions use the same disclosure as appeals, with responsive action wrapping. |
| `/admin/items?tab=marketplace` | Reviewed product lookup, rarity/type/status, artwork, price provenance, discounts, market name, artwork upload, price refresh, manual prices, central membership listings, and availability. Product cards are smaller and show their useful facts first; the editing forms expand under a clear action. Badge placement no longer competes in an undersized grid cell. |
| `/admin/items?tab=crates` | Reviewed creation, crate library, selected crate details, release controls, search/filter, reward candidates, weights, odds, and remove/restore operations. Shared staff typography and section density now match the other management views; lookup spacing is consistent. |
| `/admin/items?tab=discount` | Reviewed existing rule creation/editing, catalogue targeting, matching products, and read-only access. The shared staff header, form labels, controls, panel insets, section headings, and navigation now use the same compact system. |
| `/admin/inventories` | Reviewed directory search, selected-player state, wallet/trade summaries, item filters, inventory cards/editors, granting, wallet changes, loadout slots, stickers, and empty states. Directory and content layouts now respond to available workspace width. A direct Staff tools link reaches wallet/loadout operations; compact summaries, bounded directory results, and reduced empty states avoid oversized introductory areas. |
| `/admin/redeem` | Reviewed code/label/Token fields, claim limits, item selection and quantities, code reveal/copy, saved rewards, and live/pause operations. Added local search and live/paused filtering to saved campaigns. Builder, catalogue, labels, quantity controls, and empty results follow the staff layout; help copy works when the catalogue moves below the form. |
| `/admin/groups?tab=connected` | Reviewed sync status, source counts, group navigation, selected identity, external definition, runtime source editor, badge/presentation editor, tags, privileges, rewards, and members. Runtime settings, identity/badge settings, and relationships now have distinct expandable sections. The group navigator remains beside the editor at useful desktop widths and respects the shared sticky-header offset. |
| `/admin/groups?tab=create` | Reviewed custom, Admins.Core, and VIPCore definitions, identity/badge inputs, priority, permissions, server scope, and configuration. Shared staff form labels, sizing, section spacing, and navigation keep creation consistent with editing. |
| `/admin/groups?tab=membership` | Reviewed assignment views, totals, filters, player headers, inventory context, scope/status badges, duration, exact-record editing, conflict indicators, and revoke/extend operations. Mobile summary and type controls retain two columns; smaller cards and clearer introductory copy bring assignment records forward. |
| `/admin/groups?tab=tags` | Reviewed reusable tag creation/editing, in-game color previews, palette disclosure, status, and save controls. Existing game-color preview semantics remain; the common staff layout and navigation apply consistently. |
| `/admin/groups?tab=permissions` | Reviewed creation, searchable catalogue, provenance, sensitivity, status, editable descriptions, and save controls. Shared labels, panel density, and responsive section navigation apply consistently. |
| `/admin/groups?tab=awards` | Reviewed player targeting, tag/permission selection, optional expiry/reason, grant/revoke actions, and active awards. Shared form and section density matches the rest of group administration. |
| `/admin/groups/perks` | Reviewed definitions, player/group grants, configuration, active ledger, protected purchases, revoke confirmations, and paging. Definition creation expands by default only for an empty catalogue. Existing definition disclosures have visible toggles; form and ledger columns now respond to the available workspace width. |
| `/admin/groups/listings` | Reviewed membership creation, group/server selection, pricing/duration, storefront visibility, staff confirmations, existing listing editors, individual offers, runtime verification, and disable operations. Membership creation expands by default only for an empty catalogue. Listing toggles are visible and narrow-workspace grids wrap correctly. |

## Shared behavior

- Staff navigation retains permission-based visibility and the current-page indicator. Mobile links share a compact wrapping rail; accessible group names remain available after visual group headings are removed.
- Native disclosures support keyboard interaction without extra client state. Focus rings use the active theme, and transitions honor reduced motion. Shared portal effects supply the broader page motion and lighting.
- Viewer-theme and player-theme ownership remain intact; no fixed accent palette was introduced in production styles.
- All work is local. No staff action, database mutation, publication, or commit was performed.

## Verification

- `npm run typecheck` passed after temporary fixture type corrections made by the collaborating agents.
- `npm run test:staff`: 9 passed.
- `npm run test:navigation`: 2 passed.
- `npm run test:themes`: 22 passed across registry and entitlement suites.
- `git diff --check` passed for the staff changes.
- Visual review uses local component fixtures because this session has no authenticated staff browser session. These fixtures use representative data and do not exercise authorized production mutations.
- Playwright checked 48 combinations: bans/cases, connected-group editing, catalogue-product editing, and campaign management at 390, 800, and 1440 pixels under `default`, `beta_tester`, `tap_god`, and `owner`. All rendered without document overflow or browser runtime errors. Expanded forms were included.
- Campaign label search and the intersection with live/paused status filtering were exercised in each campaign view and passed.
- Screenshot review led to a further group-workspace breakpoint correction and flexible campaign columns, so desktop space is used by the records instead of empty grid tracks.
- The affected group/campaign layouts were rechecked in 24 theme-and-width combinations; all passed without document overflow or runtime errors.
- After restarting the local preview server, the final desktop group check passed: the directory/editor columns measured 400/746 pixels, disclosure toggles retained 40 pixels of trailing space, and the page had no horizontal overflow. Screenshot: `.superpowers/ui-review/staff-groups-final-1440.png`. A final typecheck also passed. Live authenticated staff screens and mutations were not available in this session.

The temporary fixture screenshots and matrix records live in `.superpowers/ui-review/`. The root agent removes the temporary route before completion; these fixtures are not production routes.

## Staff padding correction

The compact workspace rules had overridden the shared horizontal insets with zero on headers, search tools, record sections, and inventory collections, including a second header override on mobile. Restored the shared shell gutter and 16–24px panel insets, applied that inset to inventory operations, and retained 12px around the staff navigation at smaller widths. Record sections also keep bottom padding for themes that draw a panel surface. Responsive header refinements now use `padding-block` so they preserve the horizontal inset.

The production build and `git diff --check` passed. A browser fixture using the rebuilt production CSS checked the seven affected containers in 32 combinations: all eight global theme variants at 320, 390, 800, and 1440 pixels. Every container retained its horizontal inset, with no document overflow. These checks use representative staff markup because an authenticated staff session is unavailable. Results: `.superpowers/ui-review/staff-padding-after.json`.
