import { resolve } from "node:path";

type ThumbnailEnvironment = Record<string, string | undefined>;

export function thumbnailImageCacheDirectory(environment: ThumbnailEnvironment = process.env) {
  return resolve(environment.WEAPON_THUMBNAIL_CACHE_DIR
    || (environment.ARENA_HOSTING_ROOT ? `${environment.ARENA_HOSTING_ROOT}/cache/weapon-thumbnails` : ".cache/weapon-thumbnails"));
}

export function thumbnailAssetCacheDirectory(environment: ThumbnailEnvironment = process.env) {
  return resolve(environment.WEAPON_THUMBNAIL_ASSET_CACHE_DIR
    || (environment.ARENA_HOSTING_ROOT ? `${environment.ARENA_HOSTING_ROOT}/cache/weapon-thumbnail-assets` : ".cache/weapon-thumbnail-assets"));
}

export function thumbnailModelProfileDirectory(directory: string, definitionIndex: number) {
  // The full set of weapon resources exceeds one Chromium cache. Stable
  // buckets retain each weapon's finishes together without unbounded profiles.
  return resolve(directory, `models-${definitionIndex % 8}`);
}
