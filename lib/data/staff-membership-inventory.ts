import "server-only";

import type { RowDataPacket } from "mysql2/promise";

import { getPortalDatabasePool } from "@/lib/data/database-pools";

export type StaffMembershipInventoryProduct = {
  name: string;
  count: number;
};

export type StaffMembershipInventorySummary = {
  available: number;
  pending: number;
  consumed: number;
  total: number;
  pendingJobs: number;
  availableProducts: StaffMembershipInventoryProduct[];
};

type MembershipInventoryRow = RowDataPacket & {
  owner_steam_id: string;
  state: string;
  display_name: string | null;
  item_count: string | number;
};

type MembershipJobRow = RowDataPacket & {
  owner_steam_id: string;
  job_count: string | number;
};

const steamIdPattern = /^7656119\d{10}$/;

function emptySummary(): StaffMembershipInventorySummary {
  return {
    available: 0,
    pending: 0,
    consumed: 0,
    total: 0,
    pendingJobs: 0,
    availableProducts: [],
  };
}

function missingTable(error: unknown) {
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146;
}

/**
 * Loads the small inventory slice that is useful while managing access. The
 * portal still owns item instances; only the resulting membership lives in
 * the arena authority database.
 */
export async function getStaffMembershipInventorySummaries(
  steamIdInputs: readonly string[],
): Promise<Record<string, StaffMembershipInventorySummary>> {
  const steamIds = [...new Set(
    steamIdInputs.map((value) => String(value).trim()).filter((value) =>
      steamIdPattern.test(value)),
  )];
  const summaries: Record<string, StaffMembershipInventorySummary> = {};
  for (const steamId of steamIds) summaries[steamId] = emptySummary();
  if (!steamIds.length) return summaries;

  const pool = getPortalDatabasePool();
  if (!pool) return summaries;
  const placeholders = steamIds.map(() => "?").join(", ");
  const [rows] = await pool.query<MembershipInventoryRow[]>(
    "SELECT item.owner_steam_id, item.state, catalogue.display_name, COUNT(*) AS item_count " +
      "FROM portal_inventory_items AS item " +
      "LEFT JOIN portal_economy_catalogue AS catalogue ON catalogue.id = item.catalogue_id " +
      "WHERE item.item_type = 'vip_membership' AND item.owner_steam_id IN (" +
      placeholders +
      ") GROUP BY item.owner_steam_id, item.state, catalogue.display_name " +
      "ORDER BY item.owner_steam_id, item.state, catalogue.display_name",
    steamIds,
  );

  for (const row of rows) {
    const steamId = String(row.owner_steam_id);
    const summary = summaries[steamId];
    if (!summary) continue;
    const count = Number(row.item_count ?? 0);
    if (!Number.isSafeInteger(count) || count < 1) continue;
    summary.total += count;
    if (row.state === "available") {
      summary.available += count;
      const name = String(row.display_name ?? "VIP membership").trim() ||
        "VIP membership";
      summary.availableProducts.push({ name, count });
    } else if (row.state === "activation_pending") {
      summary.pending += count;
    } else if (row.state === "consumed") {
      summary.consumed += count;
    }
  }

  // Migration 025 introduces durable cross-host activation jobs. Keep this
  // read compatible while the migration is staged, but surface unfinished
  // jobs as soon as the table exists.
  try {
    const [jobRows] = await pool.query<MembershipJobRow[]>(
      "SELECT owner_steam_id, COUNT(*) AS job_count " +
        "FROM portal_membership_activation_jobs " +
        "WHERE owner_steam_id IN (" +
        placeholders +
        ") AND status NOT IN ('completed', 'rejected') " +
        "GROUP BY owner_steam_id",
      steamIds,
    );
    for (const row of jobRows) {
      const summary = summaries[String(row.owner_steam_id)];
      const count = Number(row.job_count ?? 0);
      if (summary && Number.isSafeInteger(count) && count > 0) {
        summary.pendingJobs = count;
      }
    }
  } catch (error) {
    if (!missingTable(error)) throw error;
  }

  for (const summary of Object.values(summaries)) {
    summary.availableProducts.sort((left, right) =>
      left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
  }
  return summaries;
}
