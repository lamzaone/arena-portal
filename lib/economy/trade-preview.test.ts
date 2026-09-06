import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { tradeWeaponPreviewFields } from "./trade-preview.ts";
import { weaponPreviewItem } from "./weapon-preview.ts";

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return { url: pathToFileURL(resolve(specifier.slice(2) + ".ts")).href, shortCircuit: true };
  return next(specifier, context);
} });
const { economyTrades } = await import("../../components/economy/economy-view-model.ts");

const owned = {
  id: "owned-weapon", itemType: "skin", displayName: "AK-47 | Case Hardened", definitionIndex: 7,
  paintkit: 44, floatValue: .123456, seed: 661, stattrak: true, stattrakCount: 0, nametag: "Named weapon",
  ownerSteamId: "private-owner", source: { staffReason: "private-source" },
  catalogue: { metadata: { useLegacyModel: true, privateNote: "private-catalogue" } },
  attributes: { privateNote: "private-attributes", keychain: { id: 5, seed: 123, offsetX: 1, offsetY: 2, offsetZ: 3, privateNote: "private-charm" } },
  stickers: [{ slot: 3, definitionIndex: 37, stickerItemId: "private-sticker-id", appliedBySteamId: "private-applicator", attributes: { schema: 0, wear: .2, rotation: 90, offsetX: .12, offsetY: -.3, privateNote: "private-placement" } }],
};

test("trade visual projection retains exact finish, pattern and attachments without private inventory fields", () => {
  const visual = tradeWeaponPreviewFields(owned);
  assert.equal(visual.definitionIndex, 7);
  assert.equal(visual.paintkit, 44);
  assert.equal(visual.seed, 661);
  assert.equal(visual.attributes.useLegacyModel, true);
  assert.doesNotMatch(JSON.stringify(visual), /private|ownerSteamId|source|stickerItemId|appliedBySteamId/);
  const preview = weaponPreviewItem({ ...owned, ...visual, raw: visual });
  assert.equal(preview?.float, .123456);
  assert.equal(preview?.seed, 661);
  assert.equal(preview?.statTrak, 0);
  assert.deepEqual(preview?.stickers, [{id:37,slot:3,wear:.2,rotation:90,offsetX:.12,offsetY:-.3}]);
  assert.deepEqual(preview?.charm, { id:5,seed:123,offset:[1,2,3] });
});

test("trade visual projection cannot invent missing identity and copies only finite placement numbers", () => {
  const visual = tradeWeaponPreviewFields({ definitionIndex: null, paintkit: undefined, seed: undefined, attributes:{keychain:{id:5,offsetX:NaN,secret:"hidden"}},stickers:[null,{slot:0,definitionIndex:37,attributes:{offsetX:Infinity,wear:.2}}] });
  assert.equal(visual.definitionIndex, null);
  assert.equal(visual.paintkit, null);
  assert.equal(visual.seed, null);
  assert.equal(visual.stickers.length, 1);
  assert.deepEqual(visual.stickers[0].attributes, {wear:.2});
  assert.deepEqual(visual.attributes.keychain, {id:5});
});

test("offered and requested trade view adapters preserve render identity and sanitized attachment metadata", () => {
  const [trade] = economyTrades([{id:"trade",offered:{items:[{itemId:owned.id,item:owned}]},requested:{items:[{itemId:"other",item:{...owned,seed:321,stattrak:false,stattrakCount:99}}]}}]);
  assert.equal(weaponPreviewItem(trade.offeredItems[0])?.seed, 661);
  assert.equal(weaponPreviewItem(trade.offeredItems[0])?.statTrak, 0);
  assert.equal(weaponPreviewItem(trade.requestedItems[0])?.seed, 321);
  assert.equal(weaponPreviewItem(trade.requestedItems[0])?.statTrak, false);
  assert.equal(weaponPreviewItem(trade.offeredItems[0])?.stickers?.[0]?.id, 37);
  assert.doesNotMatch(JSON.stringify(trade.offeredItems[0].raw), /private|ownerSteamId|source|stickerItemId/);
});
