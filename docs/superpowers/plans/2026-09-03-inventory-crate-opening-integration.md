# Inventory Crate Opening Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate single and up-to-50-container opening into the normal Inventory detail and selection workflows while retaining locking and selling.

**Architecture:** `InventoryManager` becomes the only owned-item selection surface. Pure selection/session helpers plan ordered groups of at most ten, while a focused client module owns authoritative opening requests and the extracted reel/reveal UI; one player action may coordinate up to five sequential idempotent server transactions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, MySQL-backed economy mutations, Node test runner, existing CSS theme tokens.

**Spec:** `docs/superpowers/specs/2026-09-03-inventory-crate-opening-integration-design.md`

## Global Constraints

- Inventory is the single owned-crate surface; do not render a second crate grid or selection owner.
- A player may open one through 50 selected crates/capsules in one confirmed UI session.
- Each `/api/economy/crates/open` request remains limited to ten IDs and atomic; larger sessions run sequential groups with stable per-group idempotency keys.
- Only owned, available `crate` and `capsule` items with a catalogue ID are openable.
- Sale-locked crates remain openable but cannot be sold until unlocked.
- Possible drops sit below the single-open action, start collapsed, and are optional to inspect before opening.
- Single and bulk opening retain the existing verified reel, reveal, sound, reward, and global-announcement presentation.
- Lock, unlock, and eligible sell actions remain available alongside opening.
- Use existing semantic theme tokens and preserve default, Beta Tester, Tap God, reduced-motion, and forced-colors behavior.
- Do not change loot odds, rewards, the one-to-ten server request contract, pricing, or sellback policy.

---

## File structure

- `lib/economy/inventory-selection.ts`: pure openability, crate-only selection, batching, and retry/progress helpers alongside retained-item helpers.
- `lib/economy/inventory-selection.test.ts`: selection and 1/10/11/50-item batching tests.
- `components/economy/inventory-crate-opening.tsx`: client opening controller plus reusable single/bulk reel and reward presentation extracted from the legacy opener.
- `components/economy/inventory-manager.tsx`: sole Inventory card/detail/selection owner and placement of open/sell/lock actions.
- `components/economy/inventory-workspace.tsx`: thin wrapper that renders only `InventoryManager`.
- `components/economy/crate-opener.tsx`: delete after all still-used owned-opening presentation has moved; it has no caller outside `InventoryWorkspace`.
- `app/globals.css`: responsive Inventory opening, progress, result-grid, theme, reduced-motion, and forced-colors styling.

### Task 1: Pure crate-selection and multi-request planning policy

**Files:**
- Modify: `lib/economy/inventory-selection.ts`
- Modify: `lib/economy/inventory-selection.test.ts`

**Interfaces:**
- Consumes: item snapshots with `id`, `itemType`, `state`, and `catalogueId`.
- Produces: `MAX_INVENTORY_CRATE_OPEN_SELECTION`, `MAX_CRATES_PER_OPEN_REQUEST`, `isOpenableInventoryCrate(item)`, `crateOnlySelection(items, selectedIds)`, `partitionCrateOpeningIds(itemIds)`, and `remainingCrateOpeningIds(groups, completedGroupCount)`.

- [ ] **Step 1: Replace dual-surface tests with failing integrated-selection tests**

```ts
const crate = (id: string, itemType = "crate", saleLocked = false) => ({
  id,
  itemType,
  state: "available",
  catalogueId: 12,
  saleLocked,
});

test("only a non-empty crate/capsule selection can open", () => {
  assert.equal(crateOnlySelection([crate("a")], new Set()).status, "empty");
  assert.equal(
    crateOnlySelection([crate("a"), crate("b", "capsule", true)], new Set(["a", "b"])).status,
    "ready",
  );
  assert.equal(
    crateOnlySelection([crate("a"), crate("skin", "skin")], new Set(["a", "skin"])).status,
    "mixed",
  );
});

test("partitions more than ten crates without reordering them", () => {
  const ids = Array.from({ length: 50 }, (_, index) => `crate-${index + 1}`);
  assert.deepEqual(partitionCrateOpeningIds(ids.slice(0, 1)).map((group) => group.length), [1]);
  assert.deepEqual(partitionCrateOpeningIds(ids.slice(0, 10)).map((group) => group.length), [10]);
  assert.deepEqual(partitionCrateOpeningIds(ids.slice(0, 11)).map((group) => group.length), [10, 1]);
  assert.deepEqual(partitionCrateOpeningIds(ids).map((group) => group.length), [10, 10, 10, 10, 10]);
  assert.deepEqual(partitionCrateOpeningIds(ids.slice(0, 11)).flat(), ids.slice(0, 11));
});
```

