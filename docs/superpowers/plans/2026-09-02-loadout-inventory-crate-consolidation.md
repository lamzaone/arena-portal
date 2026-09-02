# Loadout, Inventory Locks, and Crate Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate owned-skin Loadout page, persistent inventory sale locks, Market crate quantity/drop controls, and Inventory crate opening while retiring the standalone Crates UI.

**Architecture:** Reuse the existing economy inventory and loadout authorities, adding only a dedicated sale-lock column and mutation. Extract pure weapon/category and crate presentation helpers for testability, then compose focused client components into `/loadout`, Market, and Inventory without reviving the legacy WeaponSkins editor.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, MySQL 8, Node test runner, existing CSS theme tokens.

**Spec:** `docs/superpowers/specs/2026-09-02-loadout-inventory-crate-consolidation-design.md`

## Global Constraints

- `/loadout` is a standalone authenticated page and account-nav tab immediately after Inventory.
- Only owned Token Inventory skin instances may be equipped.
- Loadout actions support T, CT, Both, and clearing slots.
- Sale locks prevent only selling; locked items remain equipable, customizable, tradable, and openable.
- Crate cards in Market and Inventory retain expandable server-verified drop previews.
- Market owns crate purchases with quantities from 1 through 50; Inventory owns crate opening.
- `/crates` redirects to `/inventory` and is removed from account navigation.
- All new UI inherits the existing portal theme, reduced-motion, and forced-colors behavior.

---

### Task 1: Shared weapon grouping and owned-skin model

**Files:**
- Create: `lib/economy/weapon-categories.ts`
- Create: `lib/economy/weapon-categories.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WeaponCategoryId`, `WEAPON_CATEGORIES`, `weaponCategoryForDefinition(definitionIndex: number): WeaponCategoryId`, and `ownedWeaponSkins(items: EconomyItemView[]): OwnedWeaponSkinGroup[]`.
- Consumes: `EconomyItemView` from `components/economy/economy-view-model.ts`.

- [ ] **Step 1: Add the failing grouping tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  ownedWeaponSkins,
  weaponCategoryForDefinition,
} from "./weapon-categories.ts";

test("groups representative CS2 definitions", () => {
  assert.equal(weaponCategoryForDefinition(7), "rifles");
  assert.equal(weaponCategoryForDefinition(9), "snipers");
  assert.equal(weaponCategoryForDefinition(4), "pistols");
  assert.equal(weaponCategoryForDefinition(17), "smgs");
  assert.equal(weaponCategoryForDefinition(35), "shotguns");
  assert.equal(weaponCategoryForDefinition(28), "lmgs");
  assert.equal(weaponCategoryForDefinition(65_535), "other");
});

