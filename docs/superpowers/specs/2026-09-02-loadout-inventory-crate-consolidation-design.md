# Loadout, Inventory Locks, and Crate Consolidation Design

**Date:** 2026-09-02

## Goal

Give players a dedicated, theme-aware Loadout page for equipping owned weapon skins, protect inventory items from accidental sale with single and bulk locks, and move crate purchasing and opening into Market and Inventory respectively.

## Scope

This change covers three connected player-economy journeys:

1. Add a separate `/loadout` page and an adjacent **Loadout** tab beside **Inventory** in account navigation.
2. Add persistent sale locks for individual inventory items and inventory selections.
3. Move crate purchasing into `/market`, move owned-crate opening into `/inventory`, remove the Crates navigation tab, and preserve `/crates` as a redirect to `/inventory` for old bookmarks.

The legacy `/skins` WeaponSkins editor is not restored. The new Loadout page uses only player-owned Token Inventory instances and the existing `portal_loadout_slots` authority.

## Architecture

### Separate Loadout page

`/loadout` is a standalone authenticated page rendered through `PortalShell`. It loads the player's complete economy Inventory plus `getPlayerEconomyLoadout()` and passes both to a focused `EconomyLoadoutManager` component.

The page presents:

- weapon-category navigation for rifles, snipers, pistols, SMGs, shotguns, and LMGs;
- a weapon grid within the active category;
- the equipped T and CT skin on each weapon card;
- an expandable picker containing every owned skin whose definition index matches the selected weapon;
- T, CT, and Both equip actions;
- clear-slot actions for T, CT, or both sides.

Weapon grouping is implemented in one shared, pure module keyed by CS2 weapon definition index. Unknown definitions remain accessible in an **Other** group rather than disappearing. Loadout compatibility is always based on definition index, never display-name matching.

The page uses the existing `/api/economy/loadout/equip` and `/api/economy/loadout/clear` mutations. Server-side ownership and compatibility checks remain authoritative. Equipping a skin does not mutate or duplicate its inventory record.

### Inventory sale locks

A new migration adds `sale_locked BOOLEAN NOT NULL DEFAULT FALSE` to `portal_inventory_items`. This is deliberately separate from the lifecycle `state` column: a locked item remains available for equipping, customization, trading, and crate opening, but cannot be sold.

The repository inventory types and selects expose `saleLocked`. A new authenticated, CSRF-protected economy mutation accepts either one item ID or an array of up to 50 IDs plus a boolean lock target. The mutation:

- validates ownership;
- locks inventory rows in deterministic order;
- applies the requested state atomically and idempotently;
- records inventory audit events for changed rows;
- returns the changed item IDs and final lock state.

Both `sellEconomyItem()` and `sellEconomyItems()` reject sale-locked rows after locking them in the database. The sell API filters locked items out before external quote work where possible, but repository enforcement is the final safety boundary against stale or crafted requests.

Inventory item details expose **Lock from sale** or **Unlock for sale**. Locked cards carry a persistent accessible badge. Selection mode supports **Lock selected** and **Unlock selected** in addition to selling. Locked items can be selected for lock management, but are excluded from sell selection and page-wide sell selection. Lock-only selections are capped at 50 items, matching the existing bulk mutation limit.

### Crate consolidation

The Market remains the only catalogue-purchase surface. Crate and capsule cards use the same expandable, server-verified drop preview already provided by `/api/economy/crates/[catalogueId]/drops`. Their expanded purchase controls add:

- quantity from 1 through 50;
- per-item and total Token price;
- wallet affordability feedback;
- one purchase action using the existing quantity-aware market purchase API.

Non-container Market cards retain their existing float, StatTrak, quote, and purchase behavior.

Inventory becomes the only crate-opening surface. Owned crate and capsule cards expand in the inventory grid to show the verified possible drops and odds before opening. The existing single-opening reveal, result presentation, and idempotent open API are preserved. The integrated Inventory flow coordinates selections of up to 50 containers through bounded ten-container API requests as specified in `2026-09-03-inventory-crate-opening-integration-design.md`. General inventory filters and pagination continue to work around the expanded crate controls.

The account navbar removes **Crates**, adds **Loadout** immediately after **Inventory**, and keeps the remaining tabs in their current order. `/crates` performs a server redirect to `/inventory`; no independent Crates interface remains.

## Component boundaries

