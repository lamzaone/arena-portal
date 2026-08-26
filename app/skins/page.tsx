import { AlertTriangle, Paintbrush, ShieldCheck, Sparkles } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { LoadoutEditor } from "@/components/loadout-editor";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { createLoadoutActionToken, getSession } from "@/lib/auth/session";
import { getLoadoutCatalogue, getPlayerDashboard, getPlayerLoadout } from "@/lib/data/portal-repository";

export default async function SkinsPage() {
  // The legacy editor is intentionally retained as a rollback path, but it is
  // not reachable in normal operation while TAPPED.Inventory owns cosmetics.
  if (process.env.LEGACY_WEAPONSKINS_ENABLED !== "true") {
    return <main><div className="shell"><SiteHeader authenticated />
      <section className="staff-denied"><ShieldCheck aria-hidden="true" /><p className="tapped-kicker">Legacy system retired</p><h1>The old loadout is disabled.</h1><p>Your cosmetic collection, crates, and equipped items now live in the Token Inventory.</p><a className="button button-primary" href="/inventory">Open inventory</a></section>
    </div></main>;
  }
  const session = await getSession();
  if (!session) return <SignInRequired title="Your WeaponSkins loadout" description="Sign in with Steam to review and change the cosmetics attached to your own server account." />;

  const [profile, catalogue] = await Promise.all([
    getPlayerDashboard(session.steamId),
    getLoadoutCatalogue()
  ]);
  const loadout = await getPlayerLoadout(session.steamId, catalogue);
  const collections = [
    ["Weapon skins", profile.skinSummary.skins],
    ["Knives", profile.skinSummary.knives],
    ["Gloves", profile.skinSummary.gloves],
    ["Agents", profile.skinSummary.agents],
    ["Music kits", profile.skinSummary.musicKits]
  ];

  return (
    <main><div className="shell"><SiteHeader authenticated /><AccountNav current="/skins" />
      <section className="page-heading loadout-page-heading"><div><p className="eyebrow"><Paintbrush aria-hidden="true" /> WeaponSkins</p><h1>Loadout panel</h1><p>Preview and queue your TAPPED.RO cosmetics from the website. The live server remains the final authority for permissions and every item selection.</p></div><div className="loadout-security-mark"><ShieldCheck aria-hidden="true" /><span>Server-validated</span></div></section>
      {!profile.sourceConnected ? <div className="notice notice-info"><AlertTriangle aria-hidden="true" /> Configure the read-only game database first to show your saved WeaponSkins loadout.</div> : null}
      <section className="loadout-grid" aria-label="Saved cosmetic loadout">
        {collections.map(([name, count]) => <article key={String(name)} className="loadout-card"><Sparkles aria-hidden="true" /><span>{name}</span><strong>{count}</strong><small>saved selection{Number(count) === 1 ? "" : "s"}</small></article>)}
      </section>
      {catalogue ? <LoadoutEditor catalogue={catalogue} loadout={loadout} actionToken={createLoadoutActionToken(session)} /> : <section className="panel loadout-bridge"><div><p className="eyebrow"><ShieldCheck aria-hidden="true" /> Waiting for bridge sync</p><h2>The live WeaponSkins catalogue is not available yet.</h2><p>The editor only shows choices imported from the active game plugin. Reload the updated <code>TAPPED.PortalBridge</code> once after applying <code>db/005_loadout_catalogue.sql</code>; it will publish the available weapons, finishes, agents, and music kits to this portal automatically.</p></div><div className="bridge-status"><span className="badge badge-warning">Catalogue pending</span><p>Saved selections can still be counted above. No cosmetic changes are sent until the server catalogue is present.</p></div></section>}
    </div></main>
  );
}
