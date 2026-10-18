export type GroupWorkspaceTab = "admin" | "vip" | "custom" | "custom-access";

export function groupWorkspaceTab(value?: string, assignment?: string, source?: string): GroupWorkspaceTab {
  if (value === "admin" || value === "vip" || value === "custom" || value === "custom-access") return value;
  if (value === "tags" || value === "permissions" || value === "awards") return "custom-access";
  if (value === "create") return "custom";
  if (value === "membership" && (assignment === "admin" || assignment === "vip" || assignment === "custom")) return assignment;
  if (!value || value === "connected") {
    if (source === "vipcore") return "vip";
    if (source === "custom") return "custom";
  }
  return "admin";
}

export function groupSourceForTab(tab: GroupWorkspaceTab) {
  return tab === "admin" ? "admins_core" : tab === "vip" ? "vipcore" : tab === "custom" ? "custom" : null;
}
