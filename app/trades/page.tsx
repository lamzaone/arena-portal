import { ArrowLeftRight } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { TradeManager } from "@/components/economy/trade-manager";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
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

  return <main><div className="shell"><SiteHeader authenticated /><AccountNav current="/trades" />
    <section className="page-heading"><div><p className="eyebrow"><ArrowLeftRight aria-hidden="true" /> Player economy</p><h1>Trades</h1><p>Send, accept, decline, or cancel secure trade offers for owned items and Tokens.</p></div></section>
    <TradeManager inventory={inventory} wallet={wallet} trades={trades} csrf={createEconomyActionToken(session)} />
  </div></main>;
}
