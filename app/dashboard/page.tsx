import { PlayerProfilePage } from "@/components/player-profile-page";
import { SignInRequired } from "@/components/sign-in-required";
import { createProfileActionToken, getSession } from "@/lib/auth/session";
import { getPlayerDashboard, getPlayerProfileInventoryPage, getPlayerProfileThemeKey, getPlayerSettings } from "@/lib/data/portal-repository";
import { getSteamProfiles } from "@/lib/steam/profiles";

type DashboardPageProps = {
  searchParams: Promise<{ settings?: string | string[] }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Your player dashboard" description="Sign in with Steam to securely view your own ARENA profile and history." />;
  const query = await searchParams;
  const settingsOpen = query.settings === "1";

  const [profile, steamProfiles, profileInventory, profileThemeKey, settings] = await Promise.all([
    getPlayerDashboard(session.steamId),
    getSteamProfiles([session.steamId]),
    getPlayerProfileInventoryPage(session.steamId, session.steamId),
    getPlayerProfileThemeKey(session.steamId),
    settingsOpen ? getPlayerSettings(session.steamId) : Promise.resolve(null),
  ]);

  return <PlayerProfilePage profile={profile} steamId={session.steamId} steamProfile={steamProfiles.get(session.steamId)} isOwnProfile isAuthenticated profileInventory={profileInventory} profileThemeKey={profileThemeKey} settingsOpen={settingsOpen} profileSettings={settings ? { csrf: createProfileActionToken(session), initialSettings: { inventoryVisibility: settings.inventoryVisibility, activeThemeId: settings.activeThemeId, ownedThemes: settings.ownedThemes } } : undefined} />;
}
