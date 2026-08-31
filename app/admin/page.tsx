import { redirect } from "next/navigation";

import {
  staffModerationSections,
  type StaffModerationSection,
} from "@/components/staff-submenu";

type LegacyAdminSearchParams = {
  tab?: string;
  page?: string;
  q?: string;
  notice?: string;
  error?: string;
};

function staffSection(value: string | undefined): StaffModerationSection {
  return staffModerationSections.some((section) => section.id === value)
    ? value as StaffModerationSection
    : "bans";
}

export default async function AdminRedirectPage({
  searchParams,
}: {
  searchParams: Promise<LegacyAdminSearchParams>;
}) {
  const parameters = await searchParams;
  if (parameters.tab === "admins" || parameters.tab === "vips") {
    const assignment = parameters.tab === "admins" ? "admin" : "vip";
    const assignmentQuery = new URLSearchParams({
      tab: "membership",
      assignment,
    });
    for (const key of ["notice", "error"] as const) {
      const value = parameters[key];
      if (value) assignmentQuery.set(key, value);
    }
    redirect(
      `/admin/groups?${assignmentQuery.toString()}#${assignment}-assignments`,
    );
  }
  const section = staffSection(parameters.tab);
  const canonical = new URLSearchParams();

  for (const key of ["page", "q", "notice", "error"] as const) {
    const value = parameters[key];
    if (value) canonical.set(key, value);
  }

  const query = canonical.toString();
  redirect(`/admin/${section}${query ? `?${query}` : ""}`);
}
