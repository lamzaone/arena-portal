# Public and player page UI review

Reviewed every route in this scope against a compact, readable panel layout. The shared shell, navigation, semantic tokens, and motion runtime are maintained separately in the main UI review.

| Route | Elements reviewed | Changes |
| --- | --- | --- |
| `/` | Header connection flow, live terminal, shortcuts, feature cards, account callout, footer | Shorter introduction, immediate ranking/inventory/membership shortcuts, responsive feature grid, smaller card artwork and spacing, content-sized live terminal, compact account/footer areas. |
| `/dashboard` | Signed-out state and signed-in redirect | Retained redirect to the canonical player profile and settings query; shared sign-in panel supplies the consistent signed-out view. |
| `/ranking` | Page heading, total, search, search results, table columns, medals, identities, pagination, empty state | Clear page title, compact total, visible query and clear action, distinct no-match message, explicit top-three positions, player and points prioritized before secondary stats, constrained mobile columns and scroll hint. |
| `/players/[steamId]` | Missing-profile state, identity/avatar/groups, presence, rank, inventory/settings tabs, statistics, membership details, combat, hit map, notices, moderation history | Smaller identity/rank header, correctly labeled numeric points and placement, formatted counts, accessible progress bar, compact hit map, full-width membership row followed by combat/hit panels, two meaningful history panels, player-facing service messages. Existing profile and player-card theme ownership remains intact. |
| `/settings` and profile `?settings=1` | Privacy radios, theme choices/previews, theme scope, empty collection, save and pending states | Compact options, themed focus/selection surfaces, correct Settings navigation highlight, sticky save bar with discard action, Market link, clearer theme scope. Removed three disabled coming-soon showcase cards from the actionable settings form. |
| `/modes` | Summary, arena cards, team/default status, loadout/armor, custom types, lengths, flow, connection controls | Direct page/section titles, section jump links and connect shortcut, compact arena grid including two mobile columns, reduced default badge, consistent duel panels. |
| `/staff` | Team introduction, counters, filters/search, role headings, portraits/presence, profile/Discord links, motion control, footer | Large portraits replace the compact avatar rows: 184px on phones, 152–188px for regular desktop/tablet cards, and 224px for a single-member desktop role. Full-width role headings give the members more space. Each card owns its player's theme and exposes separate profile/contact links. Portrait-only tilt, scroll reveal, pause control, and reduced-motion support remain. |
| `/vip` | Current status, membership navigation, tier art/badges, active status, benefits, duration options, conversion estimates, prices/actions, notices, roster | Consistent compact heading, three readable columns, smaller artwork, non-truncated membership status, expandable conversion detail with outcome always visible and blocked reasons initially open, concise player-facing copy and notices. Donation requests, rates, eligibility and activation logic unchanged. |
| `/vip/perks` | Wallet, perk cards/active state, duration/prices/purchase buttons, unavailable/empty states, source/expiry roster | Shared heading rhythm, compact theme-aware cards, valid semantic surface variables replacing undefined dark-fallback tokens, consistent radius, restrained hover glow, clearer purchase and empty-state copy. Purchase/idempotency logic unchanged. |

## Theme and accessibility checks

- Page styling lives in `app/public-panels.css`, loaded after the shared theme layers. No profile theme registration, ownership, privilege, or entitlement rules changed.
- New colors derive from `--theme-*` semantic values. Fixed perk backgrounds previously referenced undefined `--theme-panel` and `--theme-panel-subtle` variables.
- Native table, disclosure, radio and form semantics preserved. Added a labeled progress bar, labeled section links, visible ranking positions, search reset, and reversible settings discard.
- New hover transitions honor reduced motion; staff retains its existing explicit pause toggle and reduced-motion handling. Shared decorative depth/reveals are handled by the root motion runtime.

## Verification

- `npm run typecheck`: passed after all production edits.
- `npm run test:themes`: 22 tests passed.
- `npm run test:staff`: 9 tests passed.
- `npm run test:seo`: 6 tests passed.
- Scoped `git diff --check`: clean (only repository line-ending notices).
- Playwright captured real `/`, `/ranking`, `/modes`, `/staff`, `/vip`, and `/vip/perks` routes at 1440 and 375 pixels, with no document overflow at 375 pixels and one main heading per page. Screenshots are local review artifacts under `.superpowers/ui-review/public-*`.
- Follow-up Playwright confirmed the reordered ranking columns, two 170.5-pixel mode columns at 375 pixels, and VIP conversion disclosures that start closed, open by click, and close with Enter. Updated viewport captures are `public-ranking-final-375.png`, `public-modes-final-375.png`, and `public-vip-final-1440.png`.
- A legacy mobile rule hid the three combat columns; the new scoped rule restores them for horizontal scrolling. Final browser geometry confirms position/player/points widths of 52/180/88 pixels and all seven columns displayed.
- Final settings refinement uses an 85–92px identity strip, hides the unrelated placement card only while settings are open, and adds a 16px inset to bordered profile heroes. Owner/default screenshots at 375/1440px confirm no horizontal overflow, with privacy controls beginning around 509–546px. Captures: `public-settings-compact-{owner,default}-{375,1440}.png`. Typecheck passed.
- Full route/theme/settings matrix and broader integration checks are recorded by the main UI review. Public browsing and disclosure checks do not submit purchases, memberships, or moderation actions.

