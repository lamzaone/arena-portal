# Guided Loadout Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weapon-only Loadout accordion with an owned-only, image-led category -> weapon/team -> cosmetic workflow supporting weapons, knives, gloves, and agents.

**Architecture:** Keep the existing inventory loader and economy loadout APIs authoritative. Put category, team-compatibility, slot-building, and representative-image decisions in a pure `loadout-selection` model; keep `EconomyLoadoutManager` focused on guided interaction state and rendering. Use existing catalogue artwork through `MarketplaceItemPreview` and existing `--theme-*` tokens.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Node test runner, Lucide React, existing CSS/theme system.

**Spec:** `docs/superpowers/specs/2026-09-02-loadout-workspace-design.md`

## Global Constraints

- Only available items owned by the signed-in player may be offered.
- Categories are exactly `weapon`, `knife`, `glove`, and `agent`; Agents never allow a Both target.
- Existing `/api/economy/loadout/equip` and `/api/economy/loadout/clear` contracts stay unchanged.
- The server remains authoritative for ownership, definition matching, and team compatibility.
- Every visual color, border, focus, and selection state uses existing theme variables and works in default, BETA TESTER, TAP GOD, reduced-motion, and forced-colors modes.
- Do not add packages, schema changes, generated artwork, or catalogue-wide unowned choices.

---

### Task 1: Add the pure owned-loadout selection model

**Files:**
- Create: `lib/economy/loadout-selection.ts`
- Create: `lib/economy/loadout-selection.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: inventory-shaped items with `id`, `itemType`, `definitionIndex`, `displayName`, and optional `raw` data.
- Produces:
  - `LoadoutCategoryId = "weapon" | "knife" | "glove" | "agent"`
  - `LoadoutTeamTarget = "T" | "CT" | "both"`
  - `loadoutCategoryForItem(item): LoadoutCategoryId | null`
  - `loadoutItemSupportsTarget(item, target): boolean`
  - `ownedItemsForLoadout(items, category, target?): T[]`
  - `loadoutSlotsForTarget(category, target, definitionIndex?): EconomyLoadoutSlotInput[]`
  - `representativeLoadoutItem(items, equippedTItemId, equippedCTItemId): T | null`

- [ ] **Step 1: Write failing category and compatibility tests**

Create `lib/economy/loadout-selection.test.ts` with real item records:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  loadoutCategoryForItem,
  loadoutItemSupportsTarget,
  ownedItemsForLoadout,
} from "./loadout-selection.ts";

const items = [
  { id: "ak", itemType: "skin", definitionIndex: 7, displayName: "AK-47 | Redline", raw: {} },
  { id: "knife", itemType: "knife", definitionIndex: 500, displayName: "Karambit", raw: {} },
  { id: "glove", itemType: "glove", definitionIndex: 5030, displayName: "Sport Gloves", raw: {} },
  { id: "agent-t", itemType: "agent", definitionIndex: null, displayName: "The Elite Mr. Muhlik", raw: { catalogue: { metadata: { teams: ["T"] } } } },
  { id: "sticker", itemType: "sticker", definitionIndex: null, displayName: "Sticker", raw: {} },
] as const;

test("maps only supported owned cosmetic types to loadout categories", () => {
  assert.deepEqual(items.map(loadoutCategoryForItem), ["weapon", "knife", "glove", "agent", null]);
});

test("filters owned cosmetics by category and target team", () => {
  assert.deepEqual(ownedItemsForLoadout(items, "agent", "T").map((item) => item.id), ["agent-t"]);
  assert.deepEqual(ownedItemsForLoadout(items, "agent", "CT"), []);
  assert.equal(loadoutItemSupportsTarget(items[3], "both"), false);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
node --experimental-strip-types --test lib/economy/loadout-selection.test.ts
```

Expected: failure because `loadout-selection.ts` does not exist.

- [ ] **Step 3: Implement category and team compatibility**

Create `lib/economy/loadout-selection.ts` with structural item types, a safe object reader, and these rules:

