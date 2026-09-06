import assert from "node:assert/strict";
import test from "node:test";
import { parseWeaponCustomization, authorizeStickerPlacement, authorizeCharmPlacement } from "./weapon-customization.ts";

const sticker = { slot: 2, id: 37, offsetX: 0.2, offsetY: -0.4, rotation: 90, wear: 0.1 };
test("accepts authored placements outside the material slider's +/-0.5 range", () => {
  const result = parseWeaponCustomization({ stickers: [{ ...sticker, offsetX: 0.85 }], charm: { id: 5, offsetX: 1, offsetY: 2, offsetZ: 3 } });
  assert.equal(result.stickers[0].offsetX, 0.85);
  assert.equal(result.charm?.offsetZ, 3);
});
test("rejects duplicate slots, reused inventory items, bad numbers and unsupported sixth-slot edits", () => {
  for (const stickers of [[sticker, sticker], [{ ...sticker, slot: 5 }], [{ ...sticker, wear: NaN }], [{ ...sticker, rotation: Infinity }], [{ ...sticker, offsetX: 9999 }], [{ ...sticker, stickerItemId: "owned" }, { ...sticker, slot: 3, stickerItemId: "owned" }]]) {
    assert.throws(() => parseWeaponCustomization({ stickers }));
  }
});
test("authorizes editing an existing sticker but rejects definition swaps and occupied-slot additions", () => {
  assert.doesNotThrow(() => authorizeStickerPlacement(sticker, { definitionIndex: 37 }, null));
  assert.throws(() => authorizeStickerPlacement({ ...sticker, id: 99 }, { definitionIndex: 37 }, null));
  assert.throws(() => authorizeStickerPlacement({ ...sticker, stickerItemId: "new" }, { definitionIndex: 37 }, { definitionIndex: 37 }));
  assert.throws(() => authorizeStickerPlacement(sticker, null, null));
});
test("new stickers require a matching owned item resolved by the repository", () => {
  assert.doesNotThrow(() => authorizeStickerPlacement({ ...sticker, stickerItemId: "owned" }, null, { definitionIndex: 37 }));
  assert.throws(() => authorizeStickerPlacement({ ...sticker, stickerItemId: "owned" }, null, { definitionIndex: 99 }));
});
test("charm reposition cannot create or change a charm without an owned addition", () => {
  const charm = { id: 5, offsetX: 0, offsetY: 0, offsetZ: 0 };
  assert.doesNotThrow(() => authorizeCharmPlacement(charm, { id: 5 }, null));
  assert.throws(() => authorizeCharmPlacement(charm, { id: 6 }, null));
  assert.throws(() => authorizeCharmPlacement(charm, null, null));
  assert.doesNotThrow(() => authorizeCharmPlacement({ ...charm, charmItemId: "owned" }, null, { definitionIndex: 5 }));
});
