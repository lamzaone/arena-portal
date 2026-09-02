# Loadout Workspace Design

## Goal

Replace the current weapon-only accordion with a guided, image-led Loadout workspace that is easy to follow and supports owned weapon skins, knives, gloves, and agents.

## Product constraints

- Selection remains owned-only. The Loadout page never offers catalogue items the player does not own.
- Existing server-side ownership and compatibility checks remain authoritative.
- Weapon, knife, and glove cosmetics can target T, CT, or both teams when the item supports those teams.
- Agents are selected per team and never expose a misleading Both action.
- No database migration or API redesign is required: the existing economy loadout slots already support `weapon`, `knife`, `glove`, and `agent`.
- Default, BETA TESTER, and TAP GOD themes must continue to use shared theme tokens.

## Interaction model

The page presents three explicit steps.

### 1. Choose a category

A persistent category rail shows Weapons, Knives, Gloves, and Agents with owned-item counts. Categories remain visible when their count is zero so players can understand the complete loadout model. An empty category shows a focused owned-only empty state instead of disappearing.

### 2. Choose a weapon or team

Weapons expose a second filter rail for Rifles, Snipers, Pistols, SMGs, Shotguns, LMGs, and Other. Only weapon definitions for which the player owns at least one finish are shown.

Each weapon definition is a visual card containing:

- one representative owned-item image;
- the weapon name and number of owned finishes;
- T and CT badges with the currently equipped finish name or `Default`;
- selected and keyboard-focus states that do not depend on color alone.

The representative image prefers the equipped T item, then the equipped CT item, then the first owned finish. T and CT can still use different finishes; their names remain visible beneath the single image.

Knives, Gloves, and Agents skip the weapon-definition grid because each category maps directly to one T/CT slot pair. Their second step is the team selector and current T/CT equipment summary.

### 3. Choose an owned item

A single selection workspace replaces the repeated T, CT, and Both buttons on every item row. The player first chooses T, CT, or Both, then selects one owned item from an image gallery, and finally activates one primary Equip action.

- Team-incompatible items are filtered out for a single team.
- Both is offered only outside Agents and only includes items compatible with both teams.
- The selected item has a visible selected state and `aria-pressed` semantics.
- Equipped team badges identify whether an item is currently used by T, CT, or both.
- A contextual Clear action clears the currently selected team target rather than presenting three clear buttons at once.
- Pending mutations disable conflicting controls, retain the selected context, announce success or failure, and refresh authoritative loadout data.

## Data and component design

`app/loadout/page.tsx` continues loading the complete player inventory and current economy loadout in parallel. Page copy is broadened from weapon finishes to owned cosmetics.

`lib/economy/weapon-categories.ts` remains responsible for CS weapon-definition classification. A focused loadout-selection model will add pure helpers for:

- mapping owned inventory items to `weapon`, `knife`, `glove`, or `agent`;
- reading supported teams from catalogue metadata or instance attributes;
- building the correct existing loadout slot payload for a category and team target;
- choosing a weapon card's representative owned item;
- deriving equipped T/CT item IDs and labels.

`components/economy/loadout-manager.tsx` owns the guided UI state: active category, weapon class, selected weapon definition, team target, selected owned item, mutation state, and notice. It consumes the pure model rather than duplicating compatibility rules in JSX.

`MarketplaceItemPreview` provides every weapon and cosmetic image using the existing staff artwork, imported market image, proxy, and fallback chain. Its fallback icon mapping will include Gloves so every category has an appropriate non-image fallback.

The existing `/api/economy/loadout/equip` and `/api/economy/loadout/clear` endpoints remain unchanged. They continue locking the inventory item and validating ownership, item category, weapon definition, and supported teams inside the transaction.

## Responsive and theme behavior

- At desktop widths, weapon and cosmetic cards use a compact multi-column grid with the selection workspace directly below the category context.
- At tablet widths, the grid reduces columns without changing reading order.
- At 375px/mobile, controls stack in the same category → weapon/team → item sequence, team buttons meet the shared touch-target size, and no horizontal page overflow is introduced.
- All surfaces, borders, text, focus rings, success states, and selected states use existing `--theme-*` variables and forced-colors fallbacks.
- Motion is limited to existing short transitions and is disabled by the existing reduced-motion rules.

## Accessibility

- Step headings use a logical heading hierarchy and remain visible.
- Category, weapon-class, and team selectors expose pressed/selected state.
- Visual cards remain native buttons with descriptive accessible names.
- Item images have names that identify the represented weapon or cosmetic.
- Status messages retain the existing live toast behavior.
- Focus remains on the initiating control after save/clear; category changes move the logical selection without forcing focus unexpectedly.

## Error and empty states

- A player with no loadout-compatible items still sees all four categories and an explanation directing them to Market or crate opening.
- A category with no owned items shows a category-specific message.
- A selected team with no compatible owned item explains the team restriction.
- Server ownership or compatibility rejection is displayed through the existing danger toast, and the prior selection remains available for correction.

## Testing and verification

Development follows red-green TDD around the pure loadout-selection model. Tests cover:

- all weapon definition categories;
- owned-only inclusion of weapons, knives, gloves, and agents;
- representative-image priority: equipped T, equipped CT, first owned;
- T/CT/Both slot payloads for weapon and non-weapon categories;
- agent Both rejection and team compatibility filtering;
- empty and malformed metadata behavior.

Final verification runs the focused loadout tests, complete `npm test`, non-incremental TypeScript checking, production build, diff checks, and an independent review. The UI is inspected at 375, 768, 1024, and 1440px where the available local tooling permits.
