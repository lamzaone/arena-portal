import { join } from "node:path";
import { createThumbnailCache } from "./thumbnail-cache.ts";
import { createWeaponThumbnailRenderer } from "./thumbnail-renderer.ts";
import { thumbnailBrowserOptions } from "./thumbnail-browser.ts";
import { thumbnailAssetCacheDirectory, thumbnailImageCacheDirectory, thumbnailModelProfileDirectory } from "./thumbnail-paths.ts";

const globals = globalThis as typeof globalThis & { __weaponThumbnails?: ReturnType<typeof createThumbnailCache> };
export function weaponThumbnailCache() {
  if (!globals.__weaponThumbnails) {
    // GPU hosts can draw two different model buckets concurrently. Each lane
    // owns disjoint even/odd buckets, so persistent profiles never overlap.
    const renderLanes = thumbnailBrowserOptions().args?.includes("--enable-gpu") ? 2 : 1;
    const laneForItem = (item: { defindex: number }) => item.defindex % renderLanes;
    const renderers=Array.from({ length: renderLanes }, () => createWeaponThumbnailRenderer({ assetCacheDirectory: join(thumbnailAssetCacheDirectory(), "server") }));
    globals.__weaponThumbnails=createThumbnailCache({
      directory:thumbnailImageCacheDirectory(),
      render:item => renderers[laneForItem(item)].render(item),
      renderLanes,
      laneForItem,
      groupForItem: item => thumbnailModelProfileDirectory(thumbnailAssetCacheDirectory(), item.defindex),
    });
  }
  return globals.__weaponThumbnails;
}