- [ ] **Step 2: Run the focused suite and verify RED**

Run: `npm run test:inventory-selection`

Expected: FAIL because `crateOnlySelection` and `partitionCrateOpeningIds` are not exported.

- [ ] **Step 3: Implement the minimal pure policy**

```ts
export const MAX_INVENTORY_CRATE_OPEN_SELECTION = 50;
export const MAX_CRATES_PER_OPEN_REQUEST = 10;

type OpenableInventoryItem = {
  id: string;
  itemType: string;
  state: string;
  catalogueId: number | null;
};

export function isOpenableInventoryCrate(item: OpenableInventoryItem) {
  return (
    (item.itemType === "crate" || item.itemType === "capsule") &&
    item.state === "available" &&
    item.catalogueId !== null
  );
}

export function partitionCrateOpeningIds(itemIds: readonly string[]) {
  if (itemIds.length > MAX_INVENTORY_CRATE_OPEN_SELECTION)
    throw new RangeError("Choose up to 50 crates to open.");
  const groups: string[][] = [];
  for (let index = 0; index < itemIds.length; index += MAX_CRATES_PER_OPEN_REQUEST)
    groups.push(itemIds.slice(index, index + MAX_CRATES_PER_OPEN_REQUEST));
  return groups;
}
```

Implement `crateOnlySelection` by iterating selected IDs in `Set` insertion order, resolving each ID from the current item map, and returning `{ status: "empty" | "mixed" | "ready", crates }`. Treat a missing/stale selected ID as mixed. Implement `remainingCrateOpeningIds` by flattening groups starting at `completedGroupCount`.

Preserve the existing dual-surface exports temporarily so the current `InventoryWorkspace` still compiles. Task 3 removes `InventorySelectionOwner`, `nextInventorySelectionOwner`, and `inventoryWorkflowAccess` after the duplicate surface is disconnected. Preserve `withRetainedOpenedItem` and `activeConsumedItemIds` for the integrated opening lifecycle.

- [ ] **Step 4: Add edge-case assertions and verify GREEN**

Cover unavailable containers, missing catalogue IDs, locked-but-openable crates, duplicate IDs, 51-item rejection, and remaining IDs after two completed groups.

Run: `npm run test:inventory-selection`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/economy/inventory-selection.ts lib/economy/inventory-selection.test.ts
git commit -m "test: define integrated crate opening policy"
```

### Task 2: Extract the Inventory opening controller and presentation

**Files:**
- Create: `components/economy/inventory-crate-opening.tsx`
- Modify: `components/economy/crate-opener.tsx`

**Interfaces:**
- Consumes: `EconomyItemView`, `CrateDropPreview`, `postEconomyAction`, `createEconomyIdempotencyKey`, and Task 1 grouping helpers.
- Produces: `useInventoryCrateOpening(options): InventoryCrateOpeningController`, `InventorySingleCrateOpening`, and `InventoryBulkCrateOpeningResults`.

Define the public controller contract exactly as:

```ts
export type SingleCrateOpeningState = {
  crate: EconomyItemView | null;
  dropState: CrateDropState;
  opening: OpeningState | null;
  reward: EconomyItemView | null;
  rewardMessage: string | null;
  error: string | null;
};

export type CrateOpeningRequestGroup = {
  crateItemIds: string[];
  signature: string;
  idempotencyKey: string;
};

export type BulkCrateOpeningSession = {
  crates: EconomyItemView[];
  groups: CrateOpeningRequestGroup[];
  currentGroupIndex: number;
  completedCount: number;
  rows: BulkOpeningRow[];
  status: "running" | "failed" | "complete";
  error: string | null;
};

