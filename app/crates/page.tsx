import { Gift } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { CrateOpener } from "@/components/economy/crate-opener";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import { getTokenWallet } from "@/lib/data/portal-repository";
import { getCompleteEconomyCrates } from "@/lib/economy/catalogue";
import { getCompletePlayerEconomyInventory } from "@/lib/economy/player-inventory";

export default async function CratesPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Open Token crates" description="Sign in with Steam to open the crates and capsules you have earned or acquired." />;

  const [wallet, crates, inventory] = await Promise.all([
    getTokenWallet(session.steamId),
    getCompleteEconomyCrates(),
    getCompletePlayerEconomyInventory(session.steamId, { includeAttached: true })
  ]);

  return <main><div className="shell"><SiteHeader authenticated /><AccountNav current="/crates" />
    <section className="page-heading"><div><p className="eyebrow"><Gift aria-hidden="true" /> Player economy</p><h1>Crates</h1><p>Open an owned crate or capsule to receive one random item. Crates never require a key.</p></div></section>
    <CrateOpener crates={crates} inventory={inventory} wallet={wallet} csrf={createEconomyActionToken(session)} />
  </div></main>;
}