```ts
import type { EconomyLoadoutSlotInput } from "@/lib/data/portal-repository";

export type LoadoutCategoryId = "weapon" | "knife" | "glove" | "agent";
export type LoadoutTeamTarget = "T" | "CT" | "both";

export type LoadoutItemLike = {
  id: string;
  itemType: string;
  definitionIndex: number | null;
  displayName: string;
  raw?: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function loadoutMetadata(item: LoadoutItemLike) {
  const catalogue = record(item.raw?.catalogue);
  return record(catalogue?.metadata) ?? record(item.raw?.attributes) ?? {};
}

export function loadoutCategoryForItem(item: LoadoutItemLike): LoadoutCategoryId | null {
  const explicit = loadoutMetadata(item).loadoutCategory;
  if (["weapon", "knife", "glove", "agent"].includes(String(explicit)))
    return explicit as LoadoutCategoryId;
  if (item.itemType === "skin" || item.itemType === "weapon") return "weapon";
  if (item.itemType === "knife" || item.itemType === "glove" || item.itemType === "agent")
    return item.itemType;
  return null;
}

function supportedTeams(item: LoadoutItemLike) {
  const teams = loadoutMetadata(item).teams;
  return Array.isArray(teams)
    ? teams.filter((team): team is "T" | "CT" => team === "T" || team === "CT")
    : ["T", "CT"] as const;
}

export function loadoutItemSupportsTarget(item: LoadoutItemLike, target: LoadoutTeamTarget) {
  const teams = supportedTeams(item);
  return target === "both"
    ? teams.includes("T") && teams.includes("CT")
    : teams.includes(target);
}

export function ownedItemsForLoadout<T extends LoadoutItemLike>(
  items: readonly T[],
  category: LoadoutCategoryId,
  target?: LoadoutTeamTarget,
) {
  return items.filter((item) =>
    loadoutCategoryForItem(item) === category &&
    (target === undefined || loadoutItemSupportsTarget(item, target)),
  );
}
```

- [ ] **Step 4: Verify category tests GREEN**

Run the focused test and expect both tests to pass.

- [ ] **Step 5: Write failing slot and representative-selection tests**

Append:

```ts
import {
  loadoutSlotsForTarget,
  representativeLoadoutItem,
} from "./loadout-selection.ts";

test("builds existing API slot payloads for weapon and cosmetic targets", () => {
  assert.deepEqual(loadoutSlotsForTarget("weapon", "both", 7), [
    { slotType: "weapon", team: "T", definitionIndex: 7 },
    { slotType: "weapon", team: "CT", definitionIndex: 7 },
  ]);
  assert.deepEqual(loadoutSlotsForTarget("knife", "CT"), [
    { slotType: "knife", team: "CT" },
  ]);
  assert.throws(() => loadoutSlotsForTarget("agent", "both"), /per team/i);
});

test("prefers equipped T, then equipped CT, then the first owned image item", () => {
  const choices = [items[0], { ...items[0], id: "ak-2", displayName: "AK-47 | Slate" }];
  assert.equal(representativeLoadoutItem(choices, "ak-2", "ak")?.id, "ak-2");
  assert.equal(representativeLoadoutItem(choices, null, "ak-2")?.id, "ak-2");
  assert.equal(representativeLoadoutItem(choices, null, null)?.id, "ak");
});
```

- [ ] **Step 6: Run tests and verify the new assertions fail for missing exports**

Run the focused test. Expected: failure because the slot and representative helpers are absent.

- [ ] **Step 7: Implement slot and representative helpers**

Implement:

