import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  ECONOMY_SELLBACK_MINIMUM_TOKENS,
  ECONOMY_SELLBACK_PERCENT,
} from "../economy/sellback.ts";

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

test("native inspect commands are available only for valid CS2 weapon finishes", async () => {
  const { nativeInspectCommand } = await import("./native-inspect.ts");
  const skin = { itemType: "skin", definitionIndex: 7, paintkit: 1,
    floatValue: 0.123456, seed: 441, stattrak: true, stattrakCount: 73,
    nametag: "TAPPED", raw: { attributes: {}, catalogue: { metadata: {} }, stickers: [] } };
  assert.match(nativeInspectCommand(skin)!, /^csgo_econ_action_preview [0-9A-F]{40,}$/);
  assert.match(nativeInspectCommand({ ...skin, floatValue: 0.125, seed: 42,
    stattrak: false, stattrakCount: 0, nametag: null })!, /^csgo_econ_action_preview [0-9A-F]{16,}$/);
  assert.equal(nativeInspectCommand({ ...skin, itemType: "crate" }), null);
  assert.equal(nativeInspectCommand({ ...skin, floatValue: null }), null);
  assert.equal(nativeInspectCommand({ ...skin, seed: 1001 }), null);
});

test("inventory detail exposes native inspect without slowing inventory grid serialization", async () => {
  const { createPanelReader } = await import("./reads.ts");
  const { serializeItem } = await import("./serialization.ts");
  const item = { id: "owned", ownerSteamId: "76561198000000001", catalogueId: 7,
    itemType: "skin", displayName: "AK-47 | TAPPED", rarityRank: 4,
    definitionIndex: 7, paintkit: 1, floatValue: 0.125, seed: 42,
    stattrak: false, stattrakCount: 0, nametag: null, state: "available",
    saleLocked: false, tradable: true, equippedSlotKeys: [],
    marketPriceTokens: null, attributes: {}, stickers: [],
    catalogue: { metadata: {} } };
  assert.equal("inspectCommand" in serializeItem(item as never), false);
  const reader = createPanelReader({ getPlayerEconomyInventoryItem: async () => item } as never);
  const detail = await reader.run("inventory.detail", { itemId: "owned" },
    { actorSteamId: item.ownerSteamId } as never) as Record<string, unknown>;
  assert.match(String(detail.inspectCommand), /^csgo_econ_action_preview [0-9A-F]{16,}$/);
});

test("panel sell preview reads the authoritative payout before confirming a sale", async () => {
  const { createPanelReader } = await import("./reads.ts");
  const actorSteamId = "76561198000000001";
  const reader = createPanelReader({
    quoteInventorySaleSelection: async ({ steamId, itemIds }: { steamId: string; itemIds: string[] }) => {
      assert.equal(steamId, actorSteamId);
      assert.deepEqual(itemIds, ["owned"]);
      return { payoutTokens: 600, skippedItemIds: [], quotedAt: "2026-09-30T00:00:00Z" };
    },
  } as never);
  assert.deepEqual(await reader.run("inventory.sell-quote", { itemIds: ["owned"] }, { actorSteamId } as never),
    { payoutTokens: "600", skippedItemIds: [], quotedAt: "2026-09-30T00:00:00Z" });
});

