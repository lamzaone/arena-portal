import { SignInRequired } from '@/components/sign-in-required';
import { StaffSubmenu } from '@/components/staff-submenu';
import { AdminPageHeader } from '@/components/ui/admin-page-header';
import { PortalShell } from '@/components/ui/portal-shell';
import { HudEffectsManagement } from '@/components/economy/hud-effects-management';
import { getAdminAccess } from '@/lib/admin/access';
import { getSession, createAdminActionToken } from '@/lib/auth/session';
import { missionManagementRepository } from '@/lib/missions/server';
export default async function HudEffectsPage() {
    const session = await getSession();
    if (!session)
        return <SignInRequired title="HUD appearance" description="Sign in with a staff account to configure in-game effects."/>;
    const access = await getAdminAccess(session.steamId);
    if (!access.canManageEconomy)
        return <PortalShell authenticated><section className="staff-denied"><h1>Economy management required.</h1><p>Your staff role cannot change HUD effects.</p></section></PortalShell>;
    let content;
    try {
        content = <HudEffectsManagement csrf={createAdminActionToken(session)} settings={await missionManagementRepository().effects()}/>;
    }
    catch {
        content = <section className="staff-denied" role="alert"><h2>Effects storage unavailable</h2><p>Apply migration 047 to the shared portal database, then reload.</p></section>;
    }
    return <PortalShell authenticated className="staff-page economy-admin-page" navigation={<StaffSubmenu access={access} active="hud-effects"/>}><AdminPageHeader id="hud-effects-title" title="HUD appearance" description="Versioned text styles and motion settings for the in-game HUD." access={access}/>{content}</PortalShell>;
}
