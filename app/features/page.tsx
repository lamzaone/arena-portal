import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Coins, Crosshair, Crown, Dices, Gamepad2, Gift, Map, MessageCircle, MousePointer2, PackageOpen, Paintbrush, Radio, ShieldCheck, ShoppingBag, Sparkles, Swords, Trophy, UsersRound, type LucideIcon } from "lucide-react";

import { BrandEmblem } from "@/components/brand-emblem";
import { DiscordMark } from "@/components/icons/discord-mark";
import { PortalShell } from "@/components/ui/portal-shell";
import { getSession } from "@/lib/auth/session";
import { duelLengths, duelTypes, getArenaModes } from "@/lib/content/game-catalogue";
import { COMMUNITY_DISCORD_INVITE } from "@/lib/discord/public-community";
import { buildPageMetadata } from "@/lib/seo/site";

import styles from "./features.module.css";

export const metadata = buildPageMetadata("/features");

const sections = [
  { id: "arena", label: "The arena", icon: Crosshair },
  { id: "duels", label: "Duels & challenges", icon: Swords },
  { id: "economy", label: "Your collection", icon: Paintbrush },
  { id: "progression", label: "Ranks & VIP", icon: Trophy },
  { id: "community", label: "Community & support", icon: UsersRound },
];

function SectionHeading({ id, number, eyebrow, title, children }: { id: string; number: string; eyebrow: string; title: string; children: ReactNode }) {
  return <div className={styles.sectionHeading}><span className={styles.sectionNumber}>{number}</span><div><p className={styles.eyebrow}>{eyebrow}</p><h2 id={id}>{title}</h2><p>{children}</p></div></div>;
}

function FeatureCard({ icon: Icon, title, children, commands, href, linkLabel }: { icon: LucideIcon; title: string; children: ReactNode; commands?: string[]; href?: string; linkLabel?: string }) {
  return <article className={styles.card} data-ui="feature-card"><Icon className={styles.cardIcon} aria-hidden="true" /><h3>{title}</h3><div className={styles.cardCopy}>{children}</div>{commands ? <div className={styles.commands} aria-label={`${title} commands`}>{commands.map((command) => <code key={command}>{command}</code>)}</div> : null}{href ? <Link className={styles.cardLink} href={href}>{linkLabel} <ArrowUpRight aria-hidden="true" /></Link> : null}</article>;
}

