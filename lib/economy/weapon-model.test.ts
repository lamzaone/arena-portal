import assert from "node:assert/strict";
import test from "node:test";
import { nativeStickerPlacement, viewerStickerPlacement, weaponLegacyModel } from "./weapon-model.ts";

test("uses the finish's real mesh instead of defaulting every new drop to HD", () => {
  assert.equal(weaponLegacyModel(7, 44), true);
  assert.equal(weaponLegacyModel(7, 1449), false);
  assert.equal(weaponLegacyModel(7, 99999, true), true);
});
test("fifth AK sticker borrows a real anchor and round-trips for both model variants", () => {
  for (const paint of [44, 1449]) {
    const native = nativeStickerPlacement(7, paint, 4, 0.21, -0.13);
    assert.equal(native.schema, 1);
    assert.notEqual(native.offsetX, 0.21);
    const viewer = viewerStickerPlacement(7, paint, 4, native.schema, native.offsetX, native.offsetY);
    assert.ok(Math.abs(viewer.offsetX - 0.21) < 0.000001);
    assert.ok(Math.abs(viewer.offsetY + 0.13) < 0.000001);
  }
});
test("other slots and untouched default-schema fifth stickers keep their offsets", () => {
  assert.equal(nativeStickerPlacement(7, 44, 2, 0, 0).schema, 0);
  assert.deepEqual(viewerStickerPlacement(7, 44, 4, 0, 0.21, -0.13), { offsetX: 0.21, offsetY: -0.13 });
});
