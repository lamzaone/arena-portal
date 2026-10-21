import { SignInRequired } from '@/components/sign-in-required';
import { StaffSubmenu } from '@/components/staff-submenu';
import { AdminPageHeader } from '@/components/ui/admin-page-header';
import { PortalShell } from '@/components/ui/portal-shell';
import { MissionManagement } from '@/components/economy/mission-management';
import { getAdminAccess } from '@/lib/admin/access';
import { getSession, createAdminActionToken } from '@/lib/auth/session';
import { getEconomyCatalogue } from '@/lib/data/portal-repository';
import { missionManagementRepository } from '@/lib/missions/server';
export default async function MissionsPage() {
    const session = await getSession();
    if (!session)
        return <SignInRequired title="Mission management" description="Sign in with a staff account to manage missions and rewards."/>;
    const access = await getAdminAccess(session.steamId);
    if (!access.canManageEconomy)
        return <PortalShell authenticated><section className="staff-denied"><h1>Economy management required.</h1><p>Your staff role cannot manage missions.</p></section></PortalShell>;
    let content;
    try {
        const [missions, catalogue] = await Promise.all([missionManagementRepository().list(), getEconomyCatalogue({ pageSize: 100 })]);
        content = <MissionManagement csrf={createAdminActionToken(session)} missions={missions} catalogue={catalogue.items}/>;
    }
    catch {
        content = <section className="staff-denied" role="alert"><h2>Mission storage unavailable</h2><p>Apply migrations 046 and 047 to the shared portal database, then reload. Existing server missions continue using their configured definitions.</p></section>;
    }
    return <PortalShell authenticated className="staff-page economy-admin-page" navigation={<StaffSubmenu access={access} active="missions"/>}><AdminPageHeader id="mission-management-title" title="Missions" description="Manage UTC objectives and atomic Token and item rewards. Publish changes for the next period." access={access}/>{content}</PortalShell>;
}
