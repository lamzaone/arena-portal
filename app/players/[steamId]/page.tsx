import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { notFound } from "next/navigation";

import { ProfileStaffControls } from "@/components/profile-staff-controls";
import { getAdminAccess, adminWriteConfigured, canActOnTarget } from "@/lib/admin/access";
import { getServerStatus } from "@/lib/server-status";
import { getPlayerArenaStats } from "@/lib/data/player-arena-stats";
import { PlayerProfilePage } from "@/components/player-profile-page";
import { PlayerServerPresence } from "@/components/player-server-presence";
import { getPlayerModerationHistory } from "@/lib/data/player-moderation-history";
import { PortalShell } from "@/components/ui/portal-shell";
import { createAdminActionToken, createProfileActionToken, getSession } from "@/lib/auth/session";
import { getPlayerDashboard, getPlayerProfileInventoryPage, getPlayerProfileThemeKey, getPlayerSettings, getPublicPlayerProfile } from "@/lib/data/portal-repository";
import { getEffectiveIdentity, reconcileIdentityGroupRewards } from "@/lib/data/identity-groups";
import { getPublicDiscordProfileUrl } from "@/lib/discord/public-profile";
import { discordVerifiedGroupKey } from "@/lib/discord/link-service";
import { resolvePlayerIdentities } from "@/lib/player-identities";
import { getSteamProfiles } from "@/lib/steam/profiles";
import { isIndividualSteamId64 } from "@/lib/steam/steam-id";

type PlayerProfilePageProps = {
  params: Promise<{ steamId: string }>;
  searchParams: Promise<{ settings?: string | string[]; notice?: string; error?: string; warningsPage?: string; bansPage?: string; commsPage?: string }>;
};

export default async function PublicPlayerProfilePage({ params, searchParams }: PlayerProfilePageProps) {
  const [{ steamId }, query] = await Promise.all([params, searchParams]);
  if (!isIndividualSteamId64(steamId)) notFound();

  const session = await getSession();
  const isOwnProfile = session?.steamId === steamId;
  const settingsOpen = Boolean(isOwnProfile && query.settings === "1");
  const readPage = (value: string | undefined) => { const page = Number(value); return Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1; };
  const historyPages = { warnings: readPage(query.warningsPage), bans: readPage(query.bansPage), comms: readPage(query.commsPage) };
  const [profile, steamProfiles, initialProfileInventory, initialProfileThemeKey, initialSettings, serverStatus, moderationHistory] = await Promise.all([
    isOwnProfile ? getPlayerDashboard(steamId) : getPublicPlayerProfile(steamId),
    getSteamProfiles([steamId]),
    getPlayerProfileInventoryPage(session?.steamId ?? null, steamId),
    getPlayerProfileThemeKey(steamId),
    settingsOpen ? getPlayerSettings(steamId) : Promise.resolve(null),
    getServerStatus(),
    isOwnProfile ? getPlayerModerationHistory(steamId, historyPages.bans, historyPages.comms) : Promise.resolve(undefined),
  ]);

  if (!profile) {
    const [access, target] = await Promise.all([
      session ? getAdminAccess(session.steamId) : Promise.resolve(null),
      session ? getAdminAccess(steamId) : Promise.resolve(null),
    ]);
    const controls = session && access?.isAdmin && target && (!target.isAdmin || canActOnTarget(access, target))
      ? <ProfileStaffControls steamId={steamId} displayName={steamProfiles.get(steamId)?.name ?? steamId} access={access} csrf={createAdminActionToken(session)} online={serverStatus.state === "online" && serverStatus.roster.some(player => player.steamId === steamId)} writesReady={adminWriteConfigured()} notice={query.notice} error={query.error} /> : null;
    return (
      <PortalShell authenticated={Boolean(session)} className="player-profile-page">
        <section className="public-player-empty">
          <Trophy aria-hidden="true" />
          <p className="tapped-kicker">Player profile</p>
          <PlayerServerPresence steamId={steamId} initialStatus={serverStatus} />
          <h1>No ranking record found.</h1>
          <p>This Steam account has not created a K4 LevelRanks record on ARENA.TAPPED.RO yet.</p>
          <Link className="button button-secondary" href="/ranking"><ArrowLeft aria-hidden="true" /> Back to ranking</Link>
        </section>
        {controls}
      </PortalShell>
    );
  }

  let profileInventory = initialProfileInventory;
  let profileThemeKey = initialProfileThemeKey;
  let settings = initialSettings;

  const moderationActorIds = "bans" in profile
    ? [
        ...(moderationHistory?.bans.records ?? profile.bans).map((ban) => ban.adminSteamId ?? ""),
        ...(moderationHistory?.sanctions.records ?? profile.sanctions).map((sanction) => sanction.adminSteamId ?? ""),
      ]
    : [];
  const [identity, relatedPlayerIdentities, discordProfileUrl] = await Promise.all([
    getEffectiveIdentity({
      steamId,
      vipGroupNames: profile.vipGroups.map((group) => group.externalKey ?? group.name),
      adminGroupNames: profile.adminGroups.map((group) => group.externalKey ?? group.name),
    }),
    resolvePlayerIdentities(
      moderationActorIds.map((actorSteamId) => ({ steamId: actorSteamId })),
    ),
    getPublicDiscordProfileUrl(steamId),
  ]);

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

  const [viewerAccess, targetAccess, arenaStats] = await Promise.all([
    session ? getAdminAccess(session.steamId) : Promise.resolve(null),
    session ? getAdminAccess(steamId) : Promise.resolve(null),
    getPlayerArenaStats(steamId),
  ]);
  const staffControls = session && viewerAccess?.isAdmin && targetAccess && (!targetAccess.isAdmin || canActOnTarget(viewerAccess, targetAccess))
    ? <ProfileStaffControls steamId={steamId} displayName={steamProfiles.get(steamId)?.name ?? profile.displayName ?? steamId} access={viewerAccess} csrf={createAdminActionToken(session)} online={serverStatus?.state === "online" && serverStatus.roster.some(player => player.steamId === steamId)} writesReady={adminWriteConfigured()} notice={query.notice} error={query.error} /> : null;

  return <PlayerProfilePage staffControls={staffControls} arenaStats={arenaStats} profile={profile} identity={identity} steamId={steamId} steamProfile={steamProfiles.get(steamId)} discordProfileUrl={identity.groups.some((group) => group.key === discordVerifiedGroupKey()) ? discordProfileUrl : null} isOwnProfile={Boolean(isOwnProfile)} isAuthenticated={Boolean(session)} profileInventory={profileInventory} profileThemeKey={profileThemeKey} relatedPlayerIdentities={relatedPlayerIdentities} settingsOpen={settingsOpen} initialServerStatus={serverStatus} moderationHistory={moderationHistory} historyPages={historyPages} profileSettings={settings && session ? { csrf: createProfileActionToken(session), initialSettings: { inventoryVisibility: settings.inventoryVisibility, activeThemeId: settings.activeThemeId, activeThemeItemId: settings.activeThemeItemId, ownedThemes: settings.ownedThemes } } : undefined} />;
}
