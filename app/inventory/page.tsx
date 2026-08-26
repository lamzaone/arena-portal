import { Archive } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { InventoryManager } from "@/components/economy/inventory-manager";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import { getPlayerEconomyLoadout, getTokenWallet } from "@/lib/data/portal-repository";
import { getCompletePlayerEconomyInventory } from "@/lib/economy/player-inventory";

export default async function InventoryPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Your Token Inventory" description="Sign in with Steam to browse, equip, and customize the items owned by your account." />;

  const [wallet, inventory, loadout] = await Promise.all([
    getTokenWallet(session.steamId),
    getCompletePlayerEconomyInventory(session.steamId, { includeAttached: true }),
    getPlayerEconomyLoadout(session.steamId)
  ]);

  return <main><div className="shell"><SiteHeader authenticated /><AccountNav current="/inventory" />
    <section className="page-heading"><div><p className="eyebrow"><Archive aria-hidden="true" /> Player economy</p><h1>Inventory</h1><p>Manage the cosmetic items attached to your Token account, then equip eligible owned instances to your server loadout.</p></div></section>
    <InventoryManager inventory={inventory} loadout={loadout} wallet={wallet} csrf={createEconomyActionToken(session)} />
  </div></main>;
}
