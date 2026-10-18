import { StaffManagementPage, type StaffManagementSearchParams } from "@/app/admin/staff-management-page";

export const metadata = {
  title: "Communications | Staff | TAPPED.RO",
  robots: { index: false, follow: false },
};

export default function CommunicationsPage({ searchParams }: { searchParams: Promise<StaffManagementSearchParams> }) {
  return <StaffManagementPage section="communications" searchParams={searchParams} />;
}
