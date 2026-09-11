import Link from "next/link";
import { ArrowRight, Check, Crosshair, Shield, Sparkles, Swords } from "lucide-react";

import { PortalShell } from "@/components/ui/portal-shell";
import { getSession } from "@/lib/auth/session";
import { duelFlow, duelLengths, duelTypes, getArenaModes } from "@/lib/content/game-catalogue";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata = buildPageMetadata("/modes");

export default async function ModesPage() {
  const [session, arenaModes] = await Promise.all([getSession(), getArenaModes()]);
  const connectUrl = process.env.NEXT_PUBLIC_SERVER_CONNECT_URL ?? "steam://connect/arena.tapped.ro";

  return (
    <PortalShell authenticated={Boolean(session)} className="catalog-page modes-page">
        <section className="catalog-hero" aria-labelledby="modes-title">
          <div>
            <p className="tapped-kicker"><Crosshair aria-hidden="true" /> Playbook</p>
            <h1 id="modes-title">Game <span>modes</span></h1>
            <p>Compare arena loadouts and team sizes, or set up a custom duel with a friend.</p>
          </div>
          <aside className="catalog-signal">
            <span className="signal-label">ARENA ROUNDS</span>
            <strong>{arenaModes.length || "-"} supported modes</strong>
            <small>Live arena formats and custom challenges.</small>
          </aside>
        </section>

        <nav className="public-section-links" aria-label="Game mode sections"><a href="#arena-rounds-title"><Crosshair aria-hidden="true" /> Arena rounds <span>{arenaModes.length}</span></a><a href="#duels"><Swords aria-hidden="true" /> Custom duels</a><a href={connectUrl}><ArrowRight aria-hidden="true" /> Connect to server</a></nav>

        <section className="mode-catalogue" aria-labelledby="arena-rounds-title">
          <div className="catalog-section-heading"><div><h2 id="arena-rounds-title">Arena rounds</h2></div><p>Team size, loadout, and armor at a glance.</p></div>
          {arenaModes.length ? <div className="arena-mode-grid">{arenaModes.map((mode) => <article className="arena-mode-card" key={mode.id}>
            <div className="mode-card-topline"><span>{mode.teamSize}v{mode.teamSize}</span>{mode.enabledByDefault && <span className="live-mode" title="Enabled by default"><i /> Default</span>}</div>
            <h3>{mode.name}</h3>
            <dl><div><dt>Loadout</dt><dd>{mode.loadout}</dd></div><div><dt>Armor</dt><dd>{mode.armor ? "Enabled" : "Off"}</dd></div></dl>
          </article>)}</div> : <div className="catalog-empty"><Crosshair aria-hidden="true" /><h2>Arena rounds are not available yet.</h2><p>The portal&apos;s bundled Arena catalogue needs to be refreshed from the server configuration.</p></div>}
        </section>

        <section className="duel-catalogue" id="duels" aria-labelledby="duel-title">
          <div className="catalog-section-heading"><div><h2 id="duel-title">Custom duels</h2></div><p>Choose a round type and match length, then challenge a player outside the arena queue.</p></div>
          <div className="duel-layout">
            <article className="duel-main-card"><div className="duel-main-icon"><Swords aria-hidden="true" /></div><p className="signal-label">SUPPORTED TYPES</p><div className="duel-type-list">{duelTypes.map((type) => <div key={type.name}><strong>{type.name}</strong><span>{type.detail}</span></div>)}</div></article>
            <div className="duel-side-stack">
              <article className="duel-info-card"><Shield aria-hidden="true" /><p className="signal-label">MATCH LENGTH</p><h3>Play it your way.</h3><ul>{duelLengths.map((length) => <li key={length}><Check aria-hidden="true" /> {length}</li>)}</ul></article>
              <article className="duel-info-card duel-flow-card"><Sparkles aria-hidden="true" /><p className="signal-label">DUEL FLOW</p><ol>{duelFlow.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol><a className="button button-primary" href={connectUrl}>Connect and duel <ArrowRight aria-hidden="true" /></a></article>
            </div>
          </div>
          <div className="mode-login-callout"><div><p className="tapped-kicker"><Swords aria-hidden="true" /> Ready to compete?</p><h2>Bring a challenger.</h2></div>{session ? <Link className="button button-secondary" href={`/players/${session.steamId}`}>Open player profile<ArrowRight aria-hidden="true" /></Link> : <a className="button button-secondary" href="/api/auth/steam">Login with Steam<ArrowRight aria-hidden="true" /></a>}</div>
        </section>
    </PortalShell>
  );
}