test("sell preview prices the exact float and pattern with the sale payout policy", async () => {
  const { createInventorySaleService } = await import("../economy/sell-service.ts");
  const item = {
    id: "owned", catalogueId: 7, itemType: "skin", displayName: "AK-47 | Finish",
    state: "available", saleLocked: false, tradable: true, stattrak: false, stickers: [],
    floatValue: 0.012345, seed: 661, source: {},
    catalogue: { metadata: { minFloat: 0, maxFloat: 0.08 }, marketHashName: "AK-47 | Finish", price: null },
  };
  const service = createInventorySaleService({
    getPlayerEconomyInventoryItems: async () => [item],
    getCachedMarketplaceVariantFallbacks: async () => [null],
    getMarketplacePriceQuotes: async (inputs: unknown[]) => {
      assert.equal(inputs.length, 1);
      assert.deepEqual({ floatValue: (inputs[0] as typeof item).floatValue, seed: (inputs[0] as typeof item).seed },
        { floatValue: 0.012345, seed: 661 });
      assert.equal((inputs[0] as { exactPatternQuote: boolean }).exactPatternQuote, true);
      return [{ eurCents: 1000, source: "test", sourceReference: "test", floatValue: 0.012345, seed: 661 }];
    },
    cacheMarketplaceVariantQuotes: async () => {},
  } as never);
  const result = await service.quote({ steamId: "76561198000000001", itemIds: ["owned"] });
  assert.equal(
    result.payoutTokens,
    Math.max(ECONOMY_SELLBACK_MINIMUM_TOKENS, Math.floor((1_000 * ECONOMY_SELLBACK_PERCENT) / 100)),
  );
  assert.deepEqual(result.skippedItemIds, []);
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

test("loadout slots include the equipped item artwork and inspect fields", async () => {
  const { serializeLoadout } = await import("./serialization.ts");
  const result = serializeLoadout([{ slotType: "weapon", team: "CT", definitionIndex: 7,
    slotKey: "CT:weapon:7", itemId: "item-1", item: { id: "item-1", catalogueId: 23,
      itemType: "skin", displayName: "TAPPED AK", imageUrl: "/images/economy/ak.png",
      rarityRank: 5, definitionIndex: 7, paintkit: 12, floatValue: 0.123, seed: 88,
      stattrak: true, stattrakCount: 14, nametag: "Mine", attributes: {} } }] as never);
  assert.deepEqual(result.slots[0].item, {
    id: "item-1", catalogueId: 23, itemType: "skin", displayName: "TAPPED AK",
    imageUrl: "/images/economy/ak.png", rarityRank: 5, definitionIndex: 7,
    paintkit: 12, floatValue: 0.123, seed: 88, stattrak: true,
    stattrakCount: 14, nametag: "Mine",
  });
});

test("trade serialization carries a bounded partner name and item previews", async () => {
  const { serializeTrade } = await import("./serialization.ts");
  const preview = { catalogueId: 9, itemType: "skin", displayName: "Custom AK",
    imageUrl: "/images/economy/ak.png", rarityRank: 4, definitionIndex: 7,
    paintkit: 1, floatValue: 0.2, seed: 6, stattrak: false, stattrakCount: 0,
    nametag: null };
  const trade = { id: "trade-1", creatorSteamId: "76561198000000001",
    counterpartySteamId: "76561198000000002", direction: "outgoing", status: "pending",
    offered: { steamId: "76561198000000001", tokens: 0, items: [{ itemId: "item-1", item: preview }] },
    requested: { steamId: "76561198000000002", tokens: 0, items: [] },
    expiresAt: null, updatedAt: "2026-09-27T00:00:00.000Z" };
  const result = serializeTrade(trade as never, "Other Player");
  assert.equal(result.partnerDisplayName, "Other Player");
  assert.equal(result.offered.items[0]?.imageUrl, "/images/economy/ak.png");
});

test("private trade inventory exposes neither items nor total", async () => {
  const { createPanelReader } = await import("./reads.ts");
  const reader = createPanelReader({
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

test("panel reads use the authenticated request's storage without an extra readiness query", async () => {
  const { createPanelReader } = await import("./reads.ts");
  const reader = createPanelReader({
    getTokenWallet: async () => ({ steamId: "76561198000000001", balance: 7, lifetimeEarned: 8, lifetimeSpent: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
  });
  assert.deepEqual(await reader.run("wallet.read", {}, {
    actorSteamId: "76561198000000001",
  } as never), { balance: "7", lifetimeEarned: "8", lifetimeSpent: "1" });
});

test("read module routing keeps unrelated economy modules off simple requests", async () => {
  const { requiredPanelReadModule } = await import("./reads.ts");
  assert.equal(requiredPanelReadModule("wallet.read"), null);
  assert.equal(requiredPanelReadModule("trades.read"), null);
  assert.equal(requiredPanelReadModule("inventory.read"), "inventory");
  assert.equal(requiredPanelReadModule("cases.read"), "inventory");
  assert.equal(requiredPanelReadModule("market.read"), null);
  assert.equal(requiredPanelReadModule("market.quote"), "market");
  assert.equal(requiredPanelReadModule("benefits.vip-quote"), "vip");
});

test("inventory page returns the wallet in the same read and skips grid price enrichment", async () => {
  const { createPanelReader } = await import("./reads.ts");
  const calls: unknown[] = [];
  const reader = createPanelReader({
    getTokenWallet: async () => ({ balance: 7, lifetimeEarned: 8, lifetimeSpent: 1 }),
    getPlayerEconomyInventoryPage: async (_actor: string, filter: Record<string, unknown>, _timing: unknown, options: { quotePrices?: boolean }) => {
      calls.push({ filter, options });
      return { items: [], total: 0, page: 1, pageSize: 12 };
    },
  } as never);
  const result = await reader.run("inventory.read", { page: 1, pageSize: 12, includeWallet: true }, {
    actorSteamId: "76561198000000001",
  } as never) as Record<string, unknown>;
  assert.deepEqual(result.wallet, { balance: "7", lifetimeEarned: "8", lifetimeSpent: "1" });
  assert.deepEqual(result.items, []);
  assert.deepEqual(calls, [{ filter: { page: 1, pageSize: 12, itemTypes: undefined, sort: undefined }, options: { quotePrices: false } }]);
});

test("cases and market pages can return the wallet without a second request", async () => {
  const { createPanelReader } = await import("./reads.ts");
  const reader = createPanelReader({
    getTokenWallet: async () => ({ balance: 5, lifetimeEarned: 5, lifetimeSpent: 0 }),
    getPlayerEconomyInventoryPage: async () => ({ items: [], total: 0, page: 1, pageSize: 12 }),
    getMarketplaceCatalogue: async () => ({ items: [], total: 0, page: 1, pageSize: 12 }),
  } as never);
  const principal = { actorSteamId: "76561198000000001" } as never;
  for (const operation of ["cases.read", "market.read"] as const) {
    const result = await reader.run(operation, { page: 1, pageSize: 12, includeWallet: true }, principal) as Record<string, unknown>;
    assert.deepEqual(result.wallet, { balance: "5", lifetimeEarned: "5", lifetimeSpent: "0" });
    assert.deepEqual(result.items, []);
  }
});

test("offline partner cannot be queried or selected", async () => {
  const { createPanelReader } = await import("./reads.ts");
  const reader = createPanelReader({});
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
