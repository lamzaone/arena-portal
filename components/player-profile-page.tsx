import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, Clock3, Crosshair, ShieldCheck, Target, UserRound, VolumeX } from "lucide-react";
import type { CSSProperties } from "react";

import { formatDate, formatPlaytime, isActiveSanction } from "@/components/formatters";
import { GroupBadge } from "@/components/group-badge";
import { ResilientRemoteImage } from "@/components/resilient-remote-image";
import { SiteHeader } from "@/components/site-header";
import { getLevelRank, getNextLevelRank, getRankProgress } from "@/lib/content/levelranks";
import { getGroupPresentation, type RoleKind } from "@/lib/content/group-presentation";
import type { GroupMembership, HitboxStats, PlayerDashboard, PublicPlayerProfile } from "@/lib/data/portal-repository";
import type { SteamProfile } from "@/lib/steam/profiles";

type SharedProfile = PlayerDashboard | PublicPlayerProfile;

type PlayerProfilePageProps = {
  profile: SharedProfile;
  steamId: string;
  steamProfile?: SteamProfile;
  isOwnProfile: boolean;
  isAuthenticated: boolean;
};

type Hitbox = {
  key: keyof Pick<HitboxStats, "head" | "chest" | "stomach" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg" | "neck">;
  label: string;
};

const hitboxes: Hitbox[] = [
  { key: "head", label: "Head" },
  { key: "neck", label: "Neck" },
  { key: "chest", label: "Chest" },
  { key: "stomach", label: "Stomach" },
  { key: "leftArm", label: "Left arm" },
  { key: "rightArm", label: "Right arm" },
  { key: "leftLeg", label: "Left leg" },
  { key: "rightLeg", label: "Right leg" }
];

// The Node renderer and a player's browser can have different default locales.
// Keep shared SSR/client number text deterministic for hydration.
const countFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatCount(value: number) {
  return countFormatter.format(value);
}

function avatarInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function isDashboard(profile: SharedProfile): profile is PlayerDashboard {
  return "hasGameRecord" in profile;
}

function hitIntensity(value: number, total: number) {
  if (!total || !value) return 0.13;
  return Math.min(1, 0.25 + (value / total) * 3.2);
}

