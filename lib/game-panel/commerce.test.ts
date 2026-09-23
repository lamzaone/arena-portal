import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only")
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    const path = specifier.startsWith("@/")
      ? resolve(specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL?.startsWith("file:")
        ? fileURLToPath(new URL(specifier, context.parentURL))
        : null;
    const file =
      path &&
      (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`]).find(existsSync);
    return file
      ? { url: pathToFileURL(file).href, shortCircuit: true }
      : next(specifier, context);
  },
});

test("Token projection rejects unsafe numbers and excludes identity fields", async () => {
  const { serializeWallet } = await import("./serialization.ts");
  assert.deepEqual(
    serializeWallet({
      balance: 50,
      lifetimeEarned: 70,
      lifetimeSpent: 20,
    } as never),
    { balance: "50", lifetimeEarned: "70", lifetimeSpent: "20" },
  );
  assert.throws(() =>
    serializeWallet({
      balance: Number.MAX_SAFE_INTEGER + 1,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    } as never),
  );
});

test("market capabilities respect authoritative StatTrak metadata", async () => {
  const { serializeProduct } = await import("./serialization.ts");
  const item = { id: 1, itemType: "skin", displayName: "Finish", imageUrl: null, rarityRank: 3,
    definitionIndex: 7, paintkit: 1, minFloat: 0, maxFloat: 1, displayPriceTokens: 50, metadata: {} };
  assert.equal(serializeProduct(item as never).supportsStattrak, true);
  assert.equal(serializeProduct({ ...item, metadata: { supportsStattrak: false } } as never).supportsStattrak, false);
  assert.equal(serializeProduct({ ...item, itemType: "knife", metadata: { supportsStattrak: false } } as never).supportsStattrak, false);
  assert.equal(serializeProduct({ ...item, itemType: "glove", metadata: { supportsStattrak: true } } as never).supportsStattrak, false);
});

test("item capabilities project portal equip targets without raw metadata", async () => {
  const { serializeItem } = await import("./serialization.ts");
  const item = { id: "item", catalogueId: 1, itemType: "skin", displayName: "Finish", rarityRank: 3,
    definitionIndex: 7, paintkit: 1, floatValue: 0.1, seed: 1, stattrak: false, stattrakCount: 0,
    nametag: null, state: "available", saleLocked: false, tradable: true, equippedSlotKeys: [],
    marketPriceTokens: 50, attributes: {}, catalogue: { metadata: {} } };
  const targets = (value: object) => (serializeItem(value as never).capabilities as unknown as { equipTargets?: string[] }).equipTargets;
  assert.deepEqual(targets(item), ["T", "CT", "both"]);
  assert.deepEqual(targets({ ...item, itemType: "agent", catalogue: { metadata: { teams: ["CT"] } } }), ["CT"]);
  assert.deepEqual(targets({ ...item, itemType: "agent" }), ["T", "CT"]);
  assert.deepEqual(targets({ ...item, itemType: "music_kit" }), ["global"]);
  assert.deepEqual(targets({ ...item, itemType: "crate" }), []);
  assert.equal("raw" in serializeItem(item as never), false);
});

test("private trade inventory exposes neither items nor total", async () => {
  const { createPanelReader } = await import("./reads.ts");
  const reader = createPanelReader({
    requireStorage: async () => {},
    getTradePartnerInventory: async () => ({
      visibility: "private",
      items: [],
      total: 42,
      page: 1,
      pageSize: 24,
    }),
  });
  const result = (await reader.run(
    "trades.inventory",
    {
      partnerSteamId: "76561198000000002",
      onlineSteamIds: ["76561198000000002"],
    },
    { actorSteamId: "76561198000000001" } as never,
  )) as Record<string, unknown>;
  assert.deepEqual(result.items, []);
  assert.equal("total" in result, false);
});

test("offline partner cannot be queried or selected", async () => {
  const { createPanelReader } = await import("./reads.ts");
  const reader = createPanelReader({ requireStorage: async () => {} });
  await assert.rejects(
    reader.run(
      "trades.inventory",
      { partnerSteamId: "76561198000000002", onlineSteamIds: [] },
      { actorSteamId: "76561198000000001" } as never,
    ),
    { code: "partner_offline" },
  );
});

test("music equip preserves global slot and authoritative actor", async () => {
  const { createPanelMutator } = await import("./mutations.ts");
  const calls: unknown[] = [];
  const mutator = createPanelMutator({
    equipEconomyItem: async (input) => {
      calls.push(input);
      return { itemId: input.itemId, slots: [] };
    },
  });
  const result = await mutator.run(
    "loadout.equip",
    {
      itemId: "10000000-0000-4000-8000-000000000001",
      slots: [{ slotType: "music_kit" }],
    },
    {
      principal: { actorSteamId: "76561198000000001" },
      economyKey: "gp1_test",
    } as never,
  );
  assert.deepEqual(calls, [
    {
      steamId: "76561198000000001",
      itemId: "10000000-0000-4000-8000-000000000001",
      slots: [{ slotType: "music_kit" }],
      idempotencyKey: "gp1_test",
    },
  ]);
  assert.deepEqual(result, {
    itemId: "10000000-0000-4000-8000-000000000001",
    loadout: { slots: [] },
  });
});
