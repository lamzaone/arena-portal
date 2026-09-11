import { AlertTriangle, Paintbrush, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import styles from "./skins.module.css";

import { LoadoutEditor } from "@/components/loadout-editor";
import { SignInRequired } from "@/components/sign-in-required";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import { createLoadoutActionToken, getSession } from "@/lib/auth/session";
import { getLoadoutCatalogue, getPlayerDashboard, getPlayerLoadout } from "@/lib/data/portal-repository";

export default async function SkinsPage() {
  // The legacy editor is intentionally retained as a rollback path, but it is
  // not reachable in normal operation while TAPPED.Inventory owns cosmetics.
  if (process.env.LEGACY_WEAPONSKINS_ENABLED !== "true") {
    return <PortalShell authenticated className="tapped-page">
      <PageHeading eyebrow={<><Paintbrush aria-hidden="true" /> Player economy</>} title="Your cosmetics" description="Your collection and equipped items have a new home." />
      <section className={styles.retired}><span className={styles.icon}><ShieldCheck aria-hidden="true" /></span><h2>Manage your items in Inventory</h2><p>Browse your cosmetics, customize items, and open crates in Inventory. Use Loadout to choose what each team equips.</p><div className={styles.actions}><Link className="button button-primary" href="/inventory">Open inventory</Link><Link className="button button-secondary" href="/loadout">Manage loadout</Link></div></section>
    </PortalShell>;
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
    <PortalShell authenticated className="tapped-page">
      <PageHeading className="loadout-page-heading" eyebrow={<><Paintbrush aria-hidden="true" /> WeaponSkins</>} title="Loadout panel" description="Preview and queue your TAPPED.RO cosmetics from the website. The live server remains the final authority for permissions and every item selection." actions={<div className="loadout-security-mark"><ShieldCheck aria-hidden="true" /><span>Server-validated</span></div>} />
      {!profile.sourceConnected ? <div className="notice notice-info"><AlertTriangle aria-hidden="true" /> Your saved loadout is temporarily unavailable. Try again once the game connection is restored.</div> : null}
      <section className="loadout-grid" aria-label="Saved cosmetic loadout">
        {collections.map(([name, count]) => <article key={String(name)} className="loadout-card"><Sparkles aria-hidden="true" /><span>{name}</span><strong>{count}</strong><small>saved selection{Number(count) === 1 ? "" : "s"}</small></article>)}
      </section>
      {catalogue ? <LoadoutEditor catalogue={catalogue} loadout={loadout} actionToken={createLoadoutActionToken(session)} /> : <section className="panel loadout-bridge"><div><p className="eyebrow"><ShieldCheck aria-hidden="true" /> Catalogue pending</p><h2>Your cosmetic choices are syncing.</h2><p>Your saved selection counts are shown above. Return shortly to preview and change your loadout when the game catalogue is available.</p></div><div className="bridge-status"><Link className="button button-secondary" href="/inventory">View inventory</Link></div></section>}
    </PortalShell>
  );
}
