import { redirect } from "next/navigation";

type LegacyAssignmentSearchParams = Promise<{
  notice?: string;
  error?: string;
}>;

export default async function VipsPage({
  searchParams,
}: {
  searchParams: LegacyAssignmentSearchParams;
}) {
  const parameters = await searchParams;
  const query = new URLSearchParams({
    tab: "membership",
    assignment: "vip",
  });
  if (parameters.notice) query.set("notice", parameters.notice);
  if (parameters.error) query.set("error", parameters.error);
  redirect(`/admin/groups?${query.toString()}#vip-assignments`);
}
