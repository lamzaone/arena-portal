---
type: "query"
date: "2026-09-02T23:21:16.129525+00:00"
question: "How does Inventory open more than ten selected crates while retaining one selection owner?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["InventoryManager", "useInventoryCrateOpening", "InventoryBulkCrateOpeningResults", "crateOnlySelection", "runSequentialCrateOpeningGroups"]
---

# Q: How does Inventory open more than ten selected crates while retaining one selection owner?

## Answer

InventoryManager is the sole selection owner. crateOnlySelection admits only owned available catalogued crates and capsules, up to 50. useInventoryCrateOpening partitions the ordered IDs into sequential groups of at most 10 with a stable idempotency key per group, displays aggregate progress and retained results, and retries from the failed group without repeating completed groups. Single opening, collapsed optional drops, locking, and selling remain in InventoryBulkCrateOpeningResults and InventorySingleCrateOpening.

## Outcome

- Signal: useful

## Source Nodes

- InventoryManager
- useInventoryCrateOpening
- InventoryBulkCrateOpeningResults
- crateOnlySelection
- runSequentialCrateOpeningGroups