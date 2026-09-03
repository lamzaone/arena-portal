---
type: "query"
date: "2026-09-02T23:56:19.571781+00:00"
question: "Improve the layout for crates in Inventory because it has too much unused space."
contributor: "graphify"
outcome: "useful"
source_nodes: ["inventory-manager.tsx", "inventory-crate-opening.tsx", "crate-drop-preview.tsx"]
---

# Q: Improve the layout for crates in Inventory because it has too much unused space.

## Answer

Expanded from original query via graph vocab: [inventory, crate, container, management, workspace, opening, sale, modal, layout, grid, lock, drops]. The InventoryManager renders the item preview and InventorySingleCrateOpening inside inventory-management-main, beside inventory-management-aside. A late equal-three-column CSS rule caused the preview and opening cards to remain short while the sale rail controlled row height. The implemented container-only layout uses a two-column workspace with a wider left action column, stacks the horizontal preview above the opening station, and keeps lock and sell controls in the right rail; unavailable containers retain the standard layout so no empty opening slot is reserved.

## Outcome

- Signal: useful

## Source Nodes

- inventory-manager.tsx
- inventory-crate-opening.tsx
- crate-drop-preview.tsx