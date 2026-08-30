import {
  StaffManagementPage,
  type StaffManagementSearchParams,
} from "@/app/admin/staff-management-page";

export default function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<StaffManagementSearchParams>;
}) {
  return <StaffManagementPage section="admins" searchParams={searchParams} />;
}
