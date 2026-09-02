---
type: "query"
date: "2026-09-02T16:40:35.877929+00:00"
question: "Items bought for a discount should be sold relative to their buying price, then audit the full site UI/UX."
contributor: "graphify"
outcome: "useful"
source_nodes: ["purchaseEconomyItem()", "sellEconomyItem()", "sellEconomyItems()", "economySellbackPayoutTokens()"]
---

# Q: Items bought for a discount should be sold relative to their buying price, then audit the full site UI/UX.

## Answer

Expanded from original query via graph vocabulary: discount, purchase, price, inventory, sale, sellback, source, payout, market, economy, crate, token. The graph traced purchaseEconomyItem to per-item source.priceTokens and sellEconomyItem/sellEconomyItems to current marketPriceTokens before economySellbackPayoutTokens. Root cause: the immutable paid unit price is recorded but not used by either sell path or Inventory estimates. Recommended invariant: for marketplace purchases, use min(current market value, recorded unit purchase price) as the existing 30 percent sellback basis; fail closed when a marketplace purchase lacks a trustworthy recorded price. Grants and crate drops continue to use current market value.

## Outcome

- Signal: useful

## Source Nodes

- purchaseEconomyItem()
- sellEconomyItem()
- sellEconomyItems()
- economySellbackPayoutTokens()