function HitMap({ stats }: { stats: HitboxStats }) {
  const max = Math.max(stats.totalHits, 1);
  const cells = hitboxes.map((hitbox) => ({ ...hitbox, value: stats[hitbox.key], percent: stats.totalHits ? (stats[hitbox.key] / stats.totalHits) * 100 : 0 }));

  return (
    <article className="panel hit-map-panel">
      <div className="panel-heading"><div><h2>Hit distribution</h2><p>Real K4 LevelRanks hitgroup data.</p></div><span>{formatCount(stats.totalHits)} hits</span></div>
      {stats.totalHits ? <div className="hit-map-layout">
        <figure className="hit-map-figure">
          <svg className="hit-map-body" viewBox="0 0 180 350" role="img" aria-labelledby="hit-map-title hit-map-description">
            <title id="hit-map-title">Body hit distribution</title>
            <desc id="hit-map-description">A body outline coloured by recorded K4 LevelRanks hitgroup totals.</desc>
            <path className="hit-map-outline" d="M90 12c-16 0-28 13-28 29 0 10 5 19 12 24l-7 17-27 17-12 61 22 5 8-45 12 5-10 57 2 45 14 12 3 82h22l3-82 14-12 2-45-10-57 12-5 8 45 22-5-12-61-27-17-7-17c7-5 12-14 12-24 0-16-12-29-28-29Z" />
            <circle className="hitbox hitbox-head" cx="90" cy="40" r="25" style={{ "--hit-intensity": hitIntensity(stats.head, max) } as CSSProperties}><title>{`Head: ${formatCount(stats.head)} hits`}</title></circle>
            <rect className="hitbox hitbox-neck" x="78" y="65" width="24" height="18" rx="7" style={{ "--hit-intensity": hitIntensity(stats.neck, max) } as CSSProperties}><title>{`Neck: ${formatCount(stats.neck)} hits`}</title></rect>
            <path className="hitbox hitbox-chest" d="M62 86h56l10 24-10 57H62l-10-57Z" style={{ "--hit-intensity": hitIntensity(stats.chest, max) } as CSSProperties}><title>{`Chest: ${formatCount(stats.chest)} hits`}</title></path>
            <path className="hitbox hitbox-stomach" d="M66 170h48l-5 51H71Z" style={{ "--hit-intensity": hitIntensity(stats.stomach, max) } as CSSProperties}><title>{`Stomach: ${formatCount(stats.stomach)} hits`}</title></path>
            <path className="hitbox hitbox-left-arm" d="M50 95 35 106l-11 55 20 4 12-48 12 7-8 46-13 11-6-14-9 50 19 4 14-63 9-47Z" style={{ "--hit-intensity": hitIntensity(stats.leftArm, max) } as CSSProperties}><title>{`Left arm: ${formatCount(stats.leftArm)} hits`}</title></path>
            <path className="hitbox hitbox-right-arm" d="m130 95 15 11 11 55-20 4-12-48-12 7 8 46 13 11 6-14 9 50-19 4-14-63-9-47Z" style={{ "--hit-intensity": hitIntensity(stats.rightArm, max) } as CSSProperties}><title>{`Right arm: ${formatCount(stats.rightArm)} hits`}</title></path>
            <path className="hitbox hitbox-left-leg" d="m72 224 17 2-2 100H64l-8-70Z" style={{ "--hit-intensity": hitIntensity(stats.leftLeg, max) } as CSSProperties}><title>{`Left leg: ${formatCount(stats.leftLeg)} hits`}</title></path>
            <path className="hitbox hitbox-right-leg" d="m91 226 17-2 16 32-8 70H93Z" style={{ "--hit-intensity": hitIntensity(stats.rightLeg, max) } as CSSProperties}><title>{`Right leg: ${formatCount(stats.rightLeg)} hits`}</title></path>
          </svg>
          <figcaption>Brighter zones received more hits.</figcaption>
        </figure>
        <div className="hit-map-list" aria-label="Hit distribution details">
          {cells.map((cell) => <div key={cell.key}><span><i style={{ "--hit-intensity": hitIntensity(cell.value, max) } as CSSProperties} aria-hidden="true" />{cell.label}</span><strong>{formatCount(cell.value)}</strong><small>{cell.percent.toFixed(1)}%</small></div>)}
        </div>
      </div> : <p className="empty-copy">Hitgroup tracking has no saved hits for this player yet. K4 LevelRanks will populate this after combat damage is recorded.</p>}
      <div className="hit-map-damage"><span>Health damage <strong>{formatCount(stats.healthDamage)}</strong></span><span>Armor damage <strong>{formatCount(stats.armorDamage)}</strong></span></div>
    </article>
  );
}

function GroupMembershipCards({ kind, groups }: { kind: RoleKind; groups: GroupMembership[] }) {
  const label = kind === "vip" ? "VIP privileges" : "Admin ranks";
  return <section className={`group-role-section group-role-${kind}`}>
    <div><h3>{label}</h3><small>{groups.length ? `${groups.length} active` : "None assigned"}</small></div>
    {groups.length ? <div className="group-membership-cards">{groups.map((group) => {
      const presentation = getGroupPresentation(kind, group.name);
      const expiry = kind === "vip" ? group.expiresAt === 0 ? "Permanent access" : group.expiresAt ? `Expires ${formatDate(group.expiresAt)}` : "Expiry unavailable" : "Admin rank";
      return <article key={`${kind}-${group.name.toLowerCase()}`} style={{ "--role-color": presentation.color, "--role-soft": presentation.softColor } as CSSProperties}><GroupBadge kind={kind} group={group.name} /><small>{expiry}</small></article>;
    })}</div> : <p className="group-role-empty">No {kind === "vip" ? "VIP groups" : "admin ranks"} assigned.</p>}
  </section>;
}

