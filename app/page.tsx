import Link from "next/link";
import { ArrowRight, Check, Crosshair, Crown, Gamepad2, Paintbrush, ShieldCheck, Sparkles, Swords, Trophy, Zap } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getServerStatus } from "@/lib/server-status";

export default async function HomePage() {
  const [session, status] = await Promise.all([getSession(), getServerStatus()]);
  const serverName = process.env.NEXT_PUBLIC_SERVER_NAME ?? "ARENA.TAPPED.RO";
  const connectUrl = process.env.NEXT_PUBLIC_SERVER_CONNECT_URL ?? "steam://connect/arena.tapped.ro";
  const statusLabel = status.state === "online" ? "Online" : status.state === "offline" ? "Offline" : "Status unavailable";
  const playerLabel = status.players !== null && status.maxPlayers !== null ? `${status.players} / ${status.maxPlayers}` : "—";

  return (
    <main className="tapped-page">
      <div className="shell">
        <SiteHeader authenticated={Boolean(session)} />

        <section className="tapped-hero" id="server" aria-labelledby="hero-title">
          <div className="hero-copy hero-reveal">
            <p className="tapped-kicker"><span className="live-line" /> TAPPED.RO <i /> Counter-Strike community</p>
            <h1 id="hero-title">1v1&apos;s<br /><span>with a pulse.</span></h1>
            <p className="tapped-lede">ARENA.TAPPED.RO is built for players who want every round to matter: instant arena fights, custom duels, rewarding ranks, and a loadout that is yours.</p>
            <div className="hero-actions">
              <a className="button button-primary button-large" href={connectUrl}><Gamepad2 aria-hidden="true" /> Connect to ARENA <ArrowRight aria-hidden="true" /></a>
              <Link className="button button-secondary button-large" href={session ? "/dashboard" : "/api/auth/steam"}>{session ? "Open profile" : "Steam login"}</Link>
            </div>
            <div className="hero-meta" aria-label="Server details">
              <span><i /> {serverName}</span>
              <span><i /> EU community server</span>
              <span><i /> Ranked 1v1 focus</span>
            </div>
          </div>

          <aside className="arena-visual hero-reveal hero-delay" aria-label="ARENA.TAPPED.RO live overview">
            <div className="visual-topline"><span>ARENA // LIVE TERMINAL</span><span className={`status-dot status-${status.state}`}><i />{statusLabel}</span></div>
            <div className="visual-core" aria-hidden="true"><div className="core-ring core-ring-one" /><div className="core-ring core-ring-two" /><div className="core-diamond"><Crosshair /></div><span>1V1</span></div>
            <div className="visual-panel visual-panel-one"><small>PLAYERS</small><strong>{playerLabel}</strong></div>
            <div className="visual-panel visual-panel-two"><small>MAP</small><strong>{status.map ?? "Awaiting link"}</strong></div>
            <div className="visual-bottomline"><span><Zap aria-hidden="true" /> Arena system active</span><span>ARENA.TAPPED.RO</span></div>
          </aside>
        </section>

        <section className="mode-intro" id="modes" aria-labelledby="modes-title">
          <div className="section-title hero-reveal"><p className="tapped-kicker"><Sparkles aria-hidden="true" /> The TAPPED.RO loop</p><h2 id="modes-title">Built for the next round.</h2><p>Minimal distractions. More ways to compete. Every feature is designed to keep you in the fight.</p></div>
          <div className="tapped-bento">
            <article className="bento-card bento-arena hero-reveal"><div className="bento-index">01 <span>ARENA</span></div><div className="bento-icon"><Crosshair aria-hidden="true" /></div><h3>Interactive ARENA<br />1v1 system.</h3><p>Move through a live ladder of arena duels. Win, climb, and keep the momentum.</p><div className="arena-readout"><span>01</span><i /><span>02</span><i /><span>03</span><b>LIVE</b></div></article>
            <article className="bento-card bento-duels hero-reveal hero-delay-one"><div className="bento-index">02 <span>DUELS</span></div><div className="bento-icon"><Swords aria-hidden="true" /></div><h3>Make the match yours.</h3><p>Challenge anyone through custom duels with the format you want.</p><ul className="rule-list"><li><Check aria-hidden="true" /> Custom type</li><li><Check aria-hidden="true" /> Single round</li><li><Check aria-hidden="true" /> First to 10 or 20</li><li><Check aria-hidden="true" /> Infinite</li></ul></article>
            <article className="bento-card bento-vip hero-reveal hero-delay-two" id="vip"><div className="bento-index">03 <span>VIP</span></div><div className="bento-icon"><Crown aria-hidden="true" /></div><h3>Earn your edge.</h3><div className="vip-tier"><strong>ULTIMATE</strong><span>Free with <em>arena.tapped.ro</em> in your nickname.</span></div><div className="vip-tier diamond"><strong>DIAMOND</strong><span>Try it free for 24h with <em>/viptest</em>.</span></div></article>
            <article className="bento-card bento-loadout hero-reveal hero-delay-one"><div className="bento-index">04 <span>LOADOUT</span></div><div className="bento-icon"><Paintbrush aria-hidden="true" /></div><h3>Signature setup.</h3><p>Weapon skins, agents, knives, and gloves—saved to your player profile.</p><Link href={session ? "/skins" : "/api/auth/steam"}>Open loadout <ArrowRight aria-hidden="true" /></Link></article>
            <article className="bento-card bento-ranking hero-reveal hero-delay-two" id="rewards"><div className="bento-index">05 <span>RANKING</span></div><div className="bento-icon"><Trophy aria-hidden="true" /></div><div><h3>Climb. Earn.<br /><span>Repeat.</span></h3><p>Track your ranking all month and compete for monthly rewards.</p></div><Link className="rank-link" href={session ? "/dashboard" : "/api/auth/steam"}>View your ranking <ArrowRight aria-hidden="true" /></Link></article>
          </div>
        </section>

        <section className="tapped-account-callout hero-reveal" aria-label="Player portal">
          <div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> TAPPED.RO player hub</p><h2>One identity.<br /><span>Every advantage.</span></h2></div>
          <div className="account-copy"><p>Use Steam to track your rank, VIP and admin groups, loadout, support tickets, and moderation history—all in one private player profile.</p><Link className="button button-primary" href={session ? "/dashboard" : "/api/auth/steam"}>{session ? "Open dashboard" : "Create your profile"} <ArrowRight aria-hidden="true" /></Link></div>
        </section>

        <footer className="tapped-footer"><span>TAPPED.RO <i /> ARENA.TAPPED.RO</span><a href={connectUrl}>Connect now <ArrowRight aria-hidden="true" /></a></footer>
      </div>
    </main>
  );
}
