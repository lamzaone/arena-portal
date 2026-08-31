import { normalizeVipGroup } from "@/lib/content/group-presentation";
import type { StaffVip } from "@/lib/data/portal-repository";

const fallbackVipGroups = [
  "ULTIMATE",
  "DIAMOND",
  "GOLD",
  "SILVER",
  "STANDARD",
];

function vipGroupIdentity(value: string) {
  return normalizeVipGroup(value.normalize("NFKC")).toLocaleLowerCase("en-US");
}

export function visibleVipGroups(
  definitions: string[],
  assignments: StaffVip[],
) {
  const groups = new Map<string, string>();
  const add = (value: string) => {
    const displayName = value.normalize("NFKC").trim();
    const identity = vipGroupIdentity(displayName);
    if (identity && !groups.has(identity)) groups.set(identity, displayName);
  };

  for (const group of definitions.length ? definitions : fallbackVipGroups) {
    add(group);
  }
  for (const assignment of assignments) add(assignment.group);
  return [...groups.values()];
}
