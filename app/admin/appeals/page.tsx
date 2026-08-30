import {
  StaffManagementPage,
  type StaffManagementSearchParams,
} from "@/app/admin/staff-management-page";

export default function AppealsPage({
  searchParams,
}: {
  searchParams: Promise<StaffManagementSearchParams>;
}) {
  return <StaffManagementPage section="appeals" searchParams={searchParams} />;
}
