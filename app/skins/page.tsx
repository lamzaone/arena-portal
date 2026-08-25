import { AlertTriangle, Paintbrush, ShieldCheck, Sparkles } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";
import { getPlayerDashboard } from "@/lib/data/portal-repository";

export default async function SkinsPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Your WeaponSkins loadout" description="Sign in with Steam to see the cosmetics attached to your own server account." />;

  const profile = await getPlayerDashboard(session.steamId);
  const collections = [
    ["Weapon skins", profile.skinSummary.skins],
    ["Knives", profile.skinSummary.knives],
    ["Gloves", profile.skinSummary.gloves],
    ["Agents", profile.skinSummary.agents],
    ["Music kits", profile.skinSummary.musicKits]
  ];

  return (
    <main><div className="shell"><SiteHeader authenticated /><AccountNav current="/skins" />
      <section className="page-heading"><div><p className="eyebrow"><Paintbrush aria-hidden="true" /> WeaponSkins</p><h1>Loadout panel</h1><p>Your current saved cosmetic setup is read from WeaponSkins. The game plugin remains the authority over what you may use.</p></div></section>
      {!profile.sourceConnected ? <div className="notice notice-info"><AlertTriangle aria-hidden="true" /> Configure the read-only game database first to show your saved WeaponSkins loadout.</div> : null}
      <section className="loadout-grid" aria-label="Saved cosmetic loadout">
        {collections.map(([name, count]) => <article key={String(name)} className="loadout-card"><Sparkles aria-hidden="true" /><span>{name}</span><strong>{count}</strong><small>saved selection{Number(count) === 1 ? "" : "s"}</small></article>)}
      </section>
      <section className="panel loadout-bridge"><div><p className="eyebrow"><ShieldCheck aria-hidden="true" /> Safe by design</p><h2>Loadout editing is queued for the Swiftly bridge.</h2><p>The next implementation will import the live WeaponSkins catalogue and permissions, validate your T/CT skin, knife, gloves, agents, music kit, stickers, and charms choices, then send an audited request to the server. The website will not write directly into <code>wp_player_*</code> tables.</p></div><div className="bridge-status"><span className="badge badge-warning">Bridge not connected</span><p>Current choices are visible now; editing unlocks when the server-side validator is added.</p></div></section>
    </div></main>
  );
}
