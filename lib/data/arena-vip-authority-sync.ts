import "server-only";

import { createHash } from "node:crypto";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import { compareVipEntitlementPrecedence } from "@/lib/economy/vip-membership-conversion";

const steamId64Base = 76561197960265728n;

type RawVipRow = RowDataPacket & {
  account_id: string | number;
  sid: string | number;
  group_name: string;
  expires: string | number;
};

type TargetRow = RowDataPacket & {
  group_id: string | number;
  scope_id: string | number;
  vip_server_id: string | number;
  external_key: string;
  vip_family_key: string;
};

type MembershipRow = RowDataPacket & {
  membership_uuid: string;
  group_id: string | number;
  scope_id: string | number;
  starts_at: Date | string;
  expires_at: Date | string | null;
  status: "active" | "revoked" | "superseded" | "conflict";
  provenance_type: string;
  vip_family_key: string;
  rank_weight: string | number;
};

type SubscriptionRow = RowDataPacket & {
  scope_id: string | number;
  vip_family_key: string;
  group_id: string | number | null;
  membership_uuid: string | null;
  status: "active" | "ended" | "conflict";
  starts_at: Date | string | null;
  expires_at: Date | string | null;
  legacy_suppressed_until: Date | string | null;
  legacy_suppressed_permanently: string | number | boolean;
  row_version: string | number;
};

type MappedRawVipRow = {
  raw: RawVipRow;
  groupId: number;
  scopeId: number;
  subscriptionKey: string;
  expires: number;
  expiresAt: Date | null;
  active: boolean;
};

function authorityMissing(error: unknown) {
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_NO_SUCH_TABLE" ||
    candidate.errno === 1146 ||
    candidate.code === "ER_BAD_FIELD_ERROR" ||
    candidate.errno === 1054;
}

function runtimeIdentity(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en-US");
}

function nativeSteamId(value: unknown) {
  const accountId = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(accountId)) return null;
  const numeric = BigInt(accountId);
  const steamId = numeric >= steamId64Base ? numeric : numeric + steamId64Base;
  const normalized = steamId.toString();
  return /^7656119\d{10}$/.test(normalized) ? normalized : null;
}

