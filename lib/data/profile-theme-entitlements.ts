import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { isOwnedPortalThemeKey } from "@/lib/themes/registry";

export type ProfileThemeEntitlementCandidate = {
  steamId: string;
  itemId: string;
  themeKey: string;
};

type ProfileThemeInventoryRow = RowDataPacket & {
  item_id: string;
  steam_id: string;
  theme_key: string;
};

/**
 * Theme selection follows available inventory, including membership rewards.
 * Live membership reads must not hide a saved selection while the player still
 * owns its item. The reward lifecycle revokes inventory when membership ends;
 * that inventory change removes theme access on the next read.
 * This check never grants, revokes, restores, or changes the selected theme.
 */
export async function getAuthorizedProfileThemeItemIds(
  executor: Pick<Pool, "query"> | Pick<PoolConnection, "query">,
  candidates: readonly ProfileThemeEntitlementCandidate[],
): Promise<Set<string>> {
  const authorized = new Set<string>();
  const trustedCandidates = candidates.filter((candidate) =>
    isOwnedPortalThemeKey(candidate.themeKey),
  );
  if (!trustedCandidates.length) return authorized;

  const requested = new Map(trustedCandidates.map((candidate) => [
    `${candidate.steamId}\0${candidate.itemId}`, candidate.themeKey,
  ]));
  const itemIds = [...new Set(trustedCandidates.map((candidate) => candidate.itemId))];
  for (let offset = 0; offset < itemIds.length; offset += 500) {
    const batch = itemIds.slice(offset, offset + 500);
    const [rows] = await executor.query<ProfileThemeInventoryRow[]>(
      "SELECT item.id AS item_id, item.owner_steam_id AS steam_id, theme.theme_key " +
        "FROM portal_inventory_items AS item " +
        "INNER JOIN portal_profile_themes AS theme ON theme.catalogue_id = item.catalogue_id AND theme.enabled = TRUE " +
        "WHERE item.item_type = 'profile_theme' AND item.state = 'available' " +
        `AND item.id IN (${batch.map(() => "?").join(", ")})`,
      batch,
    );
    for (const row of rows) {
      if (requested.get(`${row.steam_id}\0${row.item_id}`) === row.theme_key) {
        authorized.add(row.item_id);
      }
    }
  }
  // Let inventory storage failures reach the caller's read fallback or write
  // rollback, rather than reporting a confirmed loss of theme ownership.
  return authorized;
}
