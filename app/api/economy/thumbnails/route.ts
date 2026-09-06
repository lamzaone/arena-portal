import { getSessionIdentity } from "@/lib/auth/session-identity";
import { thumbnailStatusResponse } from "@/lib/economy/thumbnail-http";
import { weaponThumbnailCache } from "@/lib/economy/thumbnail-service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return thumbnailStatusResponse(request, {
    session: getSessionIdentity,
    request: (item, owner) => weaponThumbnailCache().request(item, owner),
    lookup: item => weaponThumbnailCache().lookup(item),
    waitForAny: (keys, signal, milliseconds) => {
      const cache = weaponThumbnailCache();
      // A development HMR cycle can retain the previous cache singleton until
      // restart. Keep its old polling pace instead of spinning on zero retries.
      return cache.waitForAny?.(keys, signal, milliseconds) ?? new Promise(resolve => setTimeout(resolve, 500));
    },
  });
}
