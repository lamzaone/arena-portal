import Link from "next/link";
import { ArrowRight, Check, Crosshair, Shield, Sparkles, Swords } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { duelFlow, duelLengths, duelTypes, getArenaModes } from "@/lib/content/game-catalogue";

export default async function ModesPage() {
  const [session, arenaModes] = await Promise.all([getSession(), getArenaModes()]);
  const connectUrl = process.env.NEXT_PUBLIC_SERVER_CONNECT_URL ?? "steam://connect/arena.tapped.ro";

  return (
    <main className="tapped-page catalog-page">
      <div className="shell">
        <SiteHeader authenticated={Boolean(session)} />
        <section className="catalog-hero" aria-labelledby="modes-title">
          <div>
            <p className="tapped-kicker"><Crosshair aria-hidden="true" /> ARENA.TAPPED.RO playbook</p>
            <h1 id="modes-title">Modes made<br /><span>for the match.</span></h1>
            <p>Browse every supported Arena round and every Custom Duel option in the current server configuration.</p>
          </div>
          <aside className="catalog-signal">
            <span className="signal-label">ARENA ROUNDS</span>
            <strong>{arenaModes.length || "-"} supported modes</strong>
            <small>Loadouts and team formats match the current K4-Arenas defaults.</small>
          </aside>
        </section>

        <section className="mode-catalogue" aria-labelledby="arena-rounds-title">
          <div className="catalog-section-heading"><div><p className="tapped-kicker"><Crosshair aria-hidden="true" /> Interactive ARENA</p><h2 id="arena-rounds-title">Pick the fight.</h2></div><p>These are the currently supported Arena rounds. Each card shows the configured team size, weapon behavior, and armor rule.</p></div>
          {arenaModes.length ? <div className="arena-mode-grid">{arenaModes.map((mode) => <article className="arena-mode-card" key={mode.id}>
            <div className="mode-card-topline"><span>{mode.teamSize}v{mode.teamSize}</span>{mode.enabledByDefault && <span className="live-mode"><i /> On by default</span>}</div>
            <h3>{mode.name}</h3>
            <dl><div><dt>Loadout</dt><dd>{mode.loadout}</dd></div><div><dt>Armor</dt><dd>{mode.armor ? "Enabled" : "Off"}</dd></div></dl>
          </article>)}</div> : <div className="catalog-empty"><Crosshair aria-hidden="true" /><h2>Arena rounds are not available yet.</h2><p>The portal&apos;s bundled Arena catalogue needs to be refreshed from the server configuration.</p></div>}
        </section>

        <section className="duel-catalogue" id="duels" aria-labelledby="duel-title">
          <div className="catalog-section-heading"><div><p className="tapped-kicker"><Swords aria-hidden="true" /> Custom DUELs</p><h2 id="duel-title">Set the terms.</h2></div><p>Custom Duels run independently from the Arena queue. Choose a round type, decide the match length, then challenge a player.</p></div>
          <div className="duel-layout">
            <article className="duel-main-card"><div className="duel-main-icon"><Swords aria-hidden="true" /></div><p className="signal-label">SUPPORTED TYPES</p><div className="duel-type-list">{duelTypes.map((type) => <div key={type.name}><strong>{type.name}</strong><span>{type.detail}</span></div>)}</div></article>
            <div className="duel-side-stack">
              <article className="duel-info-card"><Shield aria-hidden="true" /><p className="signal-label">MATCH LENGTH</p><h3>Play it your way.</h3><ul>{duelLengths.map((length) => <li key={length}><Check aria-hidden="true" /> {length}</li>)}</ul></article>
              <article className="duel-info-card duel-flow-card"><Sparkles aria-hidden="true" /><p className="signal-label">DUEL FLOW</p><ol>{duelFlow.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol><a className="button button-primary" href={connectUrl}>Connect and duel <ArrowRight aria-hidden="true" /></a></article>
            </div>
          </div>
          <div className="mode-login-callout"><div><p className="tapped-kicker"><Swords aria-hidden="true" /> Ready to compete?</p><h2>Bring a challenger.</h2></div><Link className="button button-secondary" href={session ? "/dashboard" : "/api/auth/steam"}>{session ? "Open player profile" : "Login with Steam"}<ArrowRight aria-hidden="true" /></Link></div>
        </section>
      </div>
    </main>
  );
}
