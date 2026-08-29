import { Coins, TrendingDown, TrendingUp } from "lucide-react";

import { formatTokens, type EconomyWalletView } from "@/components/economy/economy-view-model";

export function TokenBalance({ wallet, compact = false }: { wallet: EconomyWalletView; compact?: boolean }) {
  if (compact) {
    return <span className="badge tag-vip"><Coins aria-hidden="true" /> {formatTokens(wallet.balance)} tokens</span>;
  }

  return (
    <section className="panel" aria-label="Token wallet">
      <div className="panel-heading"><div><p className="eyebrow"><Coins aria-hidden="true" /> Token wallet</p><h2>{formatTokens(wallet.balance)} tokens</h2></div></div>
      {wallet.earned !== null || wallet.spent !== null ? <div className="tag-list">
        {wallet.earned !== null ? <span className="tag"><TrendingUp aria-hidden="true" /> {formatTokens(wallet.earned)} earned</span> : null}
        {wallet.spent !== null ? <span className="tag"><TrendingDown aria-hidden="true" /> {formatTokens(wallet.spent)} spent</span> : null}
      </div> : <p className="empty-copy">Earn tokens in eligible live matches, then use them for crates and direct marketplace purchases.</p>}
    </section>
  );
}
