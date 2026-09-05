import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Crosshair, Crown, Gamepad2, Paintbrush, ShieldCheck, Sparkles, Swords, Trophy } from "lucide-react";

import { LiveServerPanel } from "@/components/live-server-panel";
import { PortalShell } from "@/components/ui/portal-shell";
import { getSession } from "@/lib/auth/session";
import { buildHomeMetadata, buildHomeStructuredData } from "@/lib/seo/site";

export const metadata: Metadata = buildHomeMetadata();

export default async function HomePage() {
  const session = await getSession();
  const serverName = process.env.NEXT_PUBLIC_SERVER_NAME ?? "ARENA.TAPPED.RO";
  const connectUrl = process.env.NEXT_PUBLIC_SERVER_CONNECT_URL ?? "steam://connect/arena.tapped.ro";
  const structuredData = buildHomeStructuredData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <PortalShell authenticated={Boolean(session)} className="home-page">

        <section className="tapped-hero" id="server" aria-labelledby="hero-title">
          <div className="hero-copy hero-reveal">
            <p className="tapped-kicker"><span className="live-line" /> TAPPED.RO <i /> Counter-Strike community</p>
            <h1 id="hero-title">Romania&apos;s CS2<br /><span>arena server.</span></h1>
            <p className="tapped-lede">TAPPED.RO is a competitive Counter-Strike 2 arena server in Romania, built for players who want every round to matter: instant ranked 1v1 fights, custom duels, monthly rewards, and personal loadouts.</p>
            <div className="hero-actions">
              <a className="button button-primary button-large" href={connectUrl}><Gamepad2 aria-hidden="true" /> Connect to ARENA <ArrowRight aria-hidden="true" /></a>
              {session ? (
                <Link className="button button-secondary button-large" href={`/players/${session.steamId}`}>Open profile</Link>
              ) : (
                <a className="button button-secondary button-large" href="/api/auth/steam">Steam login</a>
              )}
            </div>
            <div className="hero-meta" aria-label="Server details">
              <span><i /> {serverName}</span>
              <span><i /> Romania · EU community</span>
              <span><i /> Ranked 1v1 focus</span>
            </div>
          </div>

          <LiveServerPanel />
        </section>

        <section className="mode-intro" id="modes" aria-labelledby="modes-title">
          <div className="section-title hero-reveal"><p className="tapped-kicker"><Sparkles aria-hidden="true" /> The TAPPED.RO loop</p><h2 id="modes-title">Built for the next round.</h2><p>Fast CS2 1v1 rounds, custom challenges, and progression designed to keep you in the fight.</p></div>
          <div className="tapped-bento">
            <article className="bento-card bento-arena hero-reveal"><div className="bento-index">01 <span>ARENA</span></div><div className="bento-icon"><Crosshair aria-hidden="true" /></div><h3>Interactive ARENA<br />1v1 system.</h3><p>Move through a live ladder of arena duels. Win, climb, and keep the momentum.</p><Link className="bento-link" href="/modes">Explore arena modes <ArrowRight aria-hidden="true" /></Link><div className="arena-readout"><span>01</span><i /><span>02</span><i /><span>03</span><b>LIVE</b></div></article>
            <article className="bento-card bento-duels hero-reveal hero-delay-one"><div className="bento-index">02 <span>DUELS</span></div><div className="bento-icon"><Swords aria-hidden="true" /></div><h3>Make the match yours.</h3><p>Challenge anyone through custom duels with the format you want.</p><ul className="rule-list"><li><Check aria-hidden="true" /> Custom type</li><li><Check aria-hidden="true" /> Single round</li><li><Check aria-hidden="true" /> First to 10 or 20</li><li><Check aria-hidden="true" /> Infinite</li></ul><Link className="bento-link" href="/modes#duels">All duel features <ArrowRight aria-hidden="true" /></Link></article>
            <article className="bento-card bento-vip hero-reveal hero-delay-two" id="vip"><div className="bento-index">03 <span>VIP</span></div><div className="bento-icon"><Crown aria-hidden="true" /></div><h3>Earn your edge.</h3><div className="vip-tier"><strong>ULTIMATE</strong><span>Free with <em>arena.tapped.ro</em> in your nickname.</span></div><div className="vip-tier diamond"><strong>DIAMOND</strong><span>Try it free for 24h with <em>/viptest</em>.</span></div><Link className="bento-link" href="/vip">View every VIP benefit <ArrowRight aria-hidden="true" /></Link></article>
            <article className="bento-card bento-loadout hero-reveal hero-delay-one"><div className="bento-index">04 <span>INVENTORY</span></div><div className="bento-icon"><Paintbrush aria-hidden="true" /></div><h3>Earn. Unbox. Equip.</h3><p>Build a personal collection with Tokens, drops, crates, and tradable cosmetics.</p>{session ? <Link href="/inventory">Open inventory <ArrowRight aria-hidden="true" /></Link> : <a href="/api/auth/steam">Open inventory <ArrowRight aria-hidden="true" /></a>}</article>
            <article className="bento-card bento-ranking hero-reveal hero-delay-two" id="rewards"><div className="bento-index">05 <span>RANKING</span></div><div className="bento-icon"><Trophy aria-hidden="true" /></div><div><h3>Climb. Earn.<br /><span>Repeat.</span></h3><p>Track your ranking all month and compete for monthly rewards.</p></div><Link className="rank-link" href="/ranking">View the leaderboard <ArrowRight aria-hidden="true" /></Link></article>
          </div>
        </section>

        <section className="tapped-account-callout hero-reveal" aria-label="Player portal">
          <div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> TAPPED.RO player hub</p><h2>One identity.<br /><span>Every advantage.</span></h2></div>
          <div className="account-copy"><p>Use Steam to track your rank, VIP and admin groups, loadout, support tickets, and moderation history—all in one player profile.</p>{session ? <Link className="button button-primary" href={`/players/${session.steamId}`}>Open profile <ArrowRight aria-hidden="true" /></Link> : <a className="button button-primary" href="/api/auth/steam">Create your profile <ArrowRight aria-hidden="true" /></a>}</div>
        </section>

        <footer className="tapped-footer"><span>TAPPED.RO <i /> ARENA.TAPPED.RO</span><a href={connectUrl}>Connect now <ArrowRight aria-hidden="true" /></a></footer>
      </PortalShell>
    </>
  );
}