export type InventoryCrateOpeningController = {
  busy: boolean;
  consumedItemIds: ReadonlySet<string>;
  retainedSingleCrate: EconomyItemView | null;
  single: SingleCrateOpeningState;
  bulk: BulkCrateOpeningSession | null;
  prepareSingle(crate: EconomyItemView | null): void;
  openSingle(crate: EconomyItemView): Promise<void>;
  completeSingleReveal(): void;
  dismissSingle(): void;
  openBulk(crates: readonly EconomyItemView[]): Promise<void>;
  retryRemaining(): Promise<void>;
  completeBulkReveal(crateId: string): void;
  dismissBulk(): void;
};
```

`BulkCrateOpeningSession` stores the frozen crate snapshots, ordered groups, one stable idempotency key per group, current group index, completed crate count, rows, terminal error, and status (`running`, `failed`, or `complete`).

- [ ] **Step 1: Move visual primitives without changing their markup contracts**

Move `OpeningState`, `BulkOpeningRow`, `CrateOpeningAnimation`, `OwnedCrateInlineOpener`, reel constants/helpers, reward artwork matching, tick audio, and the bulk result rows into the new module. Rename the public views to `InventorySingleCrateOpening` and `InventoryBulkCrateOpeningResults`.

Keep the single action order:

```tsx
<button className="button button-primary" onClick={onOpen}>Open crate</button>
<button
  className="button button-secondary crate-inline-drops-toggle"
  aria-expanded={showDrops}
  aria-controls={dropsId}
  onClick={() => setShowDrops((visible) => !visible)}
>
  {showDrops ? "Hide possible drops" : "Show possible drops"}
