import assert from "node:assert/strict";
import test from "node:test";

import { isIndividualSteamId64, uniqueIndividualSteamIds } from "./steam-id.ts";

test("individual Steam ID64 validation includes both account-range boundaries", () => {
  for (const value of [
    "76561197960265728",
    "76561200000000000",
    "76561202255233023",
  ]) {
    assert.equal(isIndividualSteamId64(value), true, value);
  }
});

test("individual Steam ID64 validation rejects out-of-range and malformed identifiers", () => {
  for (const value of [
    "76561190000000000",
    "76561197960265727",
    "76561202255233024",
    "76561210000000000",
    "7656119796026572",
    "765611979602657280",
    "7656119796026572x",
    " 76561197960265728",
    "",
  ]) {
    assert.equal(isIndividualSteamId64(value), false, value);
  }
});

test("Steam profile batching retains unique valid IDs across the full individual range", () => {
  assert.deepEqual(uniqueIndividualSteamIds([
    "76561197960265728",
    "76561200000000000",
    "76561200000000000",
    "76561190000000000",
    "not-a-steam-id",
    "76561202255233023",
  ]), [
    "76561197960265728",
    "76561200000000000",
    "76561202255233023",
  ]);
});

test("Steam profile batching remains capped at the API limit", () => {
  const ids = Array.from(
    { length: 101 },
    (_, index) => (76_561_197_960_265_728n + BigInt(index)).toString(),
  );

  assert.deepEqual(uniqueIndividualSteamIds(ids), ids.slice(0, 100));
});
