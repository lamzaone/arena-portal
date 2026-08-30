import "server-only";

import type { RowDataPacket } from "mysql2/promise";

import {
  getGameDatabasePool,
  getPortalDatabasePool,
} from "@/lib/data/database-pools";

export type VipBenefit = {
  name: string;
  detail: string;
};

export type VipTier = {
  name: string;
  weight: number;
  benefits: VipBenefit[];
};

type GameVipGroupRow = RowDataPacket & {
  name: string;
  weight: number | string;
  values_json: unknown;
};

type PortalVipGroupRow = RowDataPacket & {
  external_key: string;
  rank_weight: number | string;
  definition: unknown;
};

type PerkDefinitionRow = RowDataPacket & {
  perk_key: string;
  display_name: string;
  description: string | null;
  enabled: number | boolean;
};

type PerkPresentation = {
  displayName: string;
  description: string | null;
  enabled: boolean;
};

type RawVipTier = {
  name: string;
  weight: number;
  values: Record<string, unknown>;
};

const fallbackTierSkeletons: VipTier[] = [
  { name: "ULTIMATE", weight: 100, benefits: [] },
  { name: "DIAMOND", weight: 80, benefits: [] },
  { name: "GOLD", weight: 60, benefits: [] },
  { name: "SILVER", weight: 40, benefits: [] },
  { name: "STANDARD", weight: 20, benefits: [] },
];

