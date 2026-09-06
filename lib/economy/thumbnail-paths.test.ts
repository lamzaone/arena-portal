import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { thumbnailImageCacheDirectory, thumbnailAssetCacheDirectory, thumbnailModelProfileDirectory } from "./thumbnail-paths.ts";

test("model resources and finished images persist in separate cache directories", () => {
  assert.equal(thumbnailImageCacheDirectory({}), resolve(".cache/weapon-thumbnails"));
  assert.equal(thumbnailAssetCacheDirectory({}), resolve(".cache/weapon-thumbnail-assets"));
  const hosting = { ARENA_HOSTING_ROOT: resolve(".cache/test-hosting") };
  assert.equal(thumbnailAssetCacheDirectory(hosting), resolve(hosting.ARENA_HOSTING_ROOT, "cache/weapon-thumbnail-assets"));
  assert.equal(thumbnailImageCacheDirectory(hosting), resolve(hosting.ARENA_HOSTING_ROOT, "cache/weapon-thumbnails"));
});

test("configured cache paths override the hosting defaults independently", () => {
  const environment = { ARENA_HOSTING_ROOT: "/hosting", WEAPON_THUMBNAIL_CACHE_DIR: "image-cache", WEAPON_THUMBNAIL_ASSET_CACHE_DIR: "model-cache" };
  assert.equal(thumbnailAssetCacheDirectory(environment), resolve("model-cache"));
  assert.equal(thumbnailImageCacheDirectory(environment), resolve("image-cache"));
});

test("model profiles use eight stable buckets without splitting one weapon's finishes or seeds", () => {
  const directories = new Set(Array.from({ length: 600 }, (_, index) => thumbnailModelProfileDirectory("models", index + 1)));
  assert.equal(directories.size, 8);
  assert.equal(thumbnailModelProfileDirectory("models", 7), resolve("models/models-7"));
  assert.equal(thumbnailModelProfileDirectory("models", 15), thumbnailModelProfileDirectory("models", 7));
});
