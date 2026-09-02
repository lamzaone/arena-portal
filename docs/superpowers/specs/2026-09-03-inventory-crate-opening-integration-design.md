# Inventory Crate Opening Integration Design

**Date:** 2026-09-03

## Goal

Make Inventory the single place where players manage owned crates and capsules: inspect possible drops, open one container, open a crate-only selection of up to 50 containers in one player action, lock items from sale, or sell them.

## Scope

This change completes the previously planned crate consolidation. It removes the duplicate owned-crate section from Inventory and integrates the existing opening experience into the normal Inventory card, detail, and selection workflows.

The work does not change loot odds, reward generation, item pricing, sellback policy, sale-lock persistence, or the Market purchase experience.

## Chosen architecture

`InventoryManager` becomes the sole owner of Inventory pagination, filters, selected item state, bulk selection, and conflicting mutation controls. The owned-opening state and presentation are extracted from the market-oriented `CrateOpener` into a focused Inventory crate-opening component rather than synchronizing two selection systems or copying the opening implementation.

The existing authenticated `POST /api/economy/crates/open` endpoint remains limited to ten containers per atomic database transaction. A player may select up to the Inventory limit of 50 crates or capsules. The client partitions that ordered selection into groups of ten and processes the groups sequentially under distinct stable idempotency keys. To the player, this is one confirmed bulk-opening session with aggregate progress and results.

This preserves bounded row locking and response sizes while meeting the requirement to open more than ten containers at once. Completed groups never repeat after a retry, and an interrupted or failed session clearly distinguishes completed results from unopened remaining crates.

## Inventory behavior

### Normal item management

Clicking a normal Inventory item keeps the existing inline detail experience. Lock/unlock and sale controls behave as they do today.

Clicking an available crate or capsule opens the same detail surface with an **Opening station** section in the primary column. It contains:

- the existing crate preview and metadata;
- a compact **Open crate** action;
- possible drops below the action, collapsed by default and independently expandable;
- the existing server-verified reel, reveal animation, sound cues, reward details, and global-announcement note;
- retryable loading and error states for the drop pool and opening request.

Players do not need to expand possible drops before opening. Sale protection and **Sell to market** remain visible in the existing secondary column, so opening does not replace selling.

Opening a sale-locked crate is allowed because the lock protects only against sale. Opening eligibility continues to require an owned, available item whose type is `crate` or `capsule` and whose catalogue/drop-pool data is valid.

### Selection mode

Inventory keeps one selected-ID set for locking, unlocking, selling, and opening. Derived selection policy determines which actions are offered:

- A mixed selection offers the existing lock, unlock, and eligible sell actions, but no opening action.
- A crate-only selection of one through 50 available crates/capsules offers **Open selected** as well as the existing lock/unlock and sell actions.
- Locked crates remain part of an openable crate-only selection but are excluded from selling until unlocked.
- Non-openable or stale items prevent the opening action rather than being silently skipped.

The action bar keeps primary actions concise and responsive. Confirmation text states the exact number of containers that will be consumed. Starting a sell, lock, unlock, single-open, or bulk-open mutation disables conflicting mutations until the active operation reaches a stable state.

## Bulk-opening session

The bulk session uses the selected crate order visible to the player and creates groups of at most ten IDs. Each group receives its own idempotency key, retained for retries of that exact group.

The session lifecycle is:

1. The player confirms **Open N crates** once.
2. All selected rows enter a queued state and the selection is frozen.
3. The first group posts to the existing bulk endpoint.
4. Successful authoritative rewards populate the corresponding rows and the next group begins.
5. Progress reports completed containers and groups, for example **20 of 37 opened**.
6. When all groups complete, the Inventory refreshes once and the result view remains mounted until dismissed.
7. Dismissal returns the player to normal Inventory with newly awarded items available.

Groups are processed sequentially, not concurrently, to keep database pressure predictable and preserve an understandable progress order. Within each successful group, the existing per-crate verified reels and reveal rows are retained.