```ts
export function loadoutSlotsForTarget(
  category: LoadoutCategoryId,
  target: LoadoutTeamTarget,
  definitionIndex?: number,
): EconomyLoadoutSlotInput[] {
  if (category === "agent" && target === "both")
    throw new RangeError("Agents must be selected per team.");
  let teams: Array<"T" | "CT">;
  if (target === "both") {
    teams = ["T", "CT"];
  } else {
    teams = [target];
  }
  if (category === "weapon") {
    if (!Number.isSafeInteger(definitionIndex))
      throw new RangeError("A weapon definition is required.");
    return teams.map((team) => ({ slotType: "weapon", team, definitionIndex: definitionIndex! }));
  }
  return teams.map((team) => ({ slotType: category, team }));
}

export function representativeLoadoutItem<T extends LoadoutItemLike>(
  items: readonly T[],
  equippedTItemId: string | null,
  equippedCTItemId: string | null,
) {
  return items.find((item) => item.id === equippedTItemId)
    ?? items.find((item) => item.id === equippedCTItemId)
    ?? items[0]
    ?? null;
}
```

- [ ] **Step 8: Add the new suite to the default test command**

Update `test:loadout` in `package.json`:

```json
"test:loadout": "node --experimental-strip-types --test lib/economy/weapon-categories.test.ts lib/economy/loadout-selection.test.ts"
```

- [ ] **Step 9: Run focused and complete tests**

Run:

```powershell
npm run test:loadout
npm test
```

Expected: all tests pass.

- [ ] **Step 10: Commit Task 1**

```powershell
git add -- lib/economy/loadout-selection.ts lib/economy/loadout-selection.test.ts package.json
git commit -m "feat: model owned cosmetic loadout choices"
```

---

### Task 2: Rebuild the Loadout manager as a guided visual workflow

**Files:**
- Modify: `components/economy/loadout-manager.tsx`

**Interfaces:**
- Consumes: `EconomyInventoryPage`, `EconomyLoadoutSlot[]`, CS weapon groups, and all Task 1 helpers.
- Produces: one controlled three-step workspace with category, weapon/team, owned-item, Equip, and Clear interactions.

- [ ] **Step 1: Establish derived owned category data**

Replace `weaponItems` with `availableItems`, produced by filtering `state === "available"` before `toEconomyItem`. Derive:

```ts
const categoryItems = ownedItemsForLoadout(availableItems, activeCategory);
const compatibleItems = ownedItemsForLoadout(availableItems, activeCategory, teamTarget);
const weaponGroups = ownedWeaponSkins(ownedItemsForLoadout(availableItems, "weapon"));
```

Render all four category definitions, not only non-empty categories:

```ts
const LOADOUT_CATEGORIES = [
  { id: "weapon", label: "Weapons", icon: Crosshair },
  { id: "knife", label: "Knives", icon: Sword },
  { id: "glove", label: "Gloves", icon: Hand },
  { id: "agent", label: "Agents", icon: UserRound },
] as const;
```

- [ ] **Step 2: Replace accordion state with guided selection state**

Use:

```ts
const [activeCategory, setActiveCategory] = useState<LoadoutCategoryId>("weapon");
const [activeWeaponCategory, setActiveWeaponCategory] = useState<WeaponCategoryId>("rifles");
const [selectedDefinitionIndex, setSelectedDefinitionIndex] = useState<number | null>(null);
const [teamTarget, setTeamTarget] = useState<LoadoutTeamTarget>("T");
const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
```

When a category, weapon class, weapon definition, or team target changes, clear only selections that are no longer compatible. Agents force `teamTarget` from Both to T. Do not move DOM focus automatically.

- [ ] **Step 3: Generalize equip and clear mutations**

Change `runAction` to accept `LoadoutCategoryId`, `LoadoutTeamTarget`, optional `definitionIndex`, and optional `itemId`. Build `slots` through `loadoutSlotsForTarget`. Keep the existing endpoints, CSRF, toast, `router.refresh()`, error conversion, and pending lockout.

The action key must include category, target, definition, and item ID so loading text is deterministic:

```ts
const actionKey = [action, category, definitionIndex ?? "global", team, itemId ?? "clear"].join("-");
```

- [ ] **Step 4: Render Step 1 category cards**

Render a labeled `<nav>` or grouped control with the four categories, Lucide icons, owned counts, `aria-pressed`, and a visible step number. Each remains enabled at count zero and opens its empty state.

- [ ] **Step 5: Render the visual weapon chooser**

For Weapons only:

