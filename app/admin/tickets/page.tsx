import {
  StaffManagementPage,
  type StaffManagementSearchParams,
} from "@/app/admin/staff-management-page";

export default function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<StaffManagementSearchParams>;
}) {
  return <StaffManagementPage section="tickets" searchParams={searchParams} />;
}
