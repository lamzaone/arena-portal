import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { notFound } from "next/navigation";

import { PlayerProfilePage } from "@/components/player-profile-page";
import { SiteHeader } from "@/components/site-header";
import { createProfileActionToken, getSession } from "@/lib/auth/session";
import { getPlayerDashboard, getPlayerProfileInventoryPage, getPlayerProfileThemeKey, getPlayerSettings, getPublicPlayerProfile } from "@/lib/data/portal-repository";
import { getEffectiveIdentity, reconcileIdentityGroupRewards } from "@/lib/data/identity-groups";
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
  const [profile, steamProfiles, initialProfileInventory, initialProfileThemeKey, initialSettings] = await Promise.all([
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

  let profileInventory = initialProfileInventory;
  let profileThemeKey = initialProfileThemeKey;
  let settings = initialSettings;

  const identity = await getEffectiveIdentity({
    steamId,
    vipGroupNames: profile.vipGroups.map((group) => group.externalKey ?? group.name),
    adminGroupNames: profile.adminGroups.map((group) => group.externalKey ?? group.name),
  });

  // External Admins.Core and VIPCore memberships remain authoritative in the
  // game database. Reconcile their catalogue rewards when that player opens
  // their own authenticated profile; public visitors never trigger grants.
  if (isOwnProfile) {
    const rewardChanges = await reconcileIdentityGroupRewards({
      steamId,
      vipGroupNames: profile.vipGroups.map((group) => group.externalKey ?? group.name),
      adminGroupNames: profile.adminGroups.map((group) => group.externalKey ?? group.name),
    }).catch(() => null);
    if (
      rewardChanges &&
      (rewardChanges.awardedItemIds.length ||
        rewardChanges.restoredItemIds.length ||
        rewardChanges.revokedItemIds.length)
    ) {
      // Re-read the presentation data after a membership transition so this
      // response never renders an item or equipped theme that was just revoked
      // (and newly restored rewards appear without a manual refresh).
      [profileInventory, profileThemeKey, settings] = await Promise.all([
        getPlayerProfileInventoryPage(session?.steamId ?? null, steamId),
        getPlayerProfileThemeKey(steamId),
        settingsOpen ? getPlayerSettings(steamId) : Promise.resolve(null),
      ]);
    }
  }

  return <PlayerProfilePage profile={profile} identity={identity} steamId={steamId} steamProfile={steamProfiles.get(steamId)} isOwnProfile={Boolean(isOwnProfile)} isAuthenticated={Boolean(session)} profileInventory={profileInventory} profileThemeKey={profileThemeKey} settingsOpen={settingsOpen} profileSettings={settings && session ? { csrf: createProfileActionToken(session), initialSettings: { inventoryVisibility: settings.inventoryVisibility, activeThemeId: settings.activeThemeId, activeThemeItemId: settings.activeThemeItemId, ownedThemes: settings.ownedThemes } } : undefined} />;
}