- show the existing seven weapon-class filters;
- render only owned weapon definitions in the selected class;
- make each definition a native button card;
- render `MarketplaceItemPreview` for `representativeLoadoutItem(...)`;
- show weapon name, owned finish count, and T/CT equipped-name badges;
- set `aria-pressed` and a descriptive label such as `Choose AK-47, 3 owned finishes`.

Use `slotItem(loadout, "weapon", team, definitionIndex)` to read current equipment. Do not nest another button or link inside a weapon button.

- [ ] **Step 6: Render the non-weapon current-slot summary**

For Knives, Gloves, and Agents, render the T and CT current loadout cards directly. Each card contains the equipped item's image when present, its name or `Default`, and a team badge. These are status cards; team selection remains in the Step 3 segmented control.

Resolve each equipped slot's `itemId` back to `availableItems` before rendering its preview. If the equipped item is missing from the current available inventory view, retain the slot's server-provided name and render the normal type fallback rather than dropping the status.

- [ ] **Step 7: Render Step 3 team and owned-item selection**

Render T and CT for every category and Both for Weapons, Knives, and Gloves. Then render compatible owned choices as image buttons:

```tsx
<button
  type="button"
  className={`loadout-choice-card ${selected ? "is-selected" : ""}`}
  aria-pressed={selected}
  onClick={() => setSelectedItemId(item.id)}
>
  <MarketplaceItemPreview item={item} enableMarketPreview={false} />
  <strong>{item.displayName}</strong>
  <span>{equippedTeamLabels(item.id, loadout)}</span>
</button>
```

Retain rarity, float, StatTrak, nametag, sale-lock, and equipped badges without making the cards text-heavy.

- [ ] **Step 8: Add one contextual action bar**

Render one primary button whose label includes the selected target, for example `Equip for T` or `Equip for both teams`. Disable it until an owned compatible item is selected. Render one secondary `Use default for T/CT/both` action that calls the clear endpoint for the current context. During a mutation, disable category, filter, team, item, and action controls and show the existing spinner.

- [ ] **Step 9: Add category-specific empty states**

Keep the full workspace mounted even if the player owns nothing. Messages are:

- Weapons: `You do not own a weapon finish in this class yet.`
- Knives: `You do not own a knife yet.`
- Gloves: `You do not own gloves yet.`
- Agents: `You do not own an Agent for this team yet.`

Point players to Market or owned-crate opening without offering unowned cosmetics in place.

- [ ] **Step 10: Run TypeScript and loadout tests**

```powershell
npm run test:loadout
npm run typecheck -- --incremental false
```

Expected: pass.

- [ ] **Step 11: Commit Task 2**

```powershell
git add -- components/economy/loadout-manager.tsx
git commit -m "feat: guide owned loadout selection"
```

---

### Task 3: Add the responsive image-led presentation and page copy

**Files:**
- Modify: `app/globals.css`
- Modify: `app/loadout/page.tsx`
- Modify: `components/economy/marketplace-item-preview.tsx`

**Interfaces:**
- Consumes: the semantic class names introduced by Task 2 and existing `--theme-*` variables.
- Produces: responsive visual cards, team badges, selected states, an appropriate Glove fallback, and inclusive Loadout page messaging.

- [ ] **Step 1: Broaden page copy**

Update signed-out and signed-in descriptions to say `owned cosmetics` and explicitly name weapons, knives, gloves, and Agents. Keep the existing `PortalShell`, `PageHeading`, loader calls, and token generation unchanged.

- [ ] **Step 2: Add the Glove fallback icon**

Import `Hand` from Lucide in `marketplace-item-preview.tsx` and return it for `itemType === "glove"`. Existing direct/proxy/market-preview image resolution remains unchanged.

- [ ] **Step 3: Replace obsolete accordion CSS with workspace CSS**

In the current Loadout block of `app/globals.css`, define:

