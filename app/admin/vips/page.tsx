import {
  StaffManagementPage,
  type StaffManagementSearchParams,
} from "@/app/admin/staff-management-page";

export default function VipsPage({
  searchParams,
}: {
  searchParams: Promise<StaffManagementSearchParams>;
}) {
  return <StaffManagementPage section="vips" searchParams={searchParams} />;
}
