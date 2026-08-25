import Link from "next/link";
import { ArrowLeft, Ban, Clock3, Crosshair, ShieldCheck, Target, Trophy, UserRound } from "lucide-react";
import { notFound } from "next/navigation";

import { formatPlaytime } from "@/components/formatters";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getLevelRank, getNextLevelRank, getRankProgress } from "@/lib/content/levelranks";
import { getPublicPlayerProfile } from "@/lib/data/portal-repository";
import { getSteamProfiles } from "@/lib/steam/profiles";

type PlayerProfilePageProps = {
  params: Promise<{ steamId: string }>;
};

function avatarInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export default async function PlayerProfilePage({ params }: PlayerProfilePageProps) {
  const { steamId } = await params;
  if (!/^7656119\d{10}$/.test(steamId)) notFound();

  const [session, player, steamProfiles] = await Promise.all([
    getSession(),
    getPublicPlayerProfile(steamId),
    getSteamProfiles([steamId])
  ]);

  if (!player) {
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

  const steamProfile = steamProfiles.get(steamId);
  const displayName = steamProfile?.name ?? player.displayName;
  const levelRank = getLevelRank(player.points);
  const nextLevelRank = getNextLevelRank(player.points);
  const rankProgress = getRankProgress(player.points);
  const kdRatio = player.deaths ? (player.kills / player.deaths).toFixed(2) : player.kills.toFixed(2);
  const headshotPercent = player.kills ? ((player.headshots / player.kills) * 100).toFixed(1) : "0.0";

  return (
    <main className="tapped-page player-profile-page">
      <div className="shell">
        <SiteHeader authenticated={Boolean(session)} />
        <section className="public-player-hero">
          <div className="public-player-copy">
            <Link className="back-link" href="/ranking"><ArrowLeft aria-hidden="true" /> Server ranking</Link>
            <div className="public-player-identity">
              <div className={`public-player-avatar${player.isBanned ? " is-banned" : ""}`}>
                {steamProfile?.avatarFull ? <img src={steamProfile.avatarFull} alt={`${displayName}'s Steam avatar`} referrerPolicy="no-referrer" /> : <span className="public-player-avatar-fallback" aria-hidden="true">{avatarInitial(displayName)}</span>}
                {player.isBanned ? <span className="banned-avatar-overlay">BANNED</span> : null}
              </div>
              <div>
                <p className="tapped-kicker"><UserRound aria-hidden="true" /> Public player profile</p>
                <h1>{displayName}</h1>
                <p>SteamID64 {steamId}</p>
              </div>
            </div>
          </div>
          <aside className="public-rank-card">
            <span>SERVER PLACEMENT</span>
            <strong>#{player.leaderboardPosition}</strong>
            <small>Top player ranking</small>
            <div><span>K4 rank</span><b style={{ color: levelRank.hex }}>{levelRank.tag}</b><small>{levelRank.name}</small></div>
          </aside>
        </section>

        <section className="stat-grid public-player-stat-grid" aria-label={`${displayName}'s public stats`}>
          <article><span>Playtime</span><strong>{formatPlaytime(player.playtimeSeconds)}</strong><Clock3 aria-hidden="true" /></article>
          <article><span>Points</span><strong>{player.points.toLocaleString()}</strong><ShieldCheck aria-hidden="true" /></article>
          <article className="level-rank-stat"><span>K4 rank</span><strong style={{ color: levelRank.hex }}>{levelRank.tag}<span className="server-top-placement">TOP #{player.leaderboardPosition}</span></strong><span className="stat-foot">{levelRank.name}</span></article>
          <article><span>K / D</span><strong>{kdRatio}</strong><span className="stat-foot">{player.kills} kills / {player.deaths} deaths</span></article>
        </section>

        <section className="content-grid public-player-content-grid">
          <article className="panel">
            <div className="panel-heading"><h2>Groups</h2><p>Synced from VIPCore and Admins.</p></div>
            <div className="group-block"><span>VIP groups</span><div className="tag-list">{player.vipGroups.length ? player.vipGroups.map((group) => <b key={group} className="tag tag-vip">{group}</b>) : <em>None</em>}</div></div>
            <div className="group-block"><span>Admin groups</span><div className="tag-list">{player.adminGroups.length ? player.adminGroups.map((group) => <b key={group} className="tag tag-admin">{group}</b>) : <em>None</em>}</div></div>
          </article>
          <article className="panel combat-panel">
            <div className="panel-heading"><h2>Combat profile</h2><p>From K4 LevelRanks.</p></div>
            <div className="combat-stat-grid">
              <div><span>Kills</span><strong>{player.kills.toLocaleString()}</strong><Crosshair aria-hidden="true" /></div>
              <div><span>Deaths</span><strong>{player.deaths.toLocaleString()}</strong><Ban aria-hidden="true" /></div>
              <div><span>Headshot rate</span><strong>{headshotPercent}%</strong><Target aria-hidden="true" /></div>
              <div><span>Noscopes</span><strong>{player.noscopes.toLocaleString()}</strong><UserRound aria-hidden="true" /></div>
            </div>
            <div className="rank-progress" aria-label={`K4 rank progression: ${levelRank.name}`}>
              <div><span>{levelRank.name}</span><strong>{nextLevelRank ? `${Math.max(0, nextLevelRank.points - player.points).toLocaleString()} points to ${nextLevelRank.tag}` : "Highest K4 rank"}</strong></div>
              <div className="rank-progress-track"><i style={{ width: `${rankProgress}%`, backgroundColor: levelRank.hex }} /></div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
