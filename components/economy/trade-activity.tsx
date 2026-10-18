"use client";

import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Clock3, Coins, History, X } from "lucide-react";
import { useState } from "react";

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

function TradeAssets({ tradeId, side, title, items, tokens, headingLevel }: {
  tradeId: string;
  side: "receive" | "give";
  title: string;
  items: EconomyTradeView["offeredItems"];
  tokens: string;
  headingLevel: 5 | 6;
}) {
  const headingId = `trade-${tradeId}-${side}`;
  const Heading = headingLevel === 5 ? "h5" : "h6";

  return (
    <section className={styles.assets} aria-labelledby={headingId}>
      <div className={styles.assetsHeading}>
        <Heading id={headingId}>{title}</Heading>
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

function TradeOffer({ trade, counterpartyIdentities, pending, pendingAction, onRespond, onCancel, headingLevel = 4 }: Omit<TradeActivityProps, "trades"> & { trade: EconomyTradeView; headingLevel?: 4 | 5 }) {
  const incoming = trade.direction === "incoming";
  const outgoing = trade.direction === "outgoing";
  const open = trade.status.toLowerCase() === "pending";
  const Heading = headingLevel === 4 ? "h4" : "h5";
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
      data-trade-status={trade.status.toLowerCase()}
      aria-label={`${incoming ? "Incoming" : outgoing ? "Outgoing" : "Trade"} offer #${trade.id}`}
    >
      <header className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <Heading>{incoming ? <ArrowDownLeft aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}{incoming ? "Incoming offer" : outgoing ? "Outgoing offer" : "Trade offer"}</Heading>
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
          headingLevel={headingLevel === 4 ? 5 : 6}
        />
        <TradeAssets
          tradeId={trade.id}
          side="give"
          title={incoming || outgoing ? "You give" : "Offered"}
          items={incoming ? trade.requestedItems : trade.offeredItems}
          tokens={incoming ? trade.requestedTokens : trade.offeredTokens}
          headingLevel={headingLevel === 4 ? 5 : 6}
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

const PENDING_PAGE_SIZE = 4;
const HISTORY_PAGE_SIZE = 6;

function PendingTradeGroup({ direction, title, description, empty, trades, ...actions }: Omit<TradeActivityProps, "trades"> & {
  direction: string;
  title: string;
  description: string;
  empty: string;
  trades: EconomyTradeView[];
}) {
  const [visibleCount, setVisibleCount] = useState(PENDING_PAGE_SIZE);
  const offers = trades.filter((trade) => trade.direction === direction);
  const remaining = Math.max(0, offers.length - visibleCount);
  const headingId = `trade-pending-${direction}-title`;
  const offersId = `trade-pending-${direction}-offers`;

  return (
    <section className={`${styles.group}${direction === "unknown" ? ` ${styles.otherGroup}` : ""}`} aria-labelledby={headingId}>
      <header className={styles.groupHeader}>
        <div><h4 id={headingId}>{title}</h4><p>{description}</p></div>
        <span className={styles.count}>{offers.length} pending</span>
      </header>
      {offers.length ? <>
        <div id={offersId} className={styles.offers}>{offers.slice(0, visibleCount).map((trade) => <TradeOffer key={trade.id} trade={trade} headingLevel={5} {...actions} />)}</div>
        {remaining ? <button type="button" className={`button button-secondary ${styles.showMore}`} aria-controls={offersId} onClick={() => setVisibleCount((count) => count + PENDING_PAGE_SIZE)}><ChevronDown aria-hidden="true" /> Show more {title.toLowerCase()} ({remaining})</button> : null}
      </> : <p className={styles.emptyGroup}>{empty}</p>}
    </section>
  );
}

export function TradeActivity({ trades, ...actions }: TradeActivityProps) {
  const [historyVisibleCount, setHistoryVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const pendingTrades = trades.filter((trade) => trade.status.toLowerCase() === "pending");
  const finishedTrades = trades.filter((trade) => trade.status.toLowerCase() !== "pending");
  const remainingHistory = Math.max(0, finishedTrades.length - historyVisibleCount);
  const groups = [
    { direction: "incoming", title: "Incoming", description: "Review and respond to these offers.", empty: "You are all caught up. No offers need your response." },
    { direction: "outgoing", title: "Outgoing", description: "Waiting for the other player to respond.", empty: "No open offers sent by you." },
    ...(pendingTrades.some((trade) => trade.direction === "unknown") ? [{ direction: "unknown", title: "Other pending offers", description: "Open records with unavailable direction details.", empty: "" }] : []),
  ];

  return (
    <section id="trade-activity" className={`history-section ${styles.activity}`} aria-labelledby="trade-activity-title">
      <div className="section-heading compact"><p className="eyebrow">Trade activity</p><h2 id="trade-activity-title">Your offers, at a glance</h2></div>
      {trades.length ? <>
        <section className={styles.pendingSection} aria-labelledby="trade-pending-title">
          <header className={styles.sectionHeader}>
            <span className={styles.sectionIcon}><Clock3 aria-hidden="true" /></span>
            <div><p className={styles.sectionLabel}>Open offers</p><h3 id="trade-pending-title">Pending trades</h3><p>Offers stay here until they are accepted, declined, cancelled, or expired.</p></div>
            <span className={`${styles.totalCount} ${styles.pendingCount}`}>{pendingTrades.length}<small>pending</small></span>
          </header>
          <div className={styles.groups}>
            {groups.map((group) => <PendingTradeGroup key={group.direction} {...group} trades={pendingTrades} {...actions} />)}
          </div>
        </section>
        <section className={styles.finishedSection} aria-labelledby="trade-finished-title">
          <header className={styles.sectionHeader}>
            <span className={styles.sectionIcon}><History aria-hidden="true" /></span>
            <div><p className={styles.sectionLabel}>Past activity</p><h3 id="trade-finished-title">Finished trades</h3><p>Completed, declined, cancelled, and expired offers. No action needed.</p></div>
            <span className={styles.totalCount}>{finishedTrades.length}<small>finished</small></span>
          </header>
          {finishedTrades.length ? <>
            <div id="trade-finished-offers" className={`${styles.groups} ${styles.historyGrid}`}>{finishedTrades.slice(0, historyVisibleCount).map((trade) => <TradeOffer key={trade.id} trade={trade} {...actions} />)}</div>
            {remainingHistory ? <button type="button" className={`button button-secondary ${styles.showMore}`} aria-controls="trade-finished-offers" onClick={() => setHistoryVisibleCount((count) => count + HISTORY_PAGE_SIZE)}><ChevronDown aria-hidden="true" /> Show more finished trades ({remainingHistory})</button> : null}
          </> : <p className={styles.emptyGroup}>Your finished trades will appear here once an offer is resolved.</p>}
        </section>
      </> : <EconomyEmptyState title="No trade offers yet" description="Find another player above to exchange eligible inventory items or Tokens." />}
    </section>
  );
}
