import { Archive } from "lucide-react";

import { InventoryManager } from "@/components/economy/inventory-manager";
import { CrateOpener } from "@/components/economy/crate-opener";
import { SignInRequired } from "@/components/sign-in-required";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import { getPlayerEconomyLoadout, getTokenWallet } from "@/lib/data/portal-repository";
import { getCompletePlayerEconomyInventory } from "@/lib/economy/player-inventory";

export default async function InventoryPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Your Token Inventory" description="Sign in with Steam to browse, equip, and customize the items owned by your account." />;

  const [wallet, inventory, loadout] = await Promise.all([
    getTokenWallet(session.steamId),
    getCompletePlayerEconomyInventory(session.steamId),
    getPlayerEconomyLoadout(session.steamId)
  ]);
  const csrf = createEconomyActionToken(session);

  return <PortalShell authenticated className="tapped-page">
    <PageHeading eyebrow={<><Archive aria-hidden="true" /> Player economy</>} title="Inventory" description="Manage and protect your owned items, then inspect and open your crates without leaving Inventory." />
    <InventoryManager inventory={inventory} loadout={loadout} wallet={wallet} csrf={csrf} />
    <CrateOpener mode="owned" crates={[]} inventory={inventory} wallet={wallet} csrf={csrf} />
  </PortalShell>;
}