</button>
{showDrops ? <CrateDropPreview state={dropState} /> : null}
```

The drop toggle starts with `useState(false)` and never gates `onOpen` when a verified pool has loaded.

- [ ] **Step 2: Implement single-opening state in the hook**

When `prepareSingle(crate)` receives an openable container, fetch `/api/economy/crates/${crate.catalogueId}/drops` and cache the normalized state by catalogue ID. `openSingle` must require a ready drop pool, freeze it into the verifying state, post one `crateItemId`, parse the authoritative reward with `toEconomyItem`, move to revealing, and retain the crate snapshot until dismissal.

On success, add the consumed crate ID locally and refresh after the result is stable. On an ambiguous request error, refresh while retaining the same request key for retry. Reset the single request key only when the selected crate changes or the action completes definitively.

- [ ] **Step 3: Implement sequential grouped bulk opening**

At confirmation, call `partitionCrateOpeningIds`, freeze all selected crate snapshots, and create one key per group:

```ts
const groups = partitionCrateOpeningIds(crates.map((crate) => crate.id)).map(
  (crateItemIds) => ({
    crateItemIds,
    signature: JSON.stringify([...crateItemIds].sort()),
    idempotencyKey: createEconomyIdempotencyKey(),
  }),
);
```

Process groups with an awaited loop. Post `{ crateItemIds }` with that group's stored key, map each response opening by `crateItemId`, update only those rows, add committed IDs to `consumedItemIds`, increment aggregate progress, then advance. Stop at the first failed/incomplete group and keep its index unchanged. `retryRemaining()` resumes that same group with the same key before later stored groups. Never use `Promise.all` for opening groups.

- [ ] **Step 4: Expose compact aggregate status and retry UI**

The bulk component header renders `completedCount of totalCount opened`, the current group number, and one of **Opening**, **Retry remaining**, or **Dismiss results**. Row status text distinguishes queued, verifying, revealing, complete, and failed. Results remain mounted until dismissal.

- [ ] **Step 5: Typecheck the extraction**

Run: `npm run typecheck`

Expected: PASS while `CrateOpener` temporarily imports or retains only its market-specific code.

- [ ] **Step 6: Commit**

```bash
git add components/economy/inventory-crate-opening.tsx components/economy/crate-opener.tsx
git commit -m "refactor: extract inventory crate opening experience"
```

### Task 3: Integrate single-container opening into item management

**Files:**
- Modify: `components/economy/inventory-manager.tsx`
- Modify: `components/economy/inventory-workspace.tsx`

**Interfaces:**
- Consumes: `useInventoryCrateOpening`, `InventorySingleCrateOpening`, and `isOpenableInventoryCrate`.
- Produces: one Inventory detail surface where opening, lock/unlock, and selling coexist.

- [ ] **Step 1: Make `InventoryManager` own all Inventory interaction state**

Remove controlled selection and cross-surface props from `InventoryManagerProps`:

```ts
type InventoryManagerProps = {
  inventory: unknown;
  loadout: unknown;
  wallet: unknown;
  csrf: string;
};
```

Instantiate the crate-opening hook and include `crateOpening.busy` in the manager's shared mutation-disabled condition. Filter committed `consumedItemIds` out of cards, except `retainedSingleCrate`, which remains mounted with `withRetainedOpenedItem` until its reveal is dismissed.

- [ ] **Step 2: Render the opening station in the existing detail workspace**

Below the selected crate's detail hero and before unrelated equip/customize panels, render:

```tsx
{isOpenableInventoryCrate(selected) ? (
  <InventorySingleCrateOpening
    crate={selected}
    controller={crateOpening}
    onClose={() => closeInventoryItem(selected.id)}
  />
) : null}
```

Keep the existing sale-protection and sell-to-market fieldsets in the secondary column. Their disabled states include opening activity, but they do not disappear merely because the item is a crate.

- [ ] **Step 3: Simplify `InventoryWorkspace`**

Replace the selection-owner/reset/access state with:

```tsx
export function InventoryWorkspace(props: InventoryWorkspaceProps) {
  return <InventoryManager {...props} />;
}
```

Remove imports and calls to `CrateOpener`, `inventoryWorkflowAccess`, and `nextInventorySelectionOwner`.

After the workspace no longer consumes them, remove `InventorySelectionOwner`, `nextInventorySelectionOwner`, and `inventoryWorkflowAccess` plus their obsolete tests from `lib/economy/inventory-selection.ts` and `lib/economy/inventory-selection.test.ts`.

- [ ] **Step 4: Verify single opening and existing inventory actions**

Run: `npm run test:inventory-selection && npm run test:inventory-lock && npm run typecheck`

Expected: PASS. Source inspection confirms **Open crate**, collapsed possible drops, sale protection, and sell action share the same selected-item panel.

- [ ] **Step 5: Commit**

```bash
git add components/economy/inventory-manager.tsx components/economy/inventory-workspace.tsx
git commit -m "feat: open individual crates from inventory"
```

### Task 4: Integrate up-to-50 bulk opening with lock and sale actions

**Files:**
- Modify: `components/economy/inventory-manager.tsx`
- Modify: `components/economy/inventory-crate-opening.tsx`

**Interfaces:**
- Consumes: `crateOnlySelection`, `MAX_INVENTORY_CRATE_OPEN_SELECTION`, and the opening controller.
- Produces: crate-only **Open selected** confirmation, aggregate progress, grouped results, and retry remaining.

- [ ] **Step 1: Derive open eligibility from the one selected-ID set**

Resolve items in `bulkSelectedIds` insertion order and compute:

```ts
const bulkCrateSelection = crateOnlySelection(items, bulkSelectedIds);
const bulkOpenableCrates =
  bulkCrateSelection.status === "ready" ? bulkCrateSelection.crates : [];
```

Do not mutate or filter this set for opening. A mixed or stale selection shows no open action. Keep `bulkSellableItems` as a separate derived subset so the same crate-only selection can still be sold when eligible.

- [ ] **Step 2: Add one confirmation flow for all selected crates**

Add `bulkOpenConfirming` mutually exclusive with `bulkSaleConfirming`. First activation shows: **Opening N crates consumes every selected container. Rewards are generated server-side in groups of 10. Select Confirm open to continue.** Second activation calls `crateOpening.openBulk(bulkOpenableCrates)` once and clears selection confirmation state.

Render the action beside the existing sale action:

```tsx
{bulkCrateSelection.status === "ready" ? (
  <button className="button button-primary" onClick={confirmOrOpenSelected}>
    {bulkOpenConfirming
      ? `Confirm open ${bulkOpenableCrates.length}`
      : `Open selected (${bulkOpenableCrates.length})`}
  </button>
) : null}
```

The existing 50-item selection guard is the player-action limit. Do not cap selection at ten and do not slice the selected crates before handing them to the controller.

- [ ] **Step 3: Mount bulk progress between toolbar and grid**

```tsx
<InventoryBulkCrateOpeningResults
  controller={crateOpening}
  onDismiss={() => {
    crateOpening.dismissBulk();
    setBulkSelectedIds(new Set());
    setInternalSelectionMode(false);
  }}
