---
type: "query"
date: "2026-09-02T23:31:28.741128+00:00"
question: "in market, for crates, remove the Container price square. Keep the amount selector, and the 2 buttons stacked on eachother. Widen the modal if needed, when expanding possible drops"
contributor: "graphify"
outcome: "useful"
source_nodes: ["MarketplaceContainerPanel", "marketplace-browser.tsx", "crate-drop-preview.tsx"]
---

# Q: in market, for crates, remove the Container price square. Keep the amount selector, and the 2 buttons stacked on eachother. Widen the modal if needed, when expanding possible drops

## Answer

Expanded from original query via graph vocabulary: marketplace, crate, purchase, container, price, quantity, drops, preview, actions, modal. MarketplaceContainerPanel in components/economy/marketplace-browser.tsx owns the Container price HUD, amount selector, purchase and possible-drops buttons. The focused change removes only market-price-hud from crate modals, makes market-container-purchase-layout a compact single-column control area, stacks market-container-purchase-actions vertically, and keeps has-drop-odds on the modal so expanded drops use the existing 1280px wide frame while collapsed content remains constrained.

## Outcome

- Signal: useful

## Source Nodes

- MarketplaceContainerPanel
- marketplace-browser.tsx
- crate-drop-preview.tsx