export function PlayerProfilePage({ profile, steamId, steamProfile, isOwnProfile, isAuthenticated }: PlayerProfilePageProps) {
  const displayName = steamProfile?.name ?? profile.displayName ?? "ARENA player";
  const dashboard = isDashboard(profile) ? profile : null;
  const activeBan = dashboard?.bans.find((ban) => isActiveSanction(ban.expiresAt));
  const activeComms = dashboard?.sanctions.filter((sanction) => isActiveSanction(sanction.expiresAt)) ?? [];
  const isBanned = Boolean(activeBan) || (isDashboard(profile) ? false : profile.isBanned);
  const levelRank = getLevelRank(profile.points);
  const nextLevelRank = getNextLevelRank(profile.points);
  const rankProgress = getRankProgress(profile.points);
  const kdRatio = profile.deaths ? (profile.kills / profile.deaths).toFixed(2) : profile.kills.toFixed(2);
  const headshotPercent = profile.kills ? ((profile.headshots / profile.kills) * 100).toFixed(1) : "0.0";
  const placement = profile.leaderboardPosition ?? "—";
  const formattedPlacementTotal = profile.leaderboardTotal
    ? formatCount(profile.leaderboardTotal)
    : "No rank";
  const steamProfileUrl = `https://steamcommunity.com/profiles/${steamId}`;
  const presence = steamProfile?.presence ?? "unknown";
  const presenceLabel = presence === "online" ? "Steam online" : presence === "offline" ? "Steam offline" : "Steam status unavailable";

  return (
    <main className="tapped-page player-profile-page">
      <div className="shell">
        <SiteHeader authenticated={isAuthenticated} />
        <section className="public-player-hero shared-profile-hero">
          <div className="public-player-copy">
            {!isOwnProfile ? <Link className="back-link" href="/ranking"><ArrowLeft aria-hidden="true" /> Server ranking</Link> : null}
            <div className="public-player-identity" data-presence={presence}>
              <div className={`public-player-avatar${isBanned ? " is-banned" : ""}`}>
                <ResilientRemoteImage src={steamProfile?.avatarFull} alt={`${displayName}'s Steam avatar`} referrerPolicy="no-referrer" fallback={<span className="public-player-avatar-fallback" aria-hidden="true">{avatarInitial(displayName)}</span>} />
                {isBanned ? <span className="banned-avatar-overlay">BANNED</span> : null}
              </div>
              <div>
                <p className="tapped-kicker"><UserRound aria-hidden="true" /> {isOwnProfile ? "Your player profile" : "Player profile"}<span className="profile-presence" title={presenceLabel}><i aria-hidden="true" /> {presenceLabel}</span></p>
                <h1>{displayName}</h1>
                <a className="public-player-steam-identity" href={steamProfileUrl} target="_blank" rel="noreferrer" title={`Open ${displayName}'s Steam profile`}>{steamId}</a>
              </div>
            </div>
          </div>
          <aside className="public-rank-card">
            <span>SERVER PLACEMENT</span>
            <strong>#{profile.leaderboardPosition ?? "-"}</strong>
            <small>Top player ranking</small>
            <div><span>K4 rank</span><b style={{ color: levelRank.hex }}>{levelRank.tag}</b><small>{levelRank.name}</small></div>
            {isOwnProfile ? <Link className="button button-secondary profile-loadout-link" href="/inventory">Open inventory <ArrowRight aria-hidden="true" /></Link> : null}
          </aside>
        </section>

        {isOwnProfile && dashboard && (!dashboard.sourceConnected ? <div className="notice notice-info"><AlertTriangle aria-hidden="true" /><span>Game-data access is not configured yet. Add <code>GAME_DATABASE_URL</code> to populate this profile.</span></div> : !dashboard.hasGameRecord ? <div className="notice notice-info"><AlertTriangle aria-hidden="true" /><span>No K4 LevelRanks record exists for this Steam account yet. Join the server once and refresh this page.</span></div> : null)}
        {isOwnProfile && activeBan ? <div className="notice notice-danger"><Ban aria-hidden="true" /><span><strong>You have an active ban.</strong> Appeal it here with your explanation and keep track of staff responses.</span><Link href="/appeals">Open appeal</Link></div> : null}
        {isOwnProfile && activeComms.length > 0 ? <div className="notice notice-warning"><VolumeX aria-hidden="true" /><span>You currently have {activeComms.length} active communication restriction{activeComms.length === 1 ? "" : "s"}.</span></div> : null}

        <section className="stat-grid public-player-stat-grid" aria-label={`${displayName}'s statistics`}>
          <article><span>Playtime</span><strong>{formatPlaytime(profile.playtimeSeconds)}</strong><Clock3 aria-hidden="true" /></article>
          <article className="profile-points-stat" style={{ "--level-rank-color": levelRank.hex } as CSSProperties}><span>Points</span><strong>{levelRank.name}</strong><span className="stat-foot">{formatCount(profile.points)} total points</span><ShieldCheck aria-hidden="true" /></article>
          <article className="level-rank-stat"><span>K4 rank</span><strong>RANKED #{placement}</strong><span className="stat-foot">out of {formattedPlacementTotal}</span></article>
          <article><span>K / D</span><strong>{kdRatio}</strong><span className="stat-foot">{profile.kills} kills / {profile.deaths} deaths</span></article>
        </section>

        <section className="content-grid public-player-content-grid shared-profile-content">
          <article className="panel">
            <div className="panel-heading"><h2>Groups</h2><p>Synced from VIPCore and Admins.</p></div>
            <div className="group-role-sections"><GroupMembershipCards kind="vip" groups={profile.vipGroups} /><GroupMembershipCards kind="admin" groups={profile.adminGroups} /></div>
          </article>
          <article className="panel combat-panel">
            <div className="panel-heading"><h2>Combat profile</h2><p>From K4 LevelRanks.</p></div>
            <div className="combat-stat-grid">
              <div><span>Kills</span><strong>{formatCount(profile.kills)}</strong><Crosshair aria-hidden="true" /></div>
              <div><span>Deaths</span><strong>{formatCount(profile.deaths)}</strong><Ban aria-hidden="true" /></div>
              <div><span>Headshot rate</span><strong>{headshotPercent}%</strong><Target aria-hidden="true" /></div>
              <div><span>Noscopes</span><strong>{formatCount(profile.noscopes)}</strong><UserRound aria-hidden="true" /></div>
            </div>
            <div className="rank-progress" aria-label={`K4 rank progression: ${levelRank.name}`}><div><span>{levelRank.name}</span><strong>{nextLevelRank ? `${formatCount(Math.max(0, nextLevelRank.points - profile.points))} points to ${nextLevelRank.tag}` : "Highest K4 rank"}</strong></div><div className="rank-progress-track"><i style={{ width: `${rankProgress}%`, backgroundColor: levelRank.hex }} /></div></div>
          </article>
          <HitMap stats={profile.hitStats} />
        </section>

        {isOwnProfile && dashboard ? <section className="history-section" aria-labelledby="moderation-title">
          <div className="section-heading compact"><p className="eyebrow"><ShieldCheck aria-hidden="true" /> Private record</p><h2 id="moderation-title">Moderation history</h2></div>
          <div className="history-grid">
            <article className="panel history-panel"><div className="panel-heading"><h3>Bans</h3><Link href="/appeals">Appeals <ArrowRight aria-hidden="true" /></Link></div>{dashboard.bans.length ? <ul className="record-list">{dashboard.bans.map((ban) => <li key={ban.id}><div><strong>{ban.reason}</strong><span>By {ban.adminSteamId ? <Link href={`/players/${ban.adminSteamId}`}>{ban.adminName || "Admin"}</Link> : ban.adminName || "Console"} · {formatDate(ban.createdAt)}</span></div><b className={isActiveSanction(ban.expiresAt) ? "badge badge-danger" : "badge"}>{isActiveSanction(ban.expiresAt) ? "Active" : "Expired"}</b></li>)}</ul> : <p className="empty-copy">No ban history found.</p>}</article>
            <article className="panel history-panel"><div className="panel-heading"><h3>Gags &amp; mutes</h3><span>{dashboard.sanctions.length} record{dashboard.sanctions.length === 1 ? "" : "s"}</span></div>{dashboard.sanctions.length ? <ul className="record-list">{dashboard.sanctions.map((sanction) => <li key={sanction.id}><div><strong>{sanction.kind} · {sanction.reason}</strong><span>By {sanction.adminSteamId ? <Link href={`/players/${sanction.adminSteamId}`}>{sanction.adminName || "Admin"}</Link> : sanction.adminName || "Console"} · {formatDate(sanction.createdAt)}</span></div><b className={isActiveSanction(sanction.expiresAt) ? "badge badge-warning" : "badge"}>{isActiveSanction(sanction.expiresAt) ? "Active" : "Expired"}</b></li>)}</ul> : <p className="empty-copy">No gag or mute history found.</p>}</article>
            <article className="panel history-panel"><div className="panel-heading"><h3>Kick history</h3><span>Audit bridge</span></div><p className="empty-copy">The current game stack does not persist kicks. The Swiftly audit bridge can add kick reasons here without changing existing moderation tables.</p></article>
          </div>
        </section> : null}
      </div>
    </main>
  );
}