- `lib/economy/weapon-categories.ts` owns category definitions and definition-index grouping.
- A dedicated Loadout client component owns category, weapon, team, selection, and mutation state for `/loadout`.
- Shared crate drop-preview presentation and loading are extracted from the current crate opener so Market and Inventory use one implementation and one response parser.
- Market owns catalogue quantity purchase controls.
- Inventory owns opening controls, sale-lock controls, and selection-mode actions.
- Repository functions own transactional lock persistence and sale enforcement.

The current large crate component is split only where required to rehome behavior. Unrelated economy UI is not refactored.

## Data flow

### Equip an owned skin

1. `/loadout` loads complete owned inventory and current loadout slots.
2. The client groups compatible skin instances by weapon definition index.
3. The player expands a weapon, chooses an owned instance and T, CT, or Both.
4. The existing equip endpoint validates the CSRF token, ownership, item state, item type, and slot compatibility.
5. The repository updates one or two loadout slots atomically and queues the existing server refresh job.
6. The page refreshes and renders the authoritative equipped slots.

### Lock inventory items

1. The player locks one item from details or chooses up to 50 items in selection mode.
2. The lock endpoint validates and normalizes the item IDs.
3. The repository locks all owned rows in deterministic order, applies `sale_locked`, writes audit events, and commits once.
4. Inventory refreshes and updates badges and sale eligibility.
5. Any later sale request checks `sale_locked` again inside its transaction.

### Buy and open a crate

1. A Market crate card expands and fetches its verified drop pool.
2. The player chooses a quantity, reviews total cost, and purchases through the existing market purchase API.
3. Purchased instances appear in Inventory.
4. An owned Inventory crate card expands and fetches the same verified pool.
5. Single or bulk opening uses the existing crate-open API and reveal presentation.
6. Consumed crate instances disappear after the reveal lifecycle and rewards remain in Inventory.

## Error handling and concurrency

- Client-side controls provide immediate validation, but every ownership, compatibility, balance, quantity, lock, and item-state rule is repeated server-side.
- Lock/unlock mutations are idempotent: requesting an already-applied state succeeds without duplicating audit events for unchanged rows.
- Bulk lock/unlock is atomic. If an item is missing or belongs to another player, no selected item changes.
- A stale sale attempt against a locked item returns a specific conflict message and credits no Tokens.
- A stale loadout attempt reports that the chosen owned item is unavailable and leaves existing slots unchanged.
- Drop-preview failures leave purchase or opening disabled until the authoritative pool is available, matching the current crate safety behavior.
- Quantity is constrained to 1–50 in both UI and API. Server-calculated totals determine affordability and debit amounts.
- Existing idempotency keys protect market purchase, crate opening, and loadout mutations. The new lock mutation uses the same economy mutation framework.

## Theme and accessibility requirements

All new pages and panels use `PortalShell` and semantic shared UI classes. They inherit the active global theme through the existing `data-theme` surface rather than embedding fixed page colors.

New styling uses existing theme variables for backgrounds, text, borders, focus rings, accents, rarity colors, and status treatments. Expanded panels remain usable with the default, Beta Tester, and Tap God themes. Reduced-motion and forced-colors overrides remain authoritative.

Category selectors and weapon selectors expose tab or button semantics with visible focus states. Expandable panels connect triggers and content using `aria-expanded` and `aria-controls`. Lock state is conveyed by text and icon, not color alone. Loading and mutation results use existing live-region and toast patterns.

## Testing and verification

Automated tests cover:

- every known weapon definition index mapping and the Other fallback;
- matching owned skins to a weapon by definition index;
- T, CT, Both, and clear-slot request construction;
- single and bulk lock input validation;
- idempotent lock and unlock behavior;
- locked-item rejection in single and bulk repository sale paths;
- locked-item exclusion from sell-selection eligibility;
- crate quantity clamping, total-price calculation, and affordability;
- shared crate drop-response parsing and failure states;
- `/crates` redirect behavior where the test harness supports route execution.

Final verification runs the focused tests red-to-green, the complete `npm test` suite, `npm run typecheck`, and `npm run build`. Manual browser checks cover desktop and mobile layouts, keyboard navigation, expansion focus behavior, T/CT/Both actions, lock badges and selections, crate drop previews, quantity purchases, owned crate opening, all registered themes, reduced motion, and forced colors.

## Explicit non-goals

- Restoring the legacy WeaponSkins `/skins` editor.
- Equipping unowned catalogue skins.
- Changing trade eligibility for sale-locked items.
- Preventing a sale-locked crate from being opened.
- Adding keys or key purchases for crates.
- Changing loot odds, pricing sources, sellback percentage, or the server's ten-container atomic request limit. The player-facing 50-container orchestration is specified separately in `2026-09-03-inventory-crate-opening-integration-design.md`.
