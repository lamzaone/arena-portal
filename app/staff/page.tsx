import { PortalShell } from "@/components/ui/portal-shell";
import { getSession } from "@/lib/auth/session";
import { getPublicStaffDirectory } from "@/lib/data/public-staff-directory";
import { buildPageMetadata } from "@/lib/seo/site";

import { StaffShowcase } from "./staff-showcase";
import { RecruitmentSection, type RecruitmentSearchParams } from "./recruitment-section";

export const metadata = buildPageMetadata("/staff");

export default async function StaffPage({ searchParams }: { searchParams: Promise<RecruitmentSearchParams> }) {
  const [session, directory] = await Promise.all([getSession(), getPublicStaffDirectory()]);
  const parameters = await searchParams;
  return (
    <PortalShell authenticated={Boolean(session)} className="public-staff-page">
      <StaffShowcase directory={directory} recruitment={<RecruitmentSection session={session} parameters={parameters} />} />
    </PortalShell>
  );
}
