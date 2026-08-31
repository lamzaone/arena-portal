import { redirect } from "next/navigation";

type LegacyAssignmentSearchParams = Promise<{
  notice?: string;
  error?: string;
}>;

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: LegacyAssignmentSearchParams;
}) {
  const parameters = await searchParams;
  const query = new URLSearchParams({
    tab: "membership",
    assignment: "admin",
  });
  if (parameters.notice) query.set("notice", parameters.notice);
  if (parameters.error) query.set("error", parameters.error);
  redirect(`/admin/groups?${query.toString()}#admin-assignments`);
}
