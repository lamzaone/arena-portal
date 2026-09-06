import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPortalDatabasePool } from "../data/database-pools";
import { createInventoryThumbnailPrewarmer, ownedThumbnailPrewarmEnabled } from "./thumbnail-inventory";
import { weaponThumbnailCache } from "./thumbnail-service";

const globals = globalThis as typeof globalThis & { __ownedThumbnailPrewarmer?: { runOnce: () => Promise<void> } };

/** Shared hosting runs this inside its existing Node process; no extra daemon. */
export function startOwnedThumbnailPrewarming() {
  if (!ownedThumbnailPrewarmEnabled(process.env) || globals.__ownedThumbnailPrewarmer) return;
  const pool = getPortalDatabasePool();
  if (!pool) return;
  const worker = createInventoryThumbnailPrewarmer({
    readRows: async (sql, values) => (await pool.query<RowDataPacket[]>(sql, values))[0],
    request: (item, owner, options) => weaponThumbnailCache().request(item, owner, options),
  });
  globals.__ownedThumbnailPrewarmer = worker;
  function schedule(delay: number) {
    const timer = setTimeout(() => {
      void worker.runOnce().catch(() => {
        console.warn("Owned weapon snapshot scan failed; retrying in 30 seconds.");
      }).finally(() => schedule(30000));
    }, delay);
    timer.unref?.();
  }
  // Accept HTTP requests first; cache generation never gates startup or pages.
  schedule(1000);
}
