export type RoleKind = "vip" | "admin";

export type GroupPresentation = {
  name: string;
  color: string;
  softColor: string;
};

const vipGroups: Record<string, GroupPresentation> = {
  ULTIMATE: { name: "ULTIMATE", color: "#b46cff", softColor: "#e4c5ff" },
  DIAMOND: { name: "DIAMOND", color: "#58b8ff", softColor: "#c5e9ff" },
  GOLD: { name: "GOLD", color: "#ffd34d", softColor: "#fff0b0" },
  SILVER: { name: "SILVER", color: "#c8d0df", softColor: "#edf1f8" },
  STANDARD: { name: "STANDARD", color: "#9de768", softColor: "#d7f7bd" }
};

const adminGroups: Record<string, GroupPresentation> = {
  "TRIAL STAFF": { name: "Trial Staff", color: "#b9bfd0", softColor: "#e6eaf2" },
  GUARDIAN: { name: "Guardian", color: "#6ce5bd", softColor: "#c7f8e5" },
  ENFORCER: { name: "Enforcer", color: "#ffb56a", softColor: "#ffe0ba" },
  OVERSEER: { name: "Overseer", color: "#b192ff", softColor: "#e2d8ff" },
  DIRECTOR: { name: "Director", color: "#61b7ff", softColor: "#cae8ff" },
  FOUNDER: { name: "Founder", color: "#ff718f", softColor: "#ffd1da" }
};

function key(value: string) {
  return value.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

export function normalizeVipGroup(value: string) {
  const normalized = key(value).replace(/^VIP_/, "");
  return vipGroups[normalized]?.name ?? normalized.replace(/_/g, " ");
}

export function getGroupPresentation(kind: RoleKind, group: string): GroupPresentation {
  if (kind === "vip") {
    const normalized = normalizeVipGroup(group);
    return vipGroups[key(normalized)] ?? { name: normalized, color: "#ff91a4", softColor: "#ffd5dc" };
  }
  const normalized = group.trim();
  return adminGroups[normalized.toUpperCase()] ?? { name: normalized, color: "#ff91a4", softColor: "#ffd5dc" };
}