function deterministicUuid(seed: string) {
  const hex = createHash("sha256").update(`arena-vip-authority:${seed}`).digest("hex");
  const bytes = hex.slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const value = bytes.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function dateValue(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function sameDate(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
) {
  return dateValue(left ?? null)?.getTime() === dateValue(right ?? null)?.getTime();
}

function membershipIsActive(row: MembershipRow, nowMilliseconds: number) {
  if (row.status !== "active") return false;
  const expiry = dateValue(row.expires_at);
  return expiry === null || expiry.getTime() > nowMilliseconds;
}

function suppressionIsActive(
  row: SubscriptionRow | undefined,
  nowMilliseconds: number,
) {
  if (!row) return false;
  if (booleanValue(row.legacy_suppressed_permanently)) return true;
  const until = dateValue(row.legacy_suppressed_until);
  return Boolean(until && until.getTime() > nowMilliseconds);
}

function preferredRuntimeRawRows(rows: RawVipRow[], steamId: string) {
  const matching = rows.filter((row) => nativeSteamId(row.account_id) === steamId);
  const fullIdRows = matching.filter((row) => String(row.account_id) === steamId);
  if (fullIdRows.length > 0) return fullIdRows;
  const shortId = (BigInt(steamId) - steamId64Base).toString();
  return matching.filter((row) => String(row.account_id) === shortId);
}

function suppressionForRows(
  rows: MappedRawVipRow[],
  existing: SubscriptionRow | undefined,
  selected: MembershipRow | null,
) {
  const previousUntil = dateValue(existing?.legacy_suppressed_until ?? null);
  const selectedExpiry = dateValue(selected?.expires_at ?? null);
  const permanent = Boolean(
    booleanValue(existing?.legacy_suppressed_permanently) ||
    rows.some((row) => row.expires === 0) ||
    (selected && selected.expires_at === null),
  );
  if (permanent) return { permanent, until: null, selectedExpiry };
  const rawUntil = rows.reduce<Date | null>((latest, row) => {
    if (!row.expiresAt) return latest;
    return !latest || row.expiresAt.getTime() > latest.getTime()
      ? row.expiresAt
      : latest;
  }, null);
  const until = [previousUntil, rawUntil, selectedExpiry]
    .filter((value): value is Date => value !== null)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  return { permanent, until, selectedExpiry };
}

function compareMembershipPrecedence(left: MembershipRow, right: MembershipRow) {
  const leftRank = numberValue(left.rank_weight);
  const rightRank = numberValue(right.rank_weight);
  const leftGroupId = numberValue(left.group_id);
  const rightGroupId = numberValue(right.group_id);
  if (
    leftRank === null || rightRank === null ||
    leftGroupId === null || leftGroupId < 1 ||
    rightGroupId === null || rightGroupId < 1
  ) {
    throw new Error("Arena VIP membership precedence data is invalid.");
  }
  return compareVipEntitlementPrecedence(
    {
      groupId: leftGroupId,
      rankWeight: leftRank,
      permanent: left.expires_at === null,
    },
    {
      groupId: rightGroupId,
      rankWeight: rightRank,
      permanent: right.expires_at === null,
    },
  );
}

function subscriptionVersion(row: SubscriptionRow) {
  const version = numberValue(row.row_version);
  if (version === null || version < 1) {
    throw new Error("Arena VIP subscription row version is invalid.");
  }
  return version;
}

/**
 * Mirrors preserved VIPCore `vip_users` rows into the arena authority model
 * in the caller's existing game-database transaction. Once migration 001 is
 * present, every staff edit is therefore visible to the normalized reader in
 * the same commit. Before rollout the helper deliberately no-ops on missing
 * authority tables/columns so the legacy writer remains deployable first.
 */
export async function synchronizeArenaVipAuthorityForPlayer(
  connection: PoolConnection,
  steamId: string,
) {
  if (!/^7656119\d{10}$/.test(steamId)) return;
  const shortAccountId = (BigInt(steamId) - steamId64Base).toString();
  try {
    const [rawRows] = await connection.query<RawVipRow[]>(
      "SELECT CAST(account_id AS CHAR) AS account_id, sid, `group` AS group_name, expires " +
        "FROM vip_users WHERE account_id IN (?, ?) " +
        "ORDER BY account_id, sid, `group` FOR UPDATE",
      [steamId, shortAccountId],
    );
    const [targets] = await connection.query<TargetRow[]>(
      "SELECT identity_group.id AS group_id, identity_scope.id AS scope_id, " +
        "identity_scope.vip_server_id, identity_group.external_key, identity_group.vip_family_key " +
        "FROM arena_groups AS identity_group " +
        "INNER JOIN arena_group_scopes AS group_scope " +
        "ON group_scope.group_id = identity_group.id AND group_scope.enabled = TRUE " +
        "INNER JOIN arena_scopes AS identity_scope " +
        "ON identity_scope.id = group_scope.scope_id AND identity_scope.enabled = TRUE " +
        "WHERE identity_group.group_type = 'vip' AND identity_group.enabled = TRUE " +
        "AND identity_group.external_key IS NOT NULL " +
        "AND identity_scope.vip_server_id IS NOT NULL " +
        "ORDER BY identity_scope.vip_server_id, identity_group.rank_weight DESC, identity_group.id FOR UPDATE",
    );
    const [existingMemberships] = await connection.query<MembershipRow[]>(
        "SELECT membership.membership_uuid, membership.group_id, membership.scope_id, " +
        "membership.starts_at, membership.expires_at, membership.status, membership.provenance_type, " +
        "identity_group.vip_family_key, " +
        "COALESCE(group_scope.rank_weight_override, identity_group.rank_weight) AS rank_weight " +
        "FROM arena_group_memberships AS membership " +
        "INNER JOIN arena_groups AS identity_group ON identity_group.id = membership.group_id " +
        "INNER JOIN arena_group_scopes AS group_scope " +
        "ON group_scope.group_id = membership.group_id AND group_scope.scope_id = membership.scope_id " +
        "WHERE membership.steam_id = ? AND identity_group.group_type = 'vip' " +
        "ORDER BY membership.scope_id, identity_group.vip_family_key, membership.group_id FOR UPDATE",
      [steamId],
    );
    const [subscriptions] = await connection.query<SubscriptionRow[]>(
      "SELECT scope_id, vip_family_key, group_id, membership_uuid, status, starts_at, expires_at, " +
        "legacy_suppressed_until, legacy_suppressed_permanently, row_version " +
        "FROM arena_vip_subscriptions WHERE steam_id = ? " +
        "ORDER BY scope_id, vip_family_key FOR UPDATE",
      [steamId],
    );

    const targetsByRuntimeKey = new Map<string, TargetRow>(
      targets.map((row) => [
        `${Number(row.vip_server_id)}\0${runtimeIdentity(row.external_key)}`,
        row,
      ] as const),
    );
    const existingByTuple = new Map<string, MembershipRow>(
      existingMemberships.map((row) => [
        `${Number(row.group_id)}\0${Number(row.scope_id)}`,
        row,
      ] as const),
    );
    const existingByUuid = new Map(
      existingMemberships.map((row) => [row.membership_uuid, row] as const),
    );
    const subscriptionsByKey = new Map<string, SubscriptionRow>(
      subscriptions.map((row) => [
        `${Number(row.scope_id)}\0${row.vip_family_key}`,
        row,
      ] as const),
    );
    const preferredRawRows = preferredRuntimeRawRows(rawRows, steamId);
    const nowMilliseconds = Date.now();
    const nowSeconds = Math.floor(nowMilliseconds / 1_000);
    const mappedRawRows: MappedRawVipRow[] = [];
    for (const raw of preferredRawRows) {
      const serverId = numberValue(raw.sid);
      const expires = numberValue(raw.expires);
      if (serverId === null || serverId < 0 || expires === null || expires < 0) continue;
      const target = targetsByRuntimeKey.get(
        `${serverId}\0${runtimeIdentity(raw.group_name)}`,
      );
      // Keep an orphaned native row editable in vip_users, but never invent an
      // authority target with unknown perks, family, or rank.
      if (!target) continue;
      const groupId = numberValue(target.group_id);
      const scopeId = numberValue(target.scope_id);
      const familyKey = String(target.vip_family_key ?? "").trim();
      if (groupId === null || groupId < 1 || scopeId === null || scopeId < 1 || !familyKey) {
        continue;
      }
      mappedRawRows.push({
        raw,
        groupId,
        scopeId,
        subscriptionKey: `${scopeId}\0${familyKey}`,
        expires,
        expiresAt: expires === 0 ? null : new Date(expires * 1_000),
        active: expires === 0 || expires > nowSeconds,
      });
    }
    const mappedRawRowsByKey = new Map<string, MappedRawVipRow[]>();
    for (const mapped of mappedRawRows) {
      const rows = mappedRawRowsByKey.get(mapped.subscriptionKey) ?? [];
      rows.push(mapped);
      mappedRawRowsByKey.set(mapped.subscriptionKey, rows);
    }
    const activeNonLegacyKeys = new Set(
      existingMemberships
        .filter((row) =>
          row.provenance_type !== "legacy_vip_users" &&
          membershipIsActive(row, nowMilliseconds)
        )
        .map((row) => `${Number(row.scope_id)}\0${row.vip_family_key}`),
    );
    const representedLegacyUuids = new Set<string>();

    for (const mapped of mappedRawRows) {
      const { raw, groupId, scopeId } = mapped;
      const tupleKey = `${groupId}\0${scopeId}`;
      const existing = existingByTuple.get(tupleKey);
      if (existing && existing.provenance_type !== "legacy_vip_users") {
        continue;
      }
      const subscription = subscriptionsByKey.get(mapped.subscriptionKey);
      const subscribedMembership = subscription?.membership_uuid
        ? existingByUuid.get(subscription.membership_uuid)
        : undefined;
      const activeLegacySubscription = Boolean(
        subscription?.status === "active" &&
        subscribedMembership?.provenance_type === "legacy_vip_users" &&
        membershipIsActive(subscribedMembership, nowMilliseconds),
      );
      const protectedSubscription = Boolean(
        subscription?.status === "conflict" ||
        (subscription?.status === "active" &&
          (!subscribedMembership || subscribedMembership.provenance_type !== "legacy_vip_users")),
      );
      const legacyBlocked =
        activeNonLegacyKeys.has(mapped.subscriptionKey) ||
        protectedSubscription ||
        (suppressionIsActive(subscription, nowMilliseconds) && !activeLegacySubscription);
      const membershipUuid = existing?.membership_uuid ?? deterministicUuid(
        `${steamId}:${Number(raw.sid)}:${runtimeIdentity(raw.group_name)}`,
      );
      representedLegacyUuids.add(membershipUuid);
      if (legacyBlocked) {
        if (existing?.status === "active") {
          await connection.execute(
            "UPDATE arena_group_memberships SET status = 'superseded', row_version = row_version + 1 " +
              "WHERE membership_uuid = ? AND provenance_type = 'legacy_vip_users' AND status = 'active'",
            [membershipUuid],
          );
        }
        continue;
      }
      const provenanceReference =
        `${String(raw.account_id)}:${Number(raw.sid)}:${String(raw.group_name)}`;
      const desiredStatus = mapped.active ? "active" : "superseded";
      await connection.execute(
        "INSERT INTO arena_group_memberships " +
          "(membership_uuid, group_id, scope_id, steam_id, starts_at, expires_at, status, " +
          "provenance_type, provenance_reference, granted_by_actor, grant_reason, revoked_at, " +
          "revoked_by_actor, revoke_reason, row_version) " +
          "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6), ?, ?, 'legacy_vip_users', ?, 'legacy-sync', " +
          "'Synchronized from VIPCore vip_users', NULL, NULL, NULL, 1) " +
          "ON DUPLICATE KEY UPDATE row_version = row_version + IF(" +
          "NOT (expires_at <=> VALUES(expires_at)) OR status <> VALUES(status) OR " +
          "NOT (provenance_reference <=> VALUES(provenance_reference)) OR " +
          "revoked_at IS NOT NULL OR revoked_by_actor IS NOT NULL OR revoke_reason IS NOT NULL, 1, 0), " +
          "expires_at = VALUES(expires_at), status = VALUES(status), " +
          "provenance_reference = VALUES(provenance_reference), revoked_at = NULL, " +
          "revoked_by_actor = NULL, revoke_reason = NULL",
        [
          membershipUuid,
          groupId,
          scopeId,
          steamId,
          mapped.expiresAt,
          desiredStatus,
          provenanceReference,
        ],
      );
    }

    for (const membership of existingMemberships) {
      if (
        membership.provenance_type === "legacy_vip_users" &&
        !representedLegacyUuids.has(membership.membership_uuid) &&
        membership.status !== "revoked"
      ) {
        await connection.execute(
          "UPDATE arena_group_memberships SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP(6), " +
            "revoked_by_actor = 'legacy-sync', revoke_reason = 'Native VIP row removed', " +
            "row_version = row_version + 1 WHERE membership_uuid = ? " +
            "AND provenance_type = 'legacy_vip_users' AND status <> 'revoked'",
          [membership.membership_uuid],
        );
      }
    }

    const [currentMemberships] = await connection.query<MembershipRow[]>(
      "SELECT membership.membership_uuid, membership.group_id, membership.scope_id, " +
        "membership.starts_at, membership.expires_at, membership.status, membership.provenance_type, " +
        "identity_group.vip_family_key, " +
        "COALESCE(group_scope.rank_weight_override, identity_group.rank_weight) AS rank_weight " +
        "FROM arena_group_memberships AS membership " +
        "INNER JOIN arena_groups AS identity_group ON identity_group.id = membership.group_id " +
        "INNER JOIN arena_group_scopes AS group_scope " +
        "ON group_scope.group_id = membership.group_id AND group_scope.scope_id = membership.scope_id " +
        "INNER JOIN arena_scopes AS identity_scope " +
        "ON identity_scope.id = membership.scope_id AND identity_scope.enabled = TRUE " +
        "WHERE membership.steam_id = ? AND identity_group.group_type = 'vip' " +
        "AND identity_group.enabled = TRUE AND group_scope.enabled = TRUE " +
        "ORDER BY membership.scope_id, identity_group.vip_family_key, membership.group_id FOR UPDATE",
      [steamId],
    );
    const membershipsByKey = new Map<string, MembershipRow[]>();
    for (const membership of currentMemberships) {
      const key = `${Number(membership.scope_id)}\0${membership.vip_family_key}`;
      const rows = membershipsByKey.get(key) ?? [];
      rows.push(membership);
      membershipsByKey.set(key, rows);
    }
    const keys = new Set([
      ...membershipsByKey.keys(),
      ...subscriptionsByKey.keys(),
      ...mappedRawRowsByKey.keys(),
    ]);

    for (const key of keys) {
      const rows = membershipsByKey.get(key) ?? [];
      const existingSubscription = subscriptionsByKey.get(key);
      const referencedBefore = existingSubscription?.membership_uuid
        ? existingByUuid.get(existingSubscription.membership_uuid)
        : undefined;
      const preserveExistingAuthority = Boolean(
        existingSubscription?.status === "conflict" ||
        (existingSubscription?.status === "active" &&
          existingSubscription.membership_uuid &&
          (!referencedBefore || referencedBefore.provenance_type !== "legacy_vip_users")),
      );
      const activeRows = rows.filter((row) =>
        membershipIsActive(row, nowMilliseconds)
      );
      const activeLegacyRows = activeRows.filter(
        (row) => row.provenance_type === "legacy_vip_users",
      );
      const activeNonLegacyRows = activeRows.filter(
        (row) => row.provenance_type !== "legacy_vip_users",
      );
      const subscribedLegacyIsActive = Boolean(
        existingSubscription?.status === "active" &&
        referencedBefore?.provenance_type === "legacy_vip_users" &&
        membershipIsActive(referencedBefore, nowMilliseconds),
      );
      const tombstoneBlocksLegacy =
        suppressionIsActive(existingSubscription, nowMilliseconds) &&
        !subscribedLegacyIsActive;
      const subscribedActiveNonLegacy = existingSubscription?.status === "active"
        ? activeNonLegacyRows.find(
            (row) => row.membership_uuid === existingSubscription.membership_uuid,
          ) ?? null
        : null;
      const selected = preserveExistingAuthority
        ? null
        : subscribedActiveNonLegacy ??
          activeNonLegacyRows.slice().sort(compareMembershipPrecedence)[0] ??
          (tombstoneBlocksLegacy
            ? null
            : activeLegacyRows.slice().sort(compareMembershipPrecedence)[0] ?? null);

      // Legacy synchronization may collapse only mirrored legacy contenders.
      // Inventory, staff, game, and migration rows remain untouched even when
      // their family needs explicit staff reconciliation.
      for (const losing of activeLegacyRows.filter(
        (row) => row.membership_uuid !== selected?.membership_uuid,
      )) {
        await connection.execute(
          "UPDATE arena_group_memberships SET status = 'superseded', row_version = row_version + 1 " +
            "WHERE membership_uuid = ? AND provenance_type = 'legacy_vip_users' AND status = 'active'",
          [losing.membership_uuid],
        );
      }

      const suppression = suppressionForRows(
        mappedRawRowsByKey.get(key) ?? [],
        existingSubscription,
        preserveExistingAuthority ? referencedBefore ?? null : selected,
      );
      const [scopeIdText, family] = key.split("\0");
      const scopeId = Number(scopeIdText);
      if (!Number.isSafeInteger(scopeId) || scopeId < 1 || !family) {
        throw new Error("Arena VIP subscription scope or family is invalid.");
      }

      if (preserveExistingAuthority && existingSubscription) {
        const suppressionChanged =
          booleanValue(existingSubscription.legacy_suppressed_permanently) !== suppression.permanent ||
          !sameDate(existingSubscription.legacy_suppressed_until, suppression.until);
        if (suppressionChanged) {
          const version = subscriptionVersion(existingSubscription);
          await connection.execute(
            "UPDATE arena_vip_subscriptions SET legacy_suppressed_until = ?, " +
              "legacy_suppressed_permanently = ?, row_version = row_version + 1 " +
              "WHERE steam_id = ? AND scope_id = ? AND vip_family_key = ? AND row_version = ?",
            [suppression.until, suppression.permanent, steamId, scopeId, family, version],
          );
        }
        continue;
      }

      if (selected) {
        const groupId = numberValue(selected.group_id);
        const startsAt = dateValue(selected.starts_at);
        if (groupId === null || groupId < 1 || !startsAt) {
          throw new Error("Arena VIP selected membership identity is invalid.");
        }
        const activeStateChanged = !existingSubscription ||
          existingSubscription.status !== "active" ||
          Number(existingSubscription.group_id) !== groupId ||
          existingSubscription.membership_uuid !== selected.membership_uuid ||
          !sameDate(existingSubscription.starts_at, startsAt) ||
          !sameDate(existingSubscription.expires_at, suppression.selectedExpiry) ||
          booleanValue(existingSubscription.legacy_suppressed_permanently) !== suppression.permanent ||
          !sameDate(existingSubscription.legacy_suppressed_until, suppression.until);
        if (!existingSubscription) {
          await connection.execute(
            "INSERT INTO arena_vip_subscriptions " +
              "(steam_id, scope_id, vip_family_key, group_id, group_type, membership_uuid, status, " +
              "starts_at, expires_at, legacy_suppressed_until, legacy_suppressed_permanently, row_version) " +
              "VALUES (?, ?, ?, ?, 'vip', ?, 'active', ?, ?, ?, ?, 1)",
            [
              steamId,
              scopeId,
              family,
              groupId,
              selected.membership_uuid,
              startsAt,
              suppression.selectedExpiry,
              suppression.until,
              suppression.permanent,
            ],
          );
        } else if (activeStateChanged) {
          const version = subscriptionVersion(existingSubscription);
          await connection.execute(
            "UPDATE arena_vip_subscriptions SET group_id = ?, group_type = 'vip', membership_uuid = ?, " +
              "status = 'active', starts_at = ?, expires_at = ?, legacy_suppressed_until = ?, " +
              "legacy_suppressed_permanently = ?, row_version = row_version + 1 " +
              "WHERE steam_id = ? AND scope_id = ? AND vip_family_key = ? AND row_version = ?",
            [
              groupId,
              selected.membership_uuid,
              startsAt,
              suppression.selectedExpiry,
              suppression.until,
              suppression.permanent,
              steamId,
              scopeId,
              family,
              version,
            ],
          );
        }
      } else if (existingSubscription) {
        const endedStateChanged =
          existingSubscription.status !== "ended" ||
          existingSubscription.group_id !== null ||
          existingSubscription.membership_uuid !== null ||
          existingSubscription.starts_at !== null ||
          existingSubscription.expires_at !== null ||
          booleanValue(existingSubscription.legacy_suppressed_permanently) !== suppression.permanent ||
          !sameDate(existingSubscription.legacy_suppressed_until, suppression.until);
        if (endedStateChanged) {
          const version = subscriptionVersion(existingSubscription);
          await connection.execute(
            "UPDATE arena_vip_subscriptions SET group_id = NULL, membership_uuid = NULL, " +
              "status = 'ended', starts_at = NULL, expires_at = NULL, " +
              "legacy_suppressed_until = ?, legacy_suppressed_permanently = ?, " +
              "row_version = row_version + 1 " +
              "WHERE steam_id = ? AND scope_id = ? AND vip_family_key = ? AND row_version = ?",
            [suppression.until, suppression.permanent, steamId, scopeId, family, version],
          );
        }
      }
    }
  } catch (error) {
    if (authorityMissing(error)) return;
    throw error;
  }
}
