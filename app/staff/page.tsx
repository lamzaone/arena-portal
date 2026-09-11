import { PortalShell } from "@/components/ui/portal-shell";
import { getSession } from "@/lib/auth/session";
import { getPublicStaffDirectory } from "@/lib/data/public-staff-directory";
import { buildPageMetadata } from "@/lib/seo/site";

import { StaffShowcase } from "./staff-showcase";

export const metadata = buildPageMetadata("/staff");

export default async function StaffPage() {
  const [session, directory] = await Promise.all([getSession(), getPublicStaffDirectory()]);
  return (
    <PortalShell authenticated={Boolean(session)} className="staff-page">
      <StaffShowcase directory={directory} />
    </PortalShell>
  );
}