function configuredVipServerId() {
  const parsed = Number.parseInt(process.env.GAME_VIP_SERVER_ID ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2_147_483_647
    ? parsed
    : 1;
}

function boolean(value: unknown) {
  return value === true || value === 1 || String(value ?? "").toLocaleLowerCase("en-US") === "true";
}

function jsonValue(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  const parsed = jsonValue(value);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayNumber(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed === null ? null : new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(parsed);
}

function recordValue(record: Record<string, unknown> | null, ...keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    if (key in record) return record[key];
    const matchingKey = Object.keys(record).find((candidate) => candidate.toLocaleLowerCase("en-US") === key.toLocaleLowerCase("en-US"));
    if (matchingKey) return record[matchingKey];
  }
  return undefined;
}

function perkValueEnabled(value: unknown) {
  if (value === null || value === undefined || value === false || value === 0) return false;
  if (typeof value === "string" && ["0", "false", "off", "disabled", "no"].includes(value.trim().toLocaleLowerCase("en-US"))) return false;
  const record = objectValue(value);
  const explicitEnabled = recordValue(record, "enabled");
  return explicitEnabled === undefined ? true : boolean(explicitEnabled);
}

function titleFromPerkKey(key: string) {
  return key
    .replace(/^vip[.:_-]?/i, "")
    .split(/[._:-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("en-US") + part.slice(1))
    .join(" ") || key;
}

function weaponName(value: string) {
  const names: Record<string, string> = {
    weapon_decoy: "Decoy",
    weapon_flashbang: "Flashbang",
    weapon_hegrenade: "HE grenade",
    weapon_incgrenade: "Incendiary grenade",
    weapon_molotov: "Molotov",
    weapon_smokegrenade: "Smoke grenade",
    weapon_taser: "Zeus",
  };
  return names[value.toLocaleLowerCase("en-US")]
    ?? value.replace(/^weapon_/, "").replaceAll("_", " ");
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function formatUtilities(record: Record<string, unknown> | null) {
  const items = [...new Set([
    ...stringArray(recordValue(record, "CT")),
    ...stringArray(recordValue(record, "T")),
  ])].map(weaponName);
  const roundCopy = boolean(recordValue(record, "GiveOnPistolRounds"))
    ? "including pistol rounds"
    : "after pistol rounds";
  return items.length ? `${items.join(", ")} · ${roundCopy}` : roundCopy;
}

function scalarDetail(value: unknown) {
  if (value === true) return "Enabled";
  if (typeof value === "string") return value;
  const number = displayNumber(value);
  if (number !== null) return number;
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  return null;
}

function genericDetail(value: unknown) {
  const scalar = scalarDetail(value);
  if (scalar) return scalar;
  const record = objectValue(value);
  if (!record) return "Configured";
  const parts = Object.entries(record)
    .filter(([key]) => key.toLocaleLowerCase("en-US") !== "enabled")
    .slice(0, 3)
    .map(([key, entry]) => {
      const detail = scalarDetail(entry);
      return detail ? `${titleFromPerkKey(key)} ${detail}` : null;
    })
    .filter((entry): entry is string => Boolean(entry));
  return parts.join(" · ") || "Enabled";
}

function perkDetail(key: string, value: unknown, fallback: string | null) {
  const normalizedKey = key.toLocaleLowerCase("en-US");
  const record = objectValue(value);
  const field = (...keys: string[]) => displayNumber(recordValue(record, ...keys));
  switch (normalizedKey) {
    case "vip.antiflash":
      return fallback ?? "Reduced flash impact";
    case "vip.armor":
      return field("Armor") ? `${field("Armor")} armor` : genericDetail(value);
    case "vip.bhop": {
      const details = [
        field("MaxSpeed") ? `max speed ${field("MaxSpeed")}` : null,
        field("JumpForce") ? `jump force ${field("JumpForce")}` : null,
      ].filter(Boolean);
      return details.length ? details.join(" · ") : genericDetail(value);
    }
    case "vip.doublejump": {
      const details = [
        field("MaxJumps") ? `${field("MaxJumps")} jump${field("MaxJumps") === "1" ? "" : "s"}` : null,
        field("Boost") ? `boost ${field("Boost")}` : null,
      ].filter(Boolean);
      return details.length ? details.join(" · ") : genericDetail(value);
    }
    case "vip.fov":
      return displayNumber(value) ? `Setting ${displayNumber(value)}` : genericDetail(value);
    case "vip.health":
      return field("Health") ? `${field("Health")} HP` : genericDetail(value);
    case "vip.items":
      return formatUtilities(record);
    case "vip.killscreen":
      return field("Duration") ? `${field("Duration")}s duration` : genericDetail(value);
    case "vip.money":
      return field("Money") ? `$${field("Money")}` : genericDetail(value);
    case "vip.rainbowmodel":
      return field("IntervalSeconds") ? `Updates every ${field("IntervalSeconds")}s` : genericDetail(value);
    case "vip.round_end_abilities": {
      const details = [
        field("SpeedModifier") ? `${field("SpeedModifier")}x speed` : null,
        field("GravityModifier") ? `${field("GravityModifier")}x gravity` : null,
      ].filter(Boolean);
      return details.length ? details.join(" · ") : genericDetail(value);
    }
    case "vip.smokecolor":
      return Array.isArray(value) ? `RGB(${value.join(", ")})` : genericDetail(value);
    case "vip.speed":
      return field("Speed") ? `${field("Speed")}x speed` : genericDetail(value);
    case "vip.vampirism": {
      const percent = field("Percent");
      const flat = field("Flat");
      const mode = String(recordValue(record, "GiveHealthMode") ?? "damage").replace(/^On/i, "on ").toLocaleLowerCase("en-US");
      if (percent && percent !== "0") return `${percent}% health ${mode}`;
      if (flat && flat !== "0") return `${flat} health ${mode}`;
      return genericDetail(value);
    }
    default:
      return value === true && fallback ? fallback : genericDetail(value);
  }
}

async function loadPerkPresentation() {
  const database = getPortalDatabasePool();
  if (!database) return null;
  try {
    const [rows] = await database.query<PerkDefinitionRow[]>(
      "SELECT perk_key, display_name, description, enabled FROM portal_vip_perks ORDER BY perk_key",
    );
    return new Map(rows.map((row) => [
      row.perk_key.toLocaleLowerCase("en-US"),
      {
        displayName: row.display_name,
        description: row.description,
        enabled: boolean(row.enabled),
      },
    ]));
  } catch {
    return null;
  }
}

async function loadGameVipTiers() {
  const database = getGameDatabasePool();
  if (!database) return null;
  try {
    const [rows] = await database.query<GameVipGroupRow[]>(
      "SELECT name, weight, values_json FROM vip_group_definitions WHERE server_id = ? AND enabled = TRUE ORDER BY weight DESC, name ASC",
      [configuredVipServerId()],
    );
    return rows.map((row) => ({
      name: String(row.name),
      weight: Number(row.weight),
      values: objectValue(row.values_json) ?? {},
    } satisfies RawVipTier));
  } catch {
    return null;
  }
}

async function loadPortalVipTiers() {
  const database = getPortalDatabasePool();
  if (!database) return null;
  try {
    const [rows] = await database.query<PortalVipGroupRow[]>(
      "SELECT external_definition.external_key, external_definition.rank_weight, external_definition.definition " +
        "FROM portal_identity_external_group_definitions AS external_definition " +
        "INNER JOIN portal_identity_groups AS identity_group ON identity_group.id = external_definition.group_id " +
        "WHERE external_definition.source_type = 'vipcore' AND identity_group.enabled = TRUE " +
        "ORDER BY external_definition.rank_weight DESC, external_definition.external_key ASC",
    );
    return rows.flatMap((row) => {
      const definition = objectValue(row.definition);
      if (recordValue(definition, "enabled") === false) return [];
      return [{
        name: String(row.external_key),
        weight: Number(row.rank_weight),
        values: objectValue(recordValue(definition, "values")) ?? {},
      } satisfies RawVipTier];
    });
  } catch {
    return null;
  }
}

function presentTier(tier: RawVipTier, perks: Map<string, PerkPresentation> | null): VipTier {
  return {
    name: tier.name,
    weight: Number.isFinite(tier.weight) ? tier.weight : 0,
    // Without the global enabled/disabled registry we cannot prove a perk is
    // publishable, so fail closed instead of falling back to configured values.
    benefits: perks ? Object.entries(tier.values).flatMap(([key, value]) => {
      const presentation = perks.get(key.toLocaleLowerCase("en-US"));
      if (!perkValueEnabled(value) || presentation?.enabled === false) return [];
      return [{
        name: presentation?.displayName ?? titleFromPerkKey(key),
        detail: perkDetail(key, value, presentation?.description ?? null),
      }];
    }) : [],
  };
}

/**
 * VIPCore's database definition table is authoritative. The portal copy is a
 * fail-soft fallback for deployments where the game database is temporarily
 * unavailable. Static tier names preserve membership matching during an
 * outage, but deliberately do not advertise a stale benefit snapshot.
 */
export async function getVipTiers(): Promise<VipTier[]> {
  const [perks, gameTiers] = await Promise.all([
    loadPerkPresentation(),
    loadGameVipTiers(),
  ]);
  const rawTiers = gameTiers ?? await loadPortalVipTiers();
  if (!rawTiers) return fallbackTierSkeletons;
  return rawTiers
    .map((tier) => presentTier(tier, perks))
    .sort((left, right) => right.weight - left.weight || left.name.localeCompare(right.name));
}