export default async function FeaturesPage() {
  const [session, arenaModes] = await Promise.all([getSession(), getArenaModes()]);
  const connectUrl = process.env.NEXT_PUBLIC_SERVER_CONNECT_URL ?? "steam://connect/arena.tapped.ro";
  const defaultModes = arenaModes.filter((mode) => mode.enabledByDefault);

  return (
    <PortalShell authenticated={Boolean(session)} className="features-page">
      <div className={styles.features}>
        <section className={styles.hero} aria-labelledby="features-title" data-depth-card>
          <div><p className={styles.eyebrow}><Sparkles aria-hidden="true" /> The TAPPED playbook</p><h1 id="features-title">Know the arena.<br /><span>Make it yours.</span></h1><p className={styles.lede}>Every round, every challenge, every part of your collection. Your guide to playing, progressing, and finding your people on ARENA.</p><div className={styles.heroActions}><a className="button button-primary" href={connectUrl}><Gamepad2 aria-hidden="true" /> Connect to ARENA <ArrowUpRight aria-hidden="true" /></a><a className={styles.exploreLink} href="#arena">Find your next move <ArrowDown aria-hidden="true" /></a></div></div>
          <div className={styles.heroArt} aria-hidden="true" data-depth-art><span className={styles.artWord}>PLAYBOOK</span><div className={styles.artRing} /><BrandEmblem width={340} className={styles.emblem} /><span className={styles.artCaption}>PLAY / PROGRESS / CONNECT</span></div>
        </section>
        <dl className={styles.heroStats}><div><dt>Arena formats</dt><dd>{arenaModes.length}</dd></div><div><dt>Custom duel types</dt><dd>{duelTypes.length}</dd></div><div><dt>Your server & website</dt><dd>Connected.</dd></div></dl>

        <div className={styles.workspace}>
          <nav className={styles.sectionNav} aria-label="Feature sections"><span>IN THIS PLAYBOOK</span>{sections.map(({ id, label, icon: Icon }, index) => <a href={`#${id}`} key={id}><Icon aria-hidden="true" /><span>{label}</span><small>0{index + 1}</small></a>)}<a className={styles.navConnect} href={connectUrl}><Gamepad2 aria-hidden="true" /><span>Jump into the server</span><ArrowUpRight aria-hidden="true" /></a></nav>
          <div className={styles.sectionStack}>
            <section id="arena" className={styles.section} aria-labelledby="arena-rounds-title">
              <SectionHeading id="arena-rounds-title" number="01" eyebrow="The arena" title="A new opponent. A fresh chance.">Play short arena rounds, climb through the ladder, and choose the weapons and formats you enjoy.</SectionHeading>
              <div className={styles.highlight} data-panel-light><Crosshair aria-hidden="true" /><div><h3>Your preferences shape the round.</h3><p>Use <code>/guns</code> to save weapon preferences and <code>/rounds</code> to choose supported round types. <code>/queue</code> shows your arena position; <code>/afk</code> lets you step away.</p></div></div>
              <p className={styles.subheading}>Enabled by default for new players</p>
              <div className={styles.modeGrid}>{defaultModes.map((mode) => <article className={styles.modeCard} key={mode.id}><div><span>{mode.teamSize}v{mode.teamSize}</span><Crosshair aria-hidden="true" /></div><h3>{mode.name}</h3><p>{mode.loadout}</p><small>{mode.armor ? "Armor enabled" : "No armor"}</small></article>)}</div>
              <details className={styles.disclosure}><summary>Explore all {arenaModes.length} supported arena formats <ChevronDown aria-hidden="true" /></summary><div className={styles.allModes}>{arenaModes.map((mode) => <article key={mode.id}><div><h4>{mode.name}</h4><span>{mode.teamSize}v{mode.teamSize}{mode.enabledByDefault ? " · Default" : " · Optional"}</span></div><p>{mode.loadout}</p><small>{mode.armor ? "Armor enabled" : "Armor off"}</small></article>)}</div><p className={styles.footnote}>Default means enabled for new players. Your saved preferences and the available opponent determine which format you play.</p></details>
              <div className={styles.cardGrid}>
                <FeatureCard icon={Crosshair} title="Headshots, on your terms" commands={["/hs"]}><p>Toggle your saved headshot-only gunfire setting. When enabled, your body hits deal no damage. This changes your own outgoing gunfire.</p></FeatureCard>
                <FeatureCard icon={MousePointer2} title="Make a round interesting" commands={["/ns"]}><p>Offer a no-scope round with <code>/ns</code>. Your opponent gets a Yes/No choice; accepting disables scopes for both players for that round.</p><p>For a knife-only challenge, knife a wall twice within three seconds. Your opponent chooses whether to accept.</p></FeatureCard>
              </div>
            </section>

            <section id="duels" className={styles.section} aria-labelledby="duel-title">
              <SectionHeading id="duel-title" number="02" eyebrow="Duels & challenges" title="A rivalry with your own rules.">Challenge a specific player outside the normal arena queue. Choose a format, a match length, and an optional Token stake.</SectionHeading>
              <div className={styles.duelBoard} data-panel-light><div className={styles.duelBoardTop}><Swords aria-hidden="true" /><span>YOUR OPPONENT. YOUR FORMAT.</span></div><h3>Eight ways to settle it.</h3><div className={styles.duelTypes}>{duelTypes.map((type) => <div key={type.name}><strong>{type.name}</strong><span>{type.detail}</span></div>)}</div><div className={styles.lengths}><span>THE FINISH LINE</span>{duelLengths.map((length) => <span key={length}><Check aria-hidden="true" /> {length}</span>)}</div></div>
              <ol className={styles.steps}><li><span>01</span><div><h3>Send the challenge</h3><p>Use <code>/duel &lt;player&gt; [tokens]</code> and choose the rules and stake.</p></div></li><li><span>02</span><div><h3>Let your opponent decide</h3><p>Only your target receives the invitation. “Show duel” opens the details; they can then accept or decline.</p></div></li><li><span>03</span><div><h3>Play it out</h3><p>Scores carry across rounds. Either player can use <code>/duelstop</code> to stop an active or pending duel.</p></div></li></ol>
              <div className={styles.smallNote}><ShieldCheck aria-hidden="true" /><p>Check the rules and any Token stake before accepting. Duel players are excluded from regular random item drops.</p></div>
              <FeatureCard icon={Dices} title="A quick game of Barbut" commands={["/barbut <player> <tokens>", "/barbutaccept", "/barbutdecline"]}><p>Challenge another active player to a dice wager with a positive Token stake. The opponent must accept before the wager proceeds.</p></FeatureCard>
            </section>

            <section id="economy" className={styles.section} aria-labelledby="collection-title">
              <SectionHeading id="collection-title" number="03" eyebrow="Your collection" title="Play. Collect. Make your mark.">Your Token wallet, inventory, market, and loadout work together across the portal and the in-game player panel.</SectionHeading>
              <div className={styles.cardGrid}>
                <FeatureCard icon={Coins} title="Tokens & rewards" commands={["/tokens", "/redeem <code>"]}><p>Earn Tokens from eligible gameplay and use them for supported market items, containers, and player trades. Redeem community reward codes from the website or in game.</p><p>Random item drops and map-end drops build your collection over time. Reward eligibility still applies.</p></FeatureCard>
                <FeatureCard icon={PackageOpen} title="Cases & your inventory" commands={["/cases"]} href="/inventory" linkLabel="Open your inventory"><p>Browse what you own, inspect containers and their possible contents, and open eligible cases. New rewards go straight into your inventory.</p><p>Search and filter your collection to find the item you want to use next.</p></FeatureCard>
                <FeatureCard icon={ShoppingBag} title="Market & trading" href="/market" linkLabel="Browse the market"><p>Browse the market, check an item&apos;s Token price, and buy supported items using your wallet. Player trades can include eligible items, Tokens, or both.</p><p>Choose a trade partner, review both sides, and respond through your Trades workspace.</p></FeatureCard>
                <FeatureCard icon={Paintbrush} title="Loadout & identity" href="/loadout" linkLabel="Build your loadout"><p>Equip the cosmetics and customization options available to your account. Your loadout connects your website collection to supported in-game items.</p><p>Manage eligible profile themes, chat tags, and identity preferences in your player settings.</p></FeatureCard>
              </div>
              <div className={styles.panelGuide} data-panel-light><div><p className={styles.eyebrow}><Radio aria-hidden="true" /> Keep it in game</p><h3>Your player hub.<br /><span>One command away.</span></h3><p>Open <code>/panel</code> for Inventory, Cases, Market, Loadout, and Trades without leaving the server. Use <code>/panel close</code> to close it.</p></div><div className={styles.panelTabs}>{["Inventory", "Cases", "Market", "Loadout", "Trades"].map((tab, index) => <span key={tab}><small>0{index + 1}</small>{tab}<ArrowRight aria-hidden="true" /></span>)}</div></div>
              <FeatureCard icon={Dices} title="The Token casino" href="/casino" linkLabel="Visit the casino"><p>Play Roulette, Blackjack, Crash, and Plinko with your shared Token wallet. Sign in with Steam to see your own rounds, bets, and results.</p></FeatureCard>
            </section>

            <section id="progression" className={styles.section} aria-labelledby="progression-title">
              <SectionHeading id="progression-title" number="04" eyebrow="Ranks & VIP" title="A little more, every session.">Follow your progress, compare your performance, and explore the membership benefits that fit your game.</SectionHeading>
              <div className={styles.cardGrid}>
                <FeatureCard icon={Trophy} title="Your rank, in detail" commands={["/rank", "/top", "/stats", "/weaponstats", "/hitstats"]} href="/ranking" linkLabel="See the leaderboard"><p>The leaderboard follows ranking points. Your profile brings together combat stats, playtime, and your current identity.</p><p>Dig into weapon performance and hit statistics in game. Use <code>/mytime</code> for your playtime or <code>/ttop</code> for the time leaderboard.</p></FeatureCard>
                <FeatureCard icon={Crown} title="Memberships with personality" commands={["/vip", "/viptest"]} href="/vip" linkLabel="Compare VIP tiers"><p>Explore the current VIP tiers and their exact benefits on the memberships page. Your account shows your active groups and remaining duration.</p><p>Try DIAMOND for 24 hours with <code>/viptest</code>, subject to the trial cooldown and claim limit. Wear <strong>arena.tapped.ro</strong> in your nickname for the configured ULTIMATE benefit.</p></FeatureCard>
              </div>
              <div className={styles.smallNote}><Gift aria-hidden="true" /><p>Available perks depend on your active tier. Use the VIP page for the current benefits and offers.</p></div>
            </section>

            <section id="community" className={styles.section} aria-labelledby="community-title">
              <SectionHeading id="community-title" number="05" eyebrow="Community & support" title="Good games start with good people.">Keep your account connected, help shape the next map, and reach the team when you need a hand.</SectionHeading>
              <div className={styles.cardGrid}>
                <FeatureCard icon={MessageCircle} title="Discord, connected" href="/discord-link" linkLabel="Link your Discord"><p>Join the community Discord for the conversation beyond the server. Use the bot&apos;s private <code>/link</code> code on the website, or redeem it with <code>/discordlink &lt;code&gt;</code> in game.</p><p>Your linked account keeps eligible Discord roles in sync with your community groups.</p></FeatureCard>
                <FeatureCard icon={Sparkles} title="Chat with character" commands={["/htmlchat", "/htmlchat_history", "/tags", "/mention"]}><p>The custom Workshop chat supports your community identity and an interactive history. Toggle it with <code>/htmlchat on</code> or <code>/htmlchat off</code>.</p><p>Open history with <code>/htmlchat_history open</code>, manage applicable tags with <code>/tags</code>, and toggle mention sounds with <code>/mention</code>.</p></FeatureCard>
                <FeatureCard icon={Map} title="Have a say in the next map" commands={["/rtv", "/nominate <map>", "/timeleft", "/nextmap"]}><p>Nominate an allowed map, vote to change it with Rock The Vote, and check what&apos;s coming next. Use <code>/maps</code> to see the configured map list.</p><p><code>/unrtv</code> removes your vote; <code>/revote</code> reopens an active end-of-map vote.</p></FeatureCard>
                <FeatureCard icon={ShieldCheck} title="A team you can reach" commands={["/report <player> <reason>", "/calladmin <reason>", "/help"]} href="/tickets" linkLabel="Open a support ticket"><p>Send a player report or call for staff in game. Reports and staff calls have a 60-second sender cooldown.</p><p>Use the portal for support tickets and eligible moderation appeals. Your profile brings together your warnings and moderation history so you can follow the outcome.</p></FeatureCard>
              </div>
              <div className={styles.communityCallout}><div><h3>Your next teammate is here.</h3><p>Meet the staff, join the conversation, and make the community yours.</p></div><a className="button button-primary" href={COMMUNITY_DISCORD_INVITE} target="_blank" rel="noopener noreferrer"><DiscordMark /> Join Discord <ArrowUpRight aria-hidden="true" /></a><Link className={styles.cardLink} href="/staff">Meet the staff <ArrowRight aria-hidden="true" /></Link></div>
            </section>
          </div>
        </div>
        <footer className={styles.footer}><BrandEmblem width={28} /><p>Ready for the next round?</p><a href={connectUrl}>See you in the arena <ArrowUpRight aria-hidden="true" /></a></footer>
      </div>
    </PortalShell>
  );
}
