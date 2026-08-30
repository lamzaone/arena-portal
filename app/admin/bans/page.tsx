import {
  StaffManagementPage,
  type StaffManagementSearchParams,
} from "@/app/admin/staff-management-page";

export default function BansPage({
  searchParams,
}: {
  searchParams: Promise<StaffManagementSearchParams>;
}) {
  return <StaffManagementPage section="bans" searchParams={searchParams} />;
}