- `.loadout-steps` and `.loadout-step` for explicit numbered hierarchy;
- `.loadout-primary-categories` and `.loadout-weapon-categories` for scroll-safe controls;
- `.loadout-weapon-grid` using `repeat(auto-fill, minmax(220px, 1fr))`;
- `.loadout-weapon-card` as an image-led button with no nested controls;
- `.loadout-team-summary` and `.loadout-team-badge` for T/CT names;
- `.loadout-team-target` for the single target selector;
- `.loadout-choice-grid` using `repeat(auto-fill, minmax(190px, 1fr))`;
- `.loadout-choice-card` with selected, equipped, hover, disabled, and `:focus-visible` states;
- `.loadout-action-bar` for the single Equip and Clear actions.

Use `var(--theme-page-bg)`, `var(--theme-surface-raised)`, `var(--theme-control-bg)`, `var(--theme-border)`, `var(--theme-border-strong)`, `var(--theme-text)`, `var(--theme-text-muted)`, `var(--theme-text-subtle)`, `var(--theme-accent)`, `var(--theme-accent-soft)`, `var(--theme-success)`, and `var(--theme-focus-ring)` rather than theme-specific hard-coded colors.

- [ ] **Step 4: Add responsive, reduced-motion, and forced-color rules**

- 1024px: reduce the visual grid naturally through `auto-fill`.
- 768px: stack step header/action layouts and keep horizontal selector rails locally scrollable.
- 375px: use one card column, 44px minimum target controls, full-width action buttons, and no page-level horizontal overflow.
- `prefers-reduced-motion: reduce`: remove card/indicator transitions and spinner animation.
- `forced-colors: active`: use `CanvasText` borders and a `Highlight` outline for selected cards and controls.

- [ ] **Step 5: Perform a source-level theme and accessibility inspection**

Check:

```powershell
rg -n "loadout-(step|primary|weapon|team|choice|action)" components/economy/loadout-manager.tsx app/globals.css
rg -n "#[0-9a-fA-F]{3,8}|rgba\(" app/globals.css
```

Confirm new Loadout rules use theme variables, every interactive card is a native button, images have useful names, selected state has text or icon support, focus is visible, and controls do not nest interactives.

- [ ] **Step 6: Run verification for the presentation task**

```powershell
npm run test:loadout
npm run typecheck -- --incremental false
npm run build
git diff --check
```

Expected: tests, typecheck, 69-route production build, and whitespace checks pass.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- app/loadout/page.tsx components/economy/marketplace-item-preview.tsx app/globals.css
git commit -m "style: clarify the visual loadout workflow"
```

---

### Task 4: Review, verify, and refresh architecture output

**Files:**
- Update generated, untracked output: `graphify-out/`
- Do not modify pre-existing unrelated `tsconfig.tsbuildinfo` or nested `arena-portal/` dirt.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: independent review evidence, complete verification evidence, and a fresh Gemini-labelled graph.

- [ ] **Step 1: Request an independent requirements review**

Ask the reviewer to check owned-only behavior, all four categories, server slot parity, representative-image priority, Agent team restrictions, mutation locking, empty states, keyboard semantics, responsive behavior, and theme-token use. Fix and re-review every Critical or Important finding.

- [ ] **Step 2: Run the complete verification suite**

```powershell
npm test
npm run typecheck -- --incremental false
npm run build
git diff --check
git status --short
```

Expected: all tests pass, TypeScript passes, the production build generates all routes, diff check is clean, and only acknowledged generated/pre-existing dirt remains.

- [ ] **Step 3: Refresh Graphify and Gemini community labels**

```powershell
$py = Get-Content -Raw -LiteralPath 'graphify-out\.graphify_python'
& $py -m graphify update .
& $py -m graphify label . --backend=gemini --max-concurrency=4
& $py -m graphify diagnose multigraph --graph 'graphify-out\graph.json' --undirected
```

Confirm the report's `Built from commit` matches `git rev-parse --short HEAD` and the diagnostic has zero dangling endpoints, self-loops, exact duplicates, and collapsed endpoint pairs.

- [ ] **Step 4: Report the result and audit limitations**

Summarize changed behavior, exact test/build totals, reviewed themes and widths, any browser-tooling limitation, Graphify statistics, commits, and untouched worktree entries.
