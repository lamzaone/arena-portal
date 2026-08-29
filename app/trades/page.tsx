import { ArrowLeftRight } from "lucide-react";

import { TradeManager } from "@/components/economy/trade-manager";
import { SignInRequired } from "@/components/sign-in-required";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import { getTokenWallet } from "@/lib/data/portal-repository";
import { getCompletePlayerEconomyInventory } from "@/lib/economy/player-inventory";
import { getCompletePlayerEconomyTrades } from "@/lib/economy/player-trades";

export default async function TradesPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Player trades" description="Sign in with Steam to exchange eligible inventory items and Tokens directly with other players." />;

  const [wallet, inventory, trades] = await Promise.all([
    getTokenWallet(session.steamId),
    getCompletePlayerEconomyInventory(session.steamId),
    getCompletePlayerEconomyTrades(session.steamId)
  ]);

  return <PortalShell authenticated className="tapped-page">
    <PageHeading eyebrow={<><ArrowLeftRight aria-hidden="true" /> Player economy</>} title="Trades" description="Find another player, compare both inventories, and build a secure item or Token offer." />
    <TradeManager inventory={inventory} wallet={wallet} trades={trades} csrf={createEconomyActionToken(session)} />
  </PortalShell>;
}
