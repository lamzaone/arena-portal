"use client";

import { ArrowDownLeft, ArrowUpRight, Check, Coins, X } from "lucide-react";

import { formatPortalDate } from "@/components/formatters";
import { PlayerIdentity } from "@/components/player-identity";
import { AsyncButton } from "@/components/ui/async-button";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import { economyItemTypeLabel } from "@/lib/economy/item-taxonomy";
import type { PlayerIdentityData } from "@/lib/player-identities";
import { EconomyEmptyState } from "./economy-item-card";
import { formatTokens, humanize, rarityClass, type EconomyTradeView } from "./economy-view-model";
import { MarketplaceItemPreview } from "./marketplace-item-preview";
import styles from "./trade-activity.module.css";

type TradeActivityProps = {
  trades: EconomyTradeView[];
  counterpartyIdentities: Readonly<Record<string, PlayerIdentityData>>;
  pending: boolean;
  pendingAction: string | null;
  onRespond: (tradeId: string, decision: "accept" | "reject") => void;
  onCancel: (tradeId: string) => void;
};

function TradeAssets({ tradeId, side, title, items, tokens }: {
  tradeId: string;
  side: "receive" | "give";
  title: string;
  items: EconomyTradeView["offeredItems"];
  tokens: number;
}) {
  const headingId = `trade-${tradeId}-${side}`;

  return (
    <section className={styles.assets} aria-labelledby={headingId}>
      <div className={styles.assetsHeading}>
        <h5 id={headingId}>{title}</h5>
        <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
      </div>
      <p className={styles.tokens}><Coins aria-hidden="true" /><strong>{formatTokens(tokens)}</strong> tokens</p>
      {items.length ? <>
        <div className={styles.itemScroll} role="region" aria-label={`${title}: items in offer #${tradeId}`} tabIndex={0}>
          <ul className={styles.items}>
            {items.map((item) => (
              <li key={item.id} className={styles.item}>
                <div className={styles.artwork}><MarketplaceItemPreview item={item} enableMarketPreview /></div>
                <div className={styles.itemCopy}>
                  <strong title={item.displayName}>{item.displayName}</strong>
                  <span className={`${styles.rarity} ${rarityClass(item.rarityRank)}`}>{item.rarity}</span>
                  <small>{economyItemTypeLabel(item.itemType)}{item.floatValue !== null ? ` · Float ${item.floatValue.toFixed(6)}` : ""}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
        {items.length > 3 ? <p className={styles.scrollHint}>Scroll to view all {items.length} items</p> : null}
      </> : <p className={styles.noItems}>No items included</p>}
    </section>
  );
}

function TradeOffer({ trade, counterpartyIdentities, pending, pendingAction, onRespond, onCancel }: Omit<TradeActivityProps, "trades"> & { trade: EconomyTradeView }) {
  const incoming = trade.direction === "incoming";
  const outgoing = trade.direction === "outgoing";
  const open = trade.status.toLowerCase() === "pending";
  const player = counterpartyIdentities[trade.counterpartySteamId] ?? {
    steamId: trade.counterpartySteamId,
    displayName: trade.counterpartySteamId,
    avatarUrl: null,
    presence: "unknown" as const,
    profileThemeKey: null,
    identityGroups: [],
  };
  const validDate = trade.createdAt && !Number.isNaN(new Date(trade.createdAt).getTime()) ? trade.createdAt : null;

  return (
    <ThemedPlayerContainer
      as="article"
      className={`panel trade-history-card ${styles.card}`}
      containerKind="record"
      ownerSteamId={trade.counterpartySteamId}
      profileThemeKey={player.profileThemeKey}
      aria-label={`${incoming ? "Incoming" : outgoing ? "Outgoing" : "Trade"} offer #${trade.id}`}
    >
      <header className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <h4>{incoming ? <ArrowDownLeft aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}{incoming ? "Incoming offer" : outgoing ? "Outgoing offer" : "Trade offer"}</h4>
          <span className={`${styles.status}${open ? ` ${styles.pendingStatus}` : ""}`}>{humanize(trade.status)}</span>
        </div>
        <div className={styles.counterparty}>
          <span className={styles.partyLabel}>{incoming ? "From" : outgoing ? "To" : "With"}</span>
          <PlayerIdentity player={player} variant="compact" showSteamId />
        </div>
        <div className={styles.metadata}>
          <span>Offer #{trade.id}</span>
          {validDate ? <time dateTime={validDate}>{formatPortalDate(validDate)} UTC</time> : null}
        </div>
      </header>
      <div className={styles.exchange}>
        <TradeAssets
          tradeId={trade.id}
          side="receive"
          title={incoming || outgoing ? "You receive" : "Requested"}
          items={incoming ? trade.offeredItems : trade.requestedItems}
          tokens={incoming ? trade.offeredTokens : trade.requestedTokens}
        />
        <TradeAssets
          tradeId={trade.id}
          side="give"
          title={incoming || outgoing ? "You give" : "Offered"}
          items={incoming ? trade.requestedItems : trade.offeredItems}
          tokens={incoming ? trade.requestedTokens : trade.offeredTokens}
        />
      </div>
      {open && (incoming || outgoing) ? <footer className={styles.actions}>
        {incoming ? <>
          <AsyncButton type="button" className="button button-primary" disabled={pending} pending={pendingAction === `accept:${trade.id}`} pendingLabel="Accepting" icon={<Check aria-hidden="true" />} onClick={() => onRespond(trade.id, "accept")}>Accept offer</AsyncButton>
          <AsyncButton type="button" className="button button-secondary" disabled={pending} pending={pendingAction === `reject:${trade.id}`} pendingLabel="Declining" icon={<X aria-hidden="true" />} onClick={() => onRespond(trade.id, "reject")}>Decline</AsyncButton>
        </> : <AsyncButton type="button" className="button button-secondary" disabled={pending} pending={pendingAction === `cancel:${trade.id}`} pendingLabel="Cancelling" icon={<X aria-hidden="true" />} onClick={() => onCancel(trade.id)}>Cancel offer</AsyncButton>}
      </footer> : null}
    </ThemedPlayerContainer>
  );
}

export function TradeActivity({ trades, ...actions }: TradeActivityProps) {
  const groups = [
    { direction: "incoming", title: "Incoming", description: "Offers sent to you.", empty: "No incoming offers." },
    { direction: "outgoing", title: "Outgoing", description: "Offers you have sent.", empty: "No outgoing offers." },
    ...(trades.some((trade) => trade.direction === "unknown") ? [{ direction: "unknown", title: "Other offers", description: "Your remaining trade records.", empty: "" }] : []),
  ];

  return (
    <section id="trade-activity" className={`history-section ${styles.activity}`} aria-labelledby="trade-activity-title">
      <div className="section-heading compact"><p className="eyebrow">Trade activity</p><h2 id="trade-activity-title">Incoming and outgoing offers</h2></div>
      {trades.length ? <div className={styles.groups}>
        {groups.map((group) => {
          const offers = trades.filter((trade) => trade.direction === group.direction)
            .sort((a, b) => Number(b.status.toLowerCase() === "pending") - Number(a.status.toLowerCase() === "pending"));
          const pendingCount = offers.filter((trade) => trade.status.toLowerCase() === "pending").length;
          return (
            <section key={group.direction} className={`${styles.group}${group.direction === "unknown" ? ` ${styles.otherGroup}` : ""}`} aria-labelledby={`trade-${group.direction}-title`}>
              <header className={styles.groupHeader}>
                <div><h3 id={`trade-${group.direction}-title`}>{group.title}</h3><p>{group.description}</p></div>
                <span className={styles.count}>{pendingCount} pending · {offers.length} total</span>
              </header>
              {offers.length ? <div className={styles.offers}>{offers.map((trade) => <TradeOffer key={trade.id} trade={trade} {...actions} />)}</div> : <p className={styles.emptyGroup}>{group.empty}</p>}
            </section>
          );
        })}
      </div> : <EconomyEmptyState title="No trade offers yet" description="Find another player above to exchange eligible inventory items or Tokens." />}
    </section>
  );
}
