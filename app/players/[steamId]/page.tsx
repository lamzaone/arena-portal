import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { notFound } from "next/navigation";

import { PlayerProfilePage } from "@/components/player-profile-page";
import { SiteHeader } from "@/components/site-header";
import { createProfileActionToken, getSession } from "@/lib/auth/session";
import { getPlayerDashboard, getPlayerProfileInventoryPage, getPlayerProfileThemeKey, getPlayerSettings, getPublicPlayerProfile } from "@/lib/data/portal-repository";
import { getSteamProfiles } from "@/lib/steam/profiles";

type PlayerProfilePageProps = {
  params: Promise<{ steamId: string }>;
  searchParams: Promise<{ settings?: string | string[] }>;
};

export default async function PublicPlayerProfilePage({ params, searchParams }: PlayerProfilePageProps) {
  const [{ steamId }, query] = await Promise.all([params, searchParams]);
  if (!/^7656119\d{10}$/.test(steamId)) notFound();

  const session = await getSession();
  const isOwnProfile = session?.steamId === steamId;
  const settingsOpen = Boolean(isOwnProfile && query.settings === "1");
  const [profile, steamProfiles, profileInventory, profileThemeKey, settings] = await Promise.all([
    isOwnProfile ? getPlayerDashboard(steamId) : getPublicPlayerProfile(steamId),
    getSteamProfiles([steamId]),
    getPlayerProfileInventoryPage(session?.steamId ?? null, steamId),
    getPlayerProfileThemeKey(steamId),
    settingsOpen ? getPlayerSettings(steamId) : Promise.resolve(null),
  ]);

  if (!profile) {
    return (
      <main className="tapped-page player-profile-page">
        <div className="shell">
          <SiteHeader authenticated={Boolean(session)} />
          <section className="public-player-empty">
            <Trophy aria-hidden="true" />
            <p className="tapped-kicker">Player profile</p>
            <h1>No ranking record found.</h1>
            <p>This Steam account has not created a K4 LevelRanks record on ARENA.TAPPED.RO yet.</p>
            <Link className="button button-secondary" href="/ranking"><ArrowLeft aria-hidden="true" /> Back to ranking</Link>
          </section>
        </div>
      </main>
    );
  }

  return <PlayerProfilePage profile={profile} steamId={steamId} steamProfile={steamProfiles.get(steamId)} isOwnProfile={Boolean(isOwnProfile)} isAuthenticated={Boolean(session)} profileInventory={profileInventory} profileThemeKey={profileThemeKey} settingsOpen={settingsOpen} profileSettings={settings && session ? { csrf: createProfileActionToken(session), initialSettings: { inventoryVisibility: settings.inventoryVisibility, activeThemeId: settings.activeThemeId, ownedThemes: settings.ownedThemes } } : undefined} />;
}
