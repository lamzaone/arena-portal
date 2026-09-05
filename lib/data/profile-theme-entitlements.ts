import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { rankThemes } from "@/lib/themes/ranks";

export type ProfileThemeEntitlementCandidate = {
  steamId: string;
  itemId: string;
  themeKey: string;
};

type RankThemeEntitlementRow = RowDataPacket & {
  item_id: string;
  steam_id: string;
  theme_key: string;
  tradable: number | boolean;
  reward_id: number | string | null;
  award_steam_id: string | null;
  entitlement_active: number | boolean | null;
  group_id: number | string | null;
  trade_policy: string | null;
  reward_enabled: number | boolean | null;
  group_enabled: number | boolean | null;
  group_source_type: string | null;
  group_external_key: string | null;
};

function isNativeFounderReward(row: RankThemeEntitlementRow) {
  return row.group_source_type === "admins_core" &&
    row.group_external_key?.trim().toLocaleLowerCase("en-US") === "founder";
}

/**
 * Available inventory proves ownership; a membership-bound reward also needs
 * its live membership. Founder is verified through native Admins.Core; other
 * groups use Arena authority. This read never reconciles or restores inventory.
 * Reward associations are configured by staff: a theme name is not a rank
 * permission, and direct/permanent inventory grants remain usable.
 *
 * Query only rank candidates, in batches, without caching across requests.
 * Missing Arena authority fails closed for bound rewards, without revoking
 * anything or affecting independent themes and permanent grants.
 */
export async function getAuthorizedProfileThemeItemIds(
  executor: Pick<Pool, "query"> | Pick<PoolConnection, "query">,
  candidates: readonly ProfileThemeEntitlementCandidate[],
): Promise<Set<string>> {
  const authorized = new Set<string>();
  const rankCandidates = candidates.filter((candidate) => {
    if (Object.hasOwn(rankThemes, candidate.themeKey)) return true;
    authorized.add(candidate.itemId);
    return false;
  });
  if (!rankCandidates.length) return authorized;

  try {
    const requested = new Map(rankCandidates.map((candidate) => [
      `${candidate.steamId}\0${candidate.itemId}`, candidate.themeKey,
    ]));
    const itemIds = [...new Set(rankCandidates.map((candidate) => candidate.itemId))];
    const boundRows: RankThemeEntitlementRow[] = [];
    for (let offset = 0; offset < itemIds.length; offset += 500) {
      const batch = itemIds.slice(offset, offset + 500);
      const [rows] = await executor.query<RankThemeEntitlementRow[]>(
        "SELECT item.id AS item_id, item.owner_steam_id AS steam_id, theme.theme_key, item.tradable, " +
          "award.reward_id, award.steam_id AS award_steam_id, award.entitlement_active, " +
          "reward.group_id, reward.trade_policy, reward.enabled AS reward_enabled, identity_group.enabled AS group_enabled, " +
          "identity_group.source_type AS group_source_type, identity_group.external_key AS group_external_key " +
          "FROM portal_inventory_items AS item " +
          "INNER JOIN portal_economy_catalogue AS catalogue ON catalogue.id = item.catalogue_id AND catalogue.enabled = TRUE " +
          "INNER JOIN portal_profile_themes AS theme ON theme.catalogue_id = item.catalogue_id AND theme.enabled = TRUE " +
          "LEFT JOIN portal_identity_group_reward_awards AS award ON award.item_id = item.id " +
          "LEFT JOIN portal_identity_group_rewards AS reward ON reward.id = award.reward_id AND reward.catalogue_id = item.catalogue_id " +
          "LEFT JOIN portal_identity_groups AS identity_group ON identity_group.id = reward.group_id " +
          "WHERE item.item_type = 'profile_theme' AND item.state = 'available' " +
          `AND item.id IN (${batch.map(() => "?").join(", ")})`,
        batch,
      );
      for (const row of rows) {
        if (requested.get(`${row.steam_id}\0${row.item_id}`) !== row.theme_key) continue;
        if (row.reward_id === null || row.trade_policy === "tradable") {
          authorized.add(row.item_id);
        } else if (
          row.trade_policy === "account_bound" && !row.tradable &&
          row.award_steam_id === row.steam_id && row.entitlement_active &&
          row.reward_enabled && row.group_enabled
        ) {
          boundRows.push(row);
        }
      }
    }
    const arenaRows = boundRows.filter((row) => !isNativeFounderReward(row));
    if (arenaRows.length) {
      const { getArenaAuthorityMembershipsForPlayers } = await import("@/lib/data/identity-groups");
      const authority = await getArenaAuthorityMembershipsForPlayers(
        [...new Set(arenaRows.map((row) => row.steam_id))],
      );
      if (authority.available) {
        for (const row of arenaRows) {
          if (authority.membershipsBySteamId.get(row.steam_id)?.has(Number(row.group_id))) {
            authorized.add(row.item_id);
          }
        }
      }
    }
    const founderRows = boundRows.filter(isNativeFounderReward);
    if (founderRows.length) {
      // Reuse the same scoped native membership reader as reward backfills.
      // Founder is intentionally excluded from the Arena projection: neither
      // an Arena row nor the displayed badge can prove this membership.
      const { getExternalIdentityGroupMemberSteamIds } = await import("@/lib/data/portal-repository");
      const founders = new Set(await getExternalIdentityGroupMemberSteamIds({
        sourceType: "admins_core", externalKey: "Founder",
      }));
      for (const row of founderRows) {
        if (founders.has(row.steam_id)) authorized.add(row.item_id);
      }
    }
  } catch {
    // A read failure is not proof that a membership has been removed. Hide
    // unchecked items for this response and let the normal lifecycle retry.
  }
  return authorized;
}