test("groups only owned weapon skins with a definition index", () => {
  const groups = ownedWeaponSkins([
    { id: "ak-redline", itemType: "skin", definitionIndex: 7, displayName: "AK-47 | Redline" },
    { id: "sticker", itemType: "sticker", definitionIndex: null, displayName: "Sticker" },
  ] as never);
  assert.deepEqual(groups.map((group) => [group.definitionIndex, group.items.map((item) => item.id)]), [[7, ["ak-redline"]]]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test lib/economy/weapon-categories.test.ts`

Expected: FAIL because `weapon-categories.ts` does not exist.

- [ ] **Step 3: Implement the grouping module**

Define exhaustive sets for the portal-supported rifle, sniper, pistol, SMG, shotgun, and LMG definition indexes; return `other` for unknown indexes. Group `skin` and legacy `weapon` inventory items by definition index, preserve each owned instance, and sort weapons and skins by display name.

- [ ] **Step 4: Add the focused test to `npm test` and verify GREEN**

Run: `npm run test:loadout`

Expected: PASS for both grouping behaviors.

- [ ] **Step 5: Commit**

```bash
git add package.json lib/economy/weapon-categories.ts lib/economy/weapon-categories.test.ts
git commit -m "feat: add owned weapon loadout grouping"
```

### Task 2: Persistent sale-lock policy and mutation

**Files:**
- Create: `db/022_inventory_sale_locks.sql`
- Create: `lib/economy/inventory-sale-lock.ts`
- Create: `lib/economy/inventory-sale-lock.test.ts`
- Create: `app/api/economy/items/lock/route.ts`
- Modify: `lib/data/portal-repository.ts`
- Modify: `components/economy/economy-view-model.ts`
- Modify: `app/api/economy/items/sell/route.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `EconomyInventoryItem.saleLocked: boolean`, `setEconomyInventorySaleLock(input): Promise<{itemIds: string[]; saleLocked: boolean}>`, `canSellInventoryItem(item): boolean`, and `POST /api/economy/items/lock`.
- Consumes: `runEconomyMutation`, `lockEconomyInventoryItems`, `writeInventoryEvents`, and the existing economy request parser.

- [ ] **Step 1: Add failing sale-policy tests**

```ts
test("a sale-locked otherwise-available item cannot be sold", () => {
  assert.equal(canSellInventoryItem({ state: "available", tradable: true, saleLocked: true, stickers: [], catalogueId: 1 } as never), false);
});

test("an unlocked available priced item can be sold", () => {
  assert.equal(canSellInventoryItem({ state: "available", tradable: true, saleLocked: false, stickers: [], catalogueId: 1 } as never), true);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --experimental-strip-types --test lib/economy/inventory-sale-lock.test.ts`

Expected: FAIL because the sale-lock policy module does not exist.

- [ ] **Step 3: Add the schema and typed inventory field**

Add `sale_locked BOOLEAN NOT NULL DEFAULT FALSE` after `tradable`, plus an owner/lock browse index. Include `i.sale_locked` in `economyInventorySelect`, parse it in `toEconomyInventoryItem`, add it to inventory snapshots, and expose it through the client view model as `saleLocked`.

- [ ] **Step 4: Implement atomic single/bulk lock persistence**

Normalize and sort one to 50 UUIDs, lock rows with `FOR UPDATE`, reject missing or foreign-owned rows, update changed rows in one transaction, and emit `inventory.sale-locked` or `inventory.sale-unlocked` events only for actual changes.

- [ ] **Step 5: Add the lock route**

Accept `{ itemId, saleLocked }` or `{ itemIds, saleLocked }`, validate the boolean and 1–50 IDs, call `setEconomyInventorySaleLock`, and return a stable success message and changed IDs through `economyJsonSuccess`.

- [ ] **Step 6: Enforce locks in single and bulk sale paths**

Exclude locked items from route-level quote candidates and reject `saleLocked` rows again inside `sellEconomyItem()` and `sellEconomyItems()` before token credit or consumption.

- [ ] **Step 7: Run focused and existing economy tests**

Run: `npm run test:inventory-lock && npm test`

Expected: PASS with locked and unlocked policy cases plus all existing suites.

- [ ] **Step 8: Commit**

```bash
git add db/022_inventory_sale_locks.sql lib/data/portal-repository.ts lib/economy/inventory-sale-lock.ts lib/economy/inventory-sale-lock.test.ts components/economy/economy-view-model.ts app/api/economy/items/lock/route.ts app/api/economy/items/sell/route.ts package.json
git commit -m "feat: add inventory sale locks"
```

### Task 3: Dedicated owned-skin Loadout page

**Files:**
- Create: `app/loadout/page.tsx`
- Create: `components/economy/loadout-manager.tsx`
- Modify: `components/account-nav.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `ownedWeaponSkins`, `getCompletePlayerEconomyInventory`, `getPlayerEconomyLoadout`, `/api/economy/loadout/equip`, and `/api/economy/loadout/clear`.
- Produces: authenticated `/loadout` UI and account navigation entry.

- [ ] **Step 1: Add failing request-builder tests to the loadout suite**

```ts
test("builds one slot for T and two slots for Both", () => {
  assert.deepEqual(loadoutSlots(7, "T"), [{ slotType: "weapon", team: "T", definitionIndex: 7 }]);
  assert.deepEqual(loadoutSlots(7, "both"), [
    { slotType: "weapon", team: "T", definitionIndex: 7 },
    { slotType: "weapon", team: "CT", definitionIndex: 7 },
  ]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:loadout`

Expected: FAIL because `loadoutSlots` is not exported.

- [ ] **Step 3: Implement request helpers and the page loader**

Export the pure team-to-slot helper. Load session, inventory, and authoritative loadout in parallel where safe. Render `SignInRequired` when signed out and `PortalShell` plus `PageHeading` when signed in.

- [ ] **Step 4: Build the category → weapon → owned-skin interaction**

Render category buttons, weapon cards with T/CT equipped summaries, and one inline expandable picker. Each owned instance shows image, rarity, float, StatTrak, nametag, lock badge, and equipped state. Equip and clear actions post through `postEconomyAction` and refresh after success.

- [ ] **Step 5: Add accessible themed styling**

Use existing CSS custom properties and rarity classes. Connect buttons and panels with `aria-expanded`/`aria-controls`, retain visible focus, and collapse the weapon/picker layout on narrow screens without horizontal page overflow.

- [ ] **Step 6: Verify the Loadout journey**

Run: `npm run test:loadout && npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add app/loadout/page.tsx components/economy/loadout-manager.tsx components/account-nav.tsx app/globals.css lib/economy/weapon-categories.ts lib/economy/weapon-categories.test.ts
git commit -m "feat: add dedicated owned-skin loadout"
```

### Task 4: Shared expandable crate-drop model and Market quantity purchase

**Files:**
- Create: `lib/economy/crate-presentation.ts`
- Create: `lib/economy/crate-presentation.test.ts`
- Create: `components/economy/crate-drop-preview.tsx`
- Modify: `components/economy/marketplace-browser.tsx`
- Modify: `components/economy/crate-opener.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `clampCrateQuantity(value): number`, `cratePurchaseTotal(unitPrice, quantity): number`, shared drop-response parsing, and `CrateDropPreview`.
- Consumes: `/api/economy/crates/[catalogueId]/drops` and existing rarity/item preview helpers.

- [ ] **Step 1: Add failing crate presentation tests**

```ts
test("clamps quantities and calculates safe totals", () => {
  assert.equal(clampCrateQuantity(0), 1);
  assert.equal(clampCrateQuantity(51), 50);
  assert.equal(cratePurchaseTotal(125, 4), 500);
});

test("rejects malformed drop responses", () => {
  assert.equal(crateDropStateFromResponse({ drops: [] }).status, "empty");
  assert.equal(crateDropStateFromResponse({ drops: "invalid" }).status, "error");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:crates`

Expected: FAIL because the shared crate presentation module does not exist.

- [ ] **Step 3: Extract pure helpers and shared drop preview**

Move quantity bounds, drop normalization, odds labels, rarity ordering, and shared loading/error/empty/ready presentation out of the current crate opener. Keep the existing endpoint and authoritative response shape unchanged.

- [ ] **Step 4: Add container-specific Market controls**

For `crate` and `capsule` listings, replace the ordinary single-buy action with an expandable panel containing `CrateDropPreview`, quantity input/stepper, unit price, safe total, affordability state, and purchase button. Include `quantity` in the existing market purchase request. Preserve all non-container purchase controls unchanged.

- [ ] **Step 5: Verify Market crate behavior**

Run: `npm run test:crates && npm run typecheck`

Expected: PASS; non-container TypeScript branches remain exhaustive.

- [ ] **Step 6: Commit**

```bash
git add lib/economy/crate-presentation.ts lib/economy/crate-presentation.test.ts components/economy/crate-drop-preview.tsx components/economy/marketplace-browser.tsx components/economy/crate-opener.tsx package.json
git commit -m "feat: move crate purchasing into market"
```

### Task 5: Inventory lock controls and owned-crate opening

**Files:**
- Modify: `components/economy/inventory-manager.tsx`
- Modify: `components/economy/economy-item-card.tsx`
- Modify: `components/economy/crate-opener.tsx`
- Modify: `app/inventory/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `CrateDropPreview`, existing crate-open API, lock API, inventory `saleLocked`, and existing single/bulk opening reveal logic.
- Produces: lock badges/actions, bulk lock/unlock, and inline owned-crate opening inside Inventory.

- [ ] **Step 1: Extend the failing inventory policy tests**

```ts
test("locked items stay selectable for lock management but not sale", () => {
  const item = { state: "available", tradable: true, saleLocked: true, stickers: [], catalogueId: 1 } as never;
  assert.equal(canSelectForLock(item), true);
  assert.equal(canSellInventoryItem(item), false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:inventory-lock`

Expected: FAIL because `canSelectForLock` does not exist.

- [ ] **Step 3: Add single and bulk lock UI**

Show lock status on cards and details. Add lock/unlock actions posting one ID. Generalize selection state so selected eligible items can be locked or unlocked while the sale action uses only unlocked sellable items. Preserve the 50-item cap and confirmation behavior.

- [ ] **Step 4: Embed owned-crate controls**

Pass crate data required by the opener through the Inventory page. On an owned crate/capsule card, render the shared verified drops panel and the existing single-opening reveal. Retain bulk opening for selected owned containers and prevent the general sale selection from conflicting with opening selection.

- [ ] **Step 5: Add responsive and themed states**

Style locked badges, selection action grouping, crate expansion, opening progress, and reward rows using existing semantic variables. Add reduced-motion overrides for the reveal path and visible forced-color boundaries.

- [ ] **Step 6: Verify Inventory behavior**

Run: `npm run test:inventory-lock && npm run test:crates && npm run typecheck`

Expected: PASS with lock eligibility and crate helpers covered.

- [ ] **Step 7: Commit**

```bash
git add app/inventory/page.tsx components/economy/inventory-manager.tsx components/economy/economy-item-card.tsx components/economy/crate-opener.tsx app/globals.css
git commit -m "feat: add inventory locks and crate opening"
```

### Task 6: Retire the standalone Crates UI and complete verification

**Files:**
- Modify: `app/crates/page.tsx`
- Modify: `components/account-nav.tsx`
- Modify: `README.md`

**Interfaces:**
- Produces: permanent `/crates` → `/inventory` server redirect and final documented navigation.
- Consumes: Next.js `redirect()`.

- [ ] **Step 1: Replace the Crates page with a server redirect**

```tsx
import { redirect } from "next/navigation";

export default function CratesPage() {
  redirect("/inventory");
}
```

- [ ] **Step 2: Remove Crates from account navigation and document the new flows**

Keep `Inventory`, `Loadout`, `Market`, `Redeem`, and the remaining tabs in the agreed order. Update economy documentation so Market is the purchase location and Inventory is the opening location.

- [ ] **Step 3: Run the complete automated verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: all test suites pass, TypeScript reports no errors, and Next produces a successful production build.

- [ ] **Step 4: Perform focused browser QA**

Verify desktop and mobile navigation, T/CT/Both loadout state, owned-only selection, keyboard expansion, lock/unlock and sale rejection, Market crate drops and quantities, Inventory single/bulk opening, default/Beta Tester/Tap God themes, reduced motion, and forced colors.

- [ ] **Step 5: Commit**

```bash
git add app/crates/page.tsx components/account-nav.tsx README.md
git commit -m "feat: consolidate crate flows into market and inventory"
```