## Staff presentation follow-up

The staff page pairs a prominent introduction with the original TAPPED emblem, floating 3D crest, orbital rings, layered badges, and theme-colored glow. The logo remains visible on phones. Counters sit beneath the desktop introduction and below the artwork on mobile; a direct jump link reaches the directory. The pause control and reduced-motion preference cover the crest, badges, decorative pseudo-elements, entrances, and portrait tilt.

The larger framed portraits, readable member names, role introductions, and clear actions are retained. Member cards are semantic articles, so profile and Discord links work independently without nested anchors. Long names wrap and unavailable photos retain a large initials fallback. Full-width role headings and the shared theme-aware search keep the directory easy to browse.

The public directory reads completed `portal_discord_links` entries for visible staff in one batch. Cards show a Discord profile link only when a canonical linked-user URL is available. The directory remains usable before Discord storage is configured or migrated; no bot or schema changes were needed for this presentation feature.

`npm run build`, `npm run typecheck`, and all 13 staff tests passed. A standalone fixture using the actual components and styles passed 48 combinations of eight global themes and widths of 320, 390, 768, 1024, 1440, and 1920px. It checked overflow, player theme ownership, photo fallbacks, search, role filters, empty/unavailable states, independent contact links, reduced motion, and keyboard focus. Screenshots and results are in `.superpowers/ui-review/staff-presentation-*`.

The restored hero passed 48 theme/width layout cases and 32 active-motion cases. Checks confirmed that the SVG loads on every viewport, the crest changes its 3D transform, and all floating/glow/ring effects stop under manual pause and reduced motion. Eleven interaction checks covered search, role filters, separate profile/Discord navigation, portrait tilt, and the directory jump. The jump uses the shell's existing scroll padding without adding the same offset a second time. Production captures at 390px and 1440px confirmed eight staff cards, unchanged large portraits, a loaded hero logo, active 3D animations, and no horizontal overflow. Build and typecheck passed.

## Theme padding scan

Scanned 28 public and signed-out routes at mobile and desktop widths under four global themes for painted surfaces whose text touches their edges. The catalogue hero was the concrete page-layout regression: `/modes`, `/vip`, and `/vip/perks` used zero horizontal padding while TAP GOD painted a full background and inset glow. Catalogue heroes now retain the shared 16–24px panel inset in every theme. A focused browser check using current source CSS passed 96 combinations of those three routes, all eight global theme variants, and widths of 320, 390, 768, and 1440px, with no document overflow. Results and screenshots are under `.superpowers/ui-review/catalog-padding-*`.

The remaining scan flags were scrollable table boundaries and visually hidden table captions, which retain their intentional structure. Staff and player workspace CSS was also inspected: controls and record cards already retain their own insets; zero-padding grid/list wrappers and edge-to-edge artwork are intentional. Authenticated routes were available only in their signed-out state. A minimal conversation fixture additionally confirmed that TAP GOD should leave the conversation layout wrapper transparent while the individual message cards own the themed surface and padding.

## Search controls and theme spacing

Generic theme input rules were painting a second background, focus outline, and TAP GOD inset shadow inside composite search controls. Shared searches now mark their inner inputs and exclude them from those rules; the outer control owns the surface, border, and focus treatment. Shared geometry also prevents staff form minimum heights from clipping the inner input. Labels and submit buttons share a 24px offset, icon spacing stays consistent, empty player-search trailing slots remain transparent, and disabled searches retain subdued text without an active clear button. Mobile text uses 16px. High contrast mode retains a system-color outline on the focused outer control.

The public staff directory now uses `SearchField` with a visually hidden accessible label, preserving local filtering and clear/focus behavior. TAP GOD no longer paints the zero-inset conversation layout wrapper; padded message cards keep their themes.

Verification included 64 checks against rebuilt Ranking and Staff pages; 144 staff-directory theme/width/state checks plus 48 filtering/clear checks; and shared search fixtures spanning eight global themes, owner containers, mobile/desktop widths, idle/focused/loading/selected/disabled states, and actual assignment, ban, redeem, and ranking form styles. The full fixture passed 352 checks with no presentation issues or browser errors; follow-up checks confirmed disabled colors and the real responsive staff container. The production build, typecheck, 5 player-identity/search tests, and 22 theme tests passed. Browser artifacts are in `.superpowers/ui-review/search-*` and `custom-search-*`.
