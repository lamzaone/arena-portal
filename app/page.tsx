import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Crosshair, Crown, Gamepad2, Paintbrush, ShieldCheck, Sparkles, Swords, Trophy } from "lucide-react";

import { BrandEmblem } from "@/components/brand-emblem";
import { DiscordCommunityPanel } from "@/components/discord-community-panel";
import { ArenaBrandScene } from "@/components/home/arena-brand-scene";
import { LiveServerPanel } from "@/components/live-server-panel";
import { PortalShell } from "@/components/ui/portal-shell";
import { getSession } from "@/lib/auth/session";
import { buildHomeMetadata, buildHomeStructuredData } from "@/lib/seo/site";
import styles from "./home.module.css";

export const metadata: Metadata = buildHomeMetadata();

export default async function HomePage() {
  const session = await getSession();
  const serverName = process.env.NEXT_PUBLIC_SERVER_NAME ?? "ARENA.TAPPED.RO";
  const connectUrl = process.env.NEXT_PUBLIC_SERVER_CONNECT_URL ?? "steam://connect/arena.tapped.ro";
  const profileUrl = session ? `/players/${session.steamId}` : "/api/auth/steam";

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildHomeStructuredData()).replace(/</g, "\\u003c") }} />
      <PortalShell authenticated={Boolean(session)} className="home-page">
        <div className={styles.home}>
          <section className={styles.hero} id="server" aria-labelledby="hero-title">
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span /> Counter-Strike 2 · Romania</p>
              <h1 id="hero-title">Your next round.<br /><span>Your arena.</span></h1>
              <p className={styles.lede}>Fast 1v1 rounds. A rival worth beating. A collection that&apos;s yours. Welcome to <strong>{serverName}</strong>.</p>
              <div className={styles.actions}>
                <a className="button button-primary button-large" href={connectUrl}><Gamepad2 aria-hidden="true" /> Play on ARENA <ArrowUpRight aria-hidden="true" /></a>
                <Link className="button button-secondary button-large" href="/features">Explore features <ArrowRight aria-hidden="true" /></Link>
              </div>
              <div className={styles.heroDetails}><span>Ranked arena rounds</span><span>Custom duels</span><span>One connected player hub</span></div>
              <a className={styles.scrollLink} href="#live"><span><ArrowDown aria-hidden="true" /></span>See what&apos;s happening</a>
            </div>
            <ArenaBrandScene />
          </section>
          <nav className={styles.shortcuts} aria-label="Player shortcuts">
            <Link href="/ranking"><Trophy aria-hidden="true" /><span>Rankings<small>Follow the climb</small></span><ArrowUpRight aria-hidden="true" /></Link>
            <Link href={session ? "/inventory" : "/api/auth/steam"}><Paintbrush aria-hidden="true" /><span>Your collection<small>Open, trade, equip</small></span><ArrowUpRight aria-hidden="true" /></Link>
            <Link href="/vip"><Crown aria-hidden="true" /><span>Memberships<small>Find your benefits</small></span><ArrowUpRight aria-hidden="true" /></Link>
            <Link href={profileUrl}><ShieldCheck aria-hidden="true" /><span>{session ? "Your profile" : "Steam sign-in"}<small>Your progress, together</small></span><ArrowUpRight aria-hidden="true" /></Link>
          </nav>
          <section className={styles.liveSection} id="live" aria-labelledby="live-title">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}><span /> The community, right now</p><h2 id="live-title">One server. <span>Always a story.</span></h2></div><p>See the arena as it happens.<br />Keep the conversation going on Discord.</p></div>
            <div className={styles.liveGrid}><LiveServerPanel /><DiscordCommunityPanel /></div>
          </section>
          <section className={styles.explore} id="features" aria-labelledby="features-title">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}><Sparkles aria-hidden="true" /> Built around your game</p><h2 id="features-title">More than <span>the next frag.</span></h2></div><Link href="/features">The full playbook <ArrowRight aria-hidden="true" /></Link></div>
            <div className={styles.featureGrid}>
              <Link className={`${styles.featureCard} ${styles.arenaCard}`} href="/features#arena" data-ui="feature-card"><span className={styles.cardIndex}>01 / THE ARENA</span><Crosshair className={styles.featureIcon} aria-hidden="true" /><h3>Find your rhythm.<br />Climb the ladder.</h3><p>Choose your weapons and round preferences, face your next opponent, and follow your place in the rankings.</p><span className={styles.cardLink}>Inside the arena <ArrowUpRight aria-hidden="true" /></span><div className={styles.arenaVisual} aria-hidden="true"><span>03</span><i /><span>02</span><i /><strong>01</strong></div></Link>
              <Link className={styles.featureCard} href="/features#duels" data-ui="feature-card"><span className={styles.cardIndex}>02 / YOUR CHALLENGE</span><Swords className={styles.featureIcon} aria-hidden="true" /><h3>Set the rules.<br />Settle the score.</h3><p>Pick an opponent, a weapon format, and a match length. Play a quick first-to-one or keep the rivalry going.</p><div className={styles.tags}><span>First to 1 / 10 / 20</span><span>Endless</span></div><span className={styles.cardLink}>Explore custom duels <ArrowUpRight aria-hidden="true" /></span></Link>
              <Link className={styles.featureCard} href="/features#economy" data-ui="feature-card"><span className={styles.cardIndex}>03 / YOUR COLLECTION</span><Paintbrush className={styles.featureIcon} aria-hidden="true" /><h3>Earn it.<br />Make it yours.</h3><p>Earn Tokens, open cases, browse the market, and build a loadout. Manage your collection on the site or with <code>/panel</code> in game.</p><div className={styles.tags}><span>Inventory</span><span>Cases</span><span>Trading</span></div><span className={styles.cardLink}>Meet your player hub <ArrowUpRight aria-hidden="true" /></span></Link>
            </div>
          </section>
          <section className={styles.membershipRail} aria-label="Community benefits">
            <div className={styles.membershipIcon}><Crown aria-hidden="true" /></div><div><p className={styles.eyebrow}>A little extra, for your game</p><h2>Make yourself at home.</h2><p>Explore VIP tiers, try DIAMOND with <code>/viptest</code>, or get ULTIMATE by wearing <strong>arena.tapped.ro</strong> in your nickname. Trial limits apply.</p></div><Link className="button button-secondary" href="/vip">Discover VIP <ArrowRight aria-hidden="true" /></Link>
          </section>
          <footer className={styles.footer}><span><BrandEmblem width={30} /> TAPPED.RO <i /> {serverName}</span><Link href="/staff">Meet the people behind it <ArrowUpRight aria-hidden="true" /></Link></footer>
        </div>
      </PortalShell>
    </>
  );
}
