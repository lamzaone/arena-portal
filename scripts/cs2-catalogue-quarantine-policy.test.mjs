import assert from "node:assert/strict";
import test from "node:test";
import { planCatalogueQuarantine } from "./cs2-catalogue-quarantine-policy.mjs";

test("quarantines unpriced custom rows and drops while preserving real skins and owned items", () => {
  const catalogue = [
    { id: 1, item_type: "skin", definition_index: 9, paintkit: 250, enabled: 1 },
    { id: 2, item_type: "skin", definition_index: 7, paintkit: 44, enabled: 1 },
    { id: 3, item_type: "skin", definition_index: 4, paintkit: 44, enabled: 0 },
    { id: 4, item_type: "crate", definition_index: null, paintkit: null, enabled: 1 },
  ];
  const entries = [{ id: 10, catalogue_id: 1, enabled: 1 }, { id: 11, catalogue_id: 2, enabled: 1 }, { id: 12, catalogue_id: 3, enabled: 1 }];
  const owned = [{ catalogue_id: 1, item_count: 7 }, { catalogue_id: 2, item_count: 9 }];
  const original = structuredClone({ catalogue, entries, owned });
  const plan = planCatalogueQuarantine(catalogue, entries, owned);
  assert.deepEqual(plan.catalogue.map((row) => row.id), [1]);
  assert.deepEqual(plan.entries.map((row) => row.id), [10, 12]);
  assert.deepEqual(plan.ownedInventory, [{ catalogue_id: 1, item_count: 7 }]);
  assert.equal(plan.validWithoutCataloguePrice, 2);
  assert.deepEqual({ catalogue, entries, owned }, original);
});

test("priced custom finishes stay enabled and Broken Fang rows are repaired instead of quarantined", () => {
  const plan = planCatalogueQuarantine([
    { id: 1, item_type: "skin", definition_index: 4, paintkit: 44, enabled: 1, price_source: "staff-last-known", source_reference: "staff-panel", market_price_eur_cents: 100 },
    { id: 2, item_type: "skin", definition_index: 4725, paintkit: 10087, enabled: 1 },
  ], [{ id: 10, catalogue_id: 1, enabled: 1 }, { id: 11, catalogue_id: 2, enabled: 1 }], []);
  assert.deepEqual(plan.catalogue, []);
  assert.deepEqual(plan.entries, []);
  assert.deepEqual(plan.typeCorrections.map((row) => row.id), [2]);
});
