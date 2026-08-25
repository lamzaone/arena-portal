import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, Clock3, ShieldCheck, UserRound, VolumeX } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { formatDate, formatPlaytime, isActiveSanction } from "@/components/formatters";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getPlayerDashboard } from "@/lib/data/portal-repository";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Your player dashboard" description="Sign in with Steam to securely view your own ARENA profile and history." />;

  const profile = await getPlayerDashboard(session.steamId);
  const activeBan = profile.bans.find((ban) => isActiveSanction(ban.expiresAt));
  const activeComms = profile.sanctions.filter((sanction) => isActiveSanction(sanction.expiresAt));

  return (
    <main>
      <div className="shell">
        <SiteHeader authenticated />
        <AccountNav current="/dashboard" />

        <section className="page-heading">
          <div>
            <p className="eyebrow"><UserRound aria-hidden="true" /> Steam account</p>
            <h1>{profile.displayName ?? "Your ARENA profile"}</h1>
            <p className="steam-id">SteamID64 · {session.steamId}</p>
          </div>
          <Link className="button button-secondary" href="/skins">Open loadout <ArrowRight aria-hidden="true" /></Link>
        </section>

        {!profile.sourceConnected ? (
          <div className="notice notice-info"><AlertTriangle aria-hidden="true" /><span>Game-data access is not configured yet. Add the read-only <code>GAME_DATABASE_URL</code> from <code>.env.example</code> to populate this profile.</span></div>
        ) : !profile.hasGameRecord ? (
          <div className="notice notice-info"><AlertTriangle aria-hidden="true" /><span>No K4 LevelRanks record exists for this Steam account yet. Join the server once and refresh this page.</span></div>
        ) : null}

        {activeBan && (
          <div className="notice notice-danger"><Ban aria-hidden="true" /><span><strong>You have an active ban.</strong> Appeal it here with your explanation and keep track of staff responses.</span><Link href="/appeals">Open appeal</Link></div>
        )}

        {activeComms.length > 0 && (
          <div className="notice notice-warning"><VolumeX aria-hidden="true" /><span>You currently have {activeComms.length} active communication restriction{activeComms.length === 1 ? "" : "s"}.</span></div>
        )}

        <section className="stat-grid" aria-label="In-game statistics">
          <article><span>Playtime</span><strong>{formatPlaytime(profile.playtimeSeconds)}</strong><Clock3 aria-hidden="true" /></article>
          <article><span>Points</span><strong>{profile.points.toLocaleString()}</strong><ShieldCheck aria-hidden="true" /></article>
          <article><span>Rank</span><strong>#{profile.rank || "—"}</strong><UserRound aria-hidden="true" /></article>
          <article><span>K / D</span><strong>{profile.kills} / {profile.deaths}</strong><span className="stat-foot">{profile.headshots} headshots</span></article>
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-heading"><h2>Groups</h2><p>Synced from VIPCore and Admins.</p></div>
            <div className="group-block"><span>VIP groups</span><div className="tag-list">{profile.vipGroups.length ? profile.vipGroups.map((group) => <b key={group} className="tag tag-vip">{group}</b>) : <em>None</em>}</div></div>
            <div className="group-block"><span>Admin groups</span><div className="tag-list">{profile.adminGroups.length ? profile.adminGroups.map((group) => <b key={group} className="tag tag-admin">{group}</b>) : <em>None</em>}</div></div>
          </article>
          <article className="panel">
            <div className="panel-heading"><h2>Match record</h2><p>From K4 LevelRanks.</p></div>
            <dl className="detail-list">
              <div><dt>Games played</dt><dd>{profile.gamesPlayed}</dd></div>
              <div><dt>Games won</dt><dd>{profile.gameWins}</dd></div>
              <div><dt>Games lost</dt><dd>{profile.gameLosses}</dd></div>
            </dl>
          </article>
        </section>

        <section className="history-section" aria-labelledby="moderation-title">
          <div className="section-heading compact"><p className="eyebrow"><ShieldCheck aria-hidden="true" /> Private record</p><h2 id="moderation-title">Moderation history</h2></div>
          <div className="history-grid">
            <article className="panel history-panel"><div className="panel-heading"><h3>Bans</h3><Link href="/appeals">Appeals <ArrowRight aria-hidden="true" /></Link></div>{profile.bans.length ? <ul className="record-list">{profile.bans.map((ban) => <li key={ban.id}><div><strong>{ban.reason}</strong><span>By {ban.adminName || "Console"} · {formatDate(ban.createdAt)}</span></div><b className={isActiveSanction(ban.expiresAt) ? "badge badge-danger" : "badge"}>{isActiveSanction(ban.expiresAt) ? "Active" : "Expired"}</b></li>)}</ul> : <p className="empty-copy">No ban history found.</p>}</article>
            <article className="panel history-panel"><div className="panel-heading"><h3>Gags & mutes</h3><span>{profile.sanctions.length} record{profile.sanctions.length === 1 ? "" : "s"}</span></div>{profile.sanctions.length ? <ul className="record-list">{profile.sanctions.map((sanction) => <li key={sanction.id}><div><strong>{sanction.kind} · {sanction.reason}</strong><span>By {sanction.adminName || "Console"} · {formatDate(sanction.createdAt)}</span></div><b className={isActiveSanction(sanction.expiresAt) ? "badge badge-warning" : "badge"}>{isActiveSanction(sanction.expiresAt) ? "Active" : "Expired"}</b></li>)}</ul> : <p className="empty-copy">No gag or mute history found.</p>}</article>
            <article className="panel history-panel"><div className="panel-heading"><h3>Kick history</h3><span>Audit bridge</span></div><p className="empty-copy">The current game stack does not persist kicks. The planned Swiftly audit bridge will add kick reasons here without altering your existing moderation tables.</p></article>
          </div>
        </section>
      </div>
    </main>
  );
}
