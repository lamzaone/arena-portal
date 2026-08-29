import { Gift } from "lucide-react";

import { CrateOpener } from "@/components/economy/crate-opener";
import { SignInRequired } from "@/components/sign-in-required";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import { getTokenWallet } from "@/lib/data/portal-repository";
import { getCompleteEconomyCrates } from "@/lib/economy/catalogue";
import { getCompletePlayerEconomyInventory } from "@/lib/economy/player-inventory";

export default async function CratesPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Open Token crates" description="Sign in with Steam to open the crates and capsules you have earned or acquired." />;

  const [wallet, crates, inventory] = await Promise.all([
    getTokenWallet(session.steamId),
    getCompleteEconomyCrates({ marketOnly: true }),
    getCompletePlayerEconomyInventory(session.steamId)
  ]);

  return <PortalShell authenticated className="tapped-page">
    <PageHeading eyebrow={<><Gift aria-hidden="true" /> Player economy</>} title="Crates" description="Open an owned crate or capsule to receive one random item. Crates never require a key." />
    <CrateOpener crates={crates} inventory={inventory} wallet={wallet} csrf={createEconomyActionToken(session)} />
  </PortalShell>;
}