If a group fails or its response is incomplete, processing stops. Results from earlier committed groups remain visible and are never represented as rolled back. The failed group and every later group remain unopened. The UI offers **Retry remaining** using the same idempotency key for the failed group and the already-created keys for later groups. A refresh remains an authoritative recovery path if the network response was lost after a commit.

## Component boundaries

- `components/economy/inventory-manager.tsx` owns Inventory filters, pagination, selected IDs, confirmations, and action placement.
- A focused owned-opening component owns single and multi-group opening session state, API calls, progress, retained consumed items, and callbacks into Inventory.
- Reusable reel/reveal presentation is moved out of the market/legacy `CrateOpener` module so both single and bulk Inventory paths use the same visuals without importing an unused owned-crate grid.
- `components/economy/crate-drop-preview.tsx` remains the shared collapsed possible-drops surface.
- `lib/economy/inventory-selection.ts` owns pure openability, crate-only selection, ordered partitioning, progress, and retained-item helpers that can be tested without React.
- `components/economy/inventory-workspace.tsx` renders only `InventoryManager`; the duplicate `CrateOpener mode="owned"` and dual selection-owner coordination are removed.
- `app/api/economy/crates/open/route.ts` and `openEconomyCrates()` keep their one-to-ten request contract and all-or-nothing transaction semantics.

The standalone `CrateOpener` remains only if another market-facing use needs it after extraction. If it has no callers, it is removed after its shared presentation pieces move to their focused module.

## State and data integrity

The browser never chooses rewards or trusts cosmetic reward metadata supplied by the player. Every result displayed comes from the existing authoritative opening response.

Consumed crate IDs are hidden locally as groups commit so cards cannot be reopened or sold while the server-rendered Inventory catches up. Result rows retain the consumed crate snapshot needed for reveal presentation. Inventory is refreshed after completion, after a terminal failure, and after an ambiguous lost response.

Stable group signatures map to stable idempotency keys for the life of the opening session. Retrying a committed group replays its stored receipt; retrying an uncommitted group performs it once. A new player selection creates a new session and new keys.

## Theme, responsiveness, and accessibility

All opening UI uses the existing semantic theme variables, rarity treatments, focus styles, and status components. No fixed light- or dark-theme colors are introduced. Default, Beta Tester, and Tap God themes remain supported.

Single opening remains readable in the existing two-column Inventory detail layout and collapses to one column on narrow screens. Bulk result rows use a compact responsive grid rather than a single very long vertical control surface. Large sessions show aggregate progress first and reveal rows in manageable groups.

Expandable drops use a button with `aria-expanded` and `aria-controls`. Progress and terminal messages use existing live-region behavior. Every action has a text label, keyboard focus remains visible, and lock/open/sale states are never conveyed by color alone. Existing reduced-motion and forced-colors rules apply to the extracted animation components.

## Testing and verification

Pure tests cover:

- recognizing only available `crate` and `capsule` items as openable;
- allowing sale-locked crates to open while preserving their sale restriction;
- offering bulk opening only for non-empty crate-only selections;
- respecting the 50-item Inventory selection cap;
- partitioning 1, 10, 11, and 50 selected IDs into stable groups of at most ten;
- accumulating progress across successful groups;
- stopping on failure and retaining the correct unopened remainder;
- keeping idempotency keys stable when retrying a group;
- hiding committed consumed IDs while retaining result snapshots.

Component and source-contract tests cover removal of the duplicate owned-crate surface, placement of collapsed drops below the single open action, coexistence of sale and opening controls, and theme/accessibility hooks.

Final verification runs the focused tests red-to-green, the complete `npm test` suite, `npm run typecheck`, and `npm run build`. UI/UX review covers desktop and mobile layouts, keyboard-only use, 1-, 11-, and 50-crate sessions, mixed selections, locked crates, partial failures, all registered themes, reduced motion, and forced colors.

## Explicit non-goals

- Raising the server transaction size above ten crates.
- Making a 50-crate player action one database transaction.
- Adding keys or key purchases.
- Changing drop rates, reward rarity, announcement thresholds, or reward persistence.
- Preventing sale-locked crates from being opened.
- Removing selling, locking, filters, pagination, or other Inventory management behavior.
