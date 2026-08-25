import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, Clock3, Crosshair, ShieldCheck, Target, UserRound, VolumeX } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { formatDate, formatPlaytime, isActiveSanction } from "@/components/formatters";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getLevelRank, getNextLevelRank, getRankProgress } from "@/lib/content/levelranks";
import { getPlayerDashboard } from "@/lib/data/portal-repository";
import { getSteamProfiles } from "@/lib/steam/profiles";

function avatarInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Your player dashboard" description="Sign in with Steam to securely view your own ARENA profile and history." />;

  const [profile, steamProfiles] = await Promise.all([
    getPlayerDashboard(session.steamId),
    getSteamProfiles([session.steamId])
  ]);
  const steamProfile = steamProfiles.get(session.steamId);
  const displayName = steamProfile?.name ?? profile.displayName ?? "Your ARENA profile";
  const activeBan = profile.bans.find((ban) => isActiveSanction(ban.expiresAt));
  const activeComms = profile.sanctions.filter((sanction) => isActiveSanction(sanction.expiresAt));
  const levelRank = getLevelRank(profile.points);
  const nextLevelRank = getNextLevelRank(profile.points);
  const rankProgress = getRankProgress(profile.points);
  const kdRatio = profile.deaths ? (profile.kills / profile.deaths).toFixed(2) : profile.kills.toFixed(2);
  const headshotPercent = profile.kills ? ((profile.headshots / profile.kills) * 100).toFixed(1) : "0.0";

  return (
    <main>
      <div className="shell">
        <SiteHeader authenticated />
        <AccountNav current="/dashboard" />

        <section className="page-heading">
          <div className="profile-identity">
            <div className={`profile-steam-avatar-wrap${activeBan ? " is-banned" : ""}`}>
              {steamProfile?.avatarFull ? <img className="profile-steam-avatar" src={steamProfile.avatarFull} alt={`${displayName}'s Steam avatar`} referrerPolicy="no-referrer" /> : <span className="profile-steam-avatar profile-steam-avatar-fallback" aria-hidden="true">{avatarInitial(displayName)}</span>}
              {activeBan ? <span className="banned-avatar-overlay">BANNED</span> : null}
            </div>
            <div>
              <p className="eyebrow"><UserRound aria-hidden="true" /> Steam account</p>
              <h1>{displayName}</h1>
              <p className="steam-id">SteamID64 - {session.steamId}</p>
            </div>
          </div>
          <Link className="button button-secondary" href="/skins">Open loadout <ArrowRight aria-hidden="true" /></Link>
        </section>

        {!profile.sourceConnected ? <div className="notice notice-info"><AlertTriangle aria-hidden="true" /><span>Game-data access is not configured yet. Add <code>GAME_DATABASE_URL</code> to populate this profile.</span></div> : !profile.hasGameRecord ? <div className="notice notice-info"><AlertTriangle aria-hidden="true" /><span>No K4 LevelRanks record exists for this Steam account yet. Join the server once and refresh this page.</span></div> : null}
        {activeBan && <div className="notice notice-danger"><Ban aria-hidden="true" /><span><strong>You have an active ban.</strong> Appeal it here with your explanation and keep track of staff responses.</span><Link href="/appeals">Open appeal</Link></div>}
        {activeComms.length > 0 && <div className="notice notice-warning"><VolumeX aria-hidden="true" /><span>You currently have {activeComms.length} active communication restriction{activeComms.length === 1 ? "" : "s"}.</span></div>}

        <section className="stat-grid" aria-label="In-game statistics">
          <article><span>Playtime</span><strong>{formatPlaytime(profile.playtimeSeconds)}</strong><Clock3 aria-hidden="true" /></article>
          <article><span>Points</span><strong>{profile.points.toLocaleString()}</strong><ShieldCheck aria-hidden="true" /></article>
          <article className="level-rank-stat"><span>K4 rank</span><strong style={{ color: levelRank.hex }}>{levelRank.tag}<span className="server-top-placement">TOP #{profile.leaderboardPosition ?? "-"}</span></strong><span className="stat-foot">{levelRank.name}</span></article>
          <article><span>K / D</span><strong>{kdRatio}</strong><span className="stat-foot">{profile.kills} kills / {profile.deaths} deaths</span></article>
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-heading"><h2>Groups</h2><p>Synced from VIPCore and Admins.</p></div>
            <div className="group-block"><span>VIP groups</span><div className="tag-list">{profile.vipGroups.length ? profile.vipGroups.map((group) => <b key={group} className="tag tag-vip">{group}</b>) : <em>None</em>}</div></div>
            <div className="group-block"><span>Admin groups</span><div className="tag-list">{profile.adminGroups.length ? profile.adminGroups.map((group) => <b key={group} className="tag tag-admin">{group}</b>) : <em>None</em>}</div></div>
          </article>
          <article className="panel combat-panel">
            <div className="panel-heading"><h2>Combat profile</h2><p>From K4 LevelRanks.</p></div>
            <div className="combat-stat-grid">
              <div><span>Kills</span><strong>{profile.kills.toLocaleString()}</strong><Crosshair aria-hidden="true" /></div>
              <div><span>Deaths</span><strong>{profile.deaths.toLocaleString()}</strong><Ban aria-hidden="true" /></div>
              <div><span>Headshot rate</span><strong>{headshotPercent}%</strong><Target aria-hidden="true" /></div>
              <div><span>Noscopes</span><strong>{profile.noscopes.toLocaleString()}</strong><UserRound aria-hidden="true" /></div>
            </div>
            <div className="rank-progress" aria-label={`K4 rank progression: ${levelRank.name}`}>
              <div><span>{levelRank.name}</span><strong>{nextLevelRank ? `${Math.max(0, nextLevelRank.points - profile.points).toLocaleString()} points to ${nextLevelRank.tag}` : "Highest K4 rank"}</strong></div>
              <div className="rank-progress-track"><i style={{ width: `${rankProgress}%`, backgroundColor: levelRank.hex }} /></div>
            </div>
          </article>
        </section>

        <section className="history-section" aria-labelledby="moderation-title">
          <div className="section-heading compact"><p className="eyebrow"><ShieldCheck aria-hidden="true" /> Private record</p><h2 id="moderation-title">Moderation history</h2></div>
          <div className="history-grid">
            <article className="panel history-panel"><div className="panel-heading"><h3>Bans</h3><Link href="/appeals">Appeals <ArrowRight aria-hidden="true" /></Link></div>{profile.bans.length ? <ul className="record-list">{profile.bans.map((ban) => <li key={ban.id}><div><strong>{ban.reason}</strong><span>By {ban.adminName || "Console"} - {formatDate(ban.createdAt)}</span></div><b className={isActiveSanction(ban.expiresAt) ? "badge badge-danger" : "badge"}>{isActiveSanction(ban.expiresAt) ? "Active" : "Expired"}</b></li>)}</ul> : <p className="empty-copy">No ban history found.</p>}</article>
            <article className="panel history-panel"><div className="panel-heading"><h3>Gags &amp; mutes</h3><span>{profile.sanctions.length} record{profile.sanctions.length === 1 ? "" : "s"}</span></div>{profile.sanctions.length ? <ul className="record-list">{profile.sanctions.map((sanction) => <li key={sanction.id}><div><strong>{sanction.kind} - {sanction.reason}</strong><span>By {sanction.adminName || "Console"} - {formatDate(sanction.createdAt)}</span></div><b className={isActiveSanction(sanction.expiresAt) ? "badge badge-warning" : "badge"}>{isActiveSanction(sanction.expiresAt) ? "Active" : "Expired"}</b></li>)}</ul> : <p className="empty-copy">No gag or mute history found.</p>}</article>
            <article className="panel history-panel"><div className="panel-heading"><h3>Kick history</h3><span>Audit bridge</span></div><p className="empty-copy">The current game stack does not persist kicks. The planned Swiftly audit bridge will add kick reasons here without altering your existing moderation tables.</p></article>
          </div>
        </section>
      </div>
    </main>
  );
}
