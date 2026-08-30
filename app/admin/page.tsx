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
  const section = staffSection(parameters.tab);
  const canonical = new URLSearchParams();

  for (const key of ["page", "q", "notice", "error"] as const) {
    const value = parameters[key];
    if (value) canonical.set(key, value);
  }

  const query = canonical.toString();
  redirect(`/admin/${section}${query ? `?${query}` : ""}`);
}