/>
```

Disable card selection, filters, pagination, locking, and selling only while requests are running. On a terminal partial failure, keep completed results and enable **Retry remaining** plus dismissal. Dismissal refreshes authoritative Inventory and returns to normal mode.

- [ ] **Step 4: Verify more-than-ten policy and interaction coexistence**

Run: `npm run test:inventory-selection && npm run test:inventory-lock && npm run test:crates && npm run typecheck`

Expected: PASS. Manually inspect 11- and 50-crate plans to ensure they create 2 and 5 sequential requests, respectively, while Sell selected and lock controls remain rendered.

- [ ] **Step 5: Commit**

```bash
git add components/economy/inventory-manager.tsx components/economy/inventory-crate-opening.tsx
git commit -m "feat: open up to fifty selected inventory crates"
```

### Task 5: Remove the duplicate opener, finish responsive UI, and verify

**Files:**
- Delete: `components/economy/crate-opener.tsx`
- Modify: `app/globals.css`
- Modify: `docs/superpowers/specs/2026-09-02-loadout-inventory-crate-consolidation-design.md`

**Interfaces:**
- Consumes: existing crate/inventory CSS variables and media-query conventions.
- Produces: one maintained opening implementation and complete theme/accessibility behavior.

- [ ] **Step 1: Prove the legacy component is unused, then remove it**

Run: `rg -n "CrateOpener|crate-opener" app components lib --glob '*.ts' --glob '*.tsx'`

Expected before deletion: no caller remains outside `components/economy/crate-opener.tsx`. Delete that file only after every needed reel/reveal helper is present in `inventory-crate-opening.tsx`.

- [ ] **Step 2: Add compact responsive result styling**

Use existing theme variables for panels, borders, focus rings, rarity accents, error/success states, and subdued text. Keep the toolbar actions wrapping into balanced rows. Use a two-column result grid where space allows and one column on narrow screens; prevent long item names and progress labels from causing horizontal overflow.

Add no new literal theme colors. Retain animation selectors in the new component and ensure existing `prefers-reduced-motion: reduce` and `forced-colors: active` rules still match; rename selectors only when all corresponding overrides are updated.

- [ ] **Step 3: Update the earlier design's superseded limit note**

Replace the earlier crate-limit non-goal with a link to the new spec and state that Inventory coordinates up to 50 containers while the server retains ten per atomic request. This prevents contradictory project documentation.

- [ ] **Step 4: Run automated verification**

Run: `npm test`

Expected: every suite passes.

Run: `npm run typecheck`

Expected: TypeScript exits successfully with no errors.

Run: `npm run build`

Expected: Next.js completes the production build and route generation successfully.

- [ ] **Step 5: Perform the full UI/UX consistency review**

Review Inventory at desktop and mobile widths for normal items, a single crate, mixed selection, locked crate selection, 1-crate bulk selection, 11-crate session, 50-crate session, completed results, and partial failure/retry. Verify keyboard focus, `aria-expanded`, live progress, action hierarchy, no required drop expansion, and continued sale access.

Repeat the source/theme check for default, Beta Tester, Tap God, reduced motion, and forced colors. Record any remaining inconsistency rather than hiding it.

- [ ] **Step 6: Refresh Graphify and inspect architecture diagnostics**

Run: `graphify update . --force`

Run: `graphify label . --backend=gemini --max-concurrency=4`

Run: `graphify query "InventoryManager useInventoryCrateOpening InventoryBulkCrateOpeningResults crateOnlySelection single selection owner" --budget 5000`

Confirm there is one Inventory selection owner and no edge to the deleted `CrateOpener`.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/economy/crate-opener.tsx docs/superpowers/specs/2026-09-02-loadout-inventory-crate-consolidation-design.md
git commit -m "refactor: retire duplicate owned crate surface"
```
