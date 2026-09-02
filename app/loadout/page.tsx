import { Crosshair } from "lucide-react";

import { EconomyLoadoutManager } from "@/components/economy/loadout-manager";
import { SignInRequired } from "@/components/sign-in-required";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import { getPlayerEconomyLoadout } from "@/lib/data/portal-repository";
import { getCompletePlayerEconomyInventory } from "@/lib/economy/player-inventory";

export default async function LoadoutPage() {
  const session = await getSession();
  if (!session) {
    return (
      <SignInRequired
        title="Your Skin Loadout"
        description="Sign in with Steam to choose the owned weapon finishes used by each team."
      />
    );
  }

  const [inventory, loadout] = await Promise.all([
    getCompletePlayerEconomyInventory(session.steamId),
    getPlayerEconomyLoadout(session.steamId),
  ]);

  return (
    <PortalShell authenticated className="tapped-page">
      <PageHeading
        eyebrow={<><Crosshair aria-hidden="true" /> Player economy</>}
        title="Loadout"
        description="Choose which owned weapon finish your Terrorist and Counter-Terrorist teams take into the server."
      />
      <EconomyLoadoutManager
        inventory={inventory}
        loadout={loadout}
        csrf={createEconomyActionToken(session)}
      />
    </PortalShell>
  );
}
