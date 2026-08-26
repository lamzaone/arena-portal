"use client";

import { Box, Coins, Tag } from "lucide-react";
import type { ReactNode } from "react";

import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import {
  formatTokens,
  humanize,
  rarityClass,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";

type EconomyItemCardProps = {
  item: EconomyItemView;
  actions?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  selectionLabel?: string;
  enableMarketPreview?: boolean;
  previewFloat?: number | null;
};

export function EconomyItemCard({
  item,
  actions,
  selected = false,
  onSelect,
  selectionLabel,
  enableMarketPreview = true,
  previewFloat = null,
}: EconomyItemCardProps) {
  const price = item.marketPriceTokens;
  const content = (
    <>
      <MarketplaceItemPreview
        item={item}
        enableMarketPreview={enableMarketPreview}
        floatValue={previewFloat}
      />
      <div className="panel-heading">
        <div>
          <span className={rarityClass(item.rarityRank)}>{item.rarity}</span>
          <h3>{item.displayName}</h3>
          <p>{humanize(item.itemType)}{item.nametag ? ` · “${item.nametag}”` : ""}</p>
        </div>
      </div>
      <div className="tag-list" aria-label="Item details">
        {item.stattrak ? <span className="tag"><Tag aria-hidden="true" /> StatTrak {formatTokens(item.stattrakCount)}</span> : null}
        {item.floatValue !== null ? <span className="tag">Float {item.floatValue.toFixed(6)}</span> : null}
        {item.seed !== null ? <span className="tag">Seed {item.seed}</span> : null}
        {item.equippedSlots.map((slot) => <span key={slot} className="tag tag-vip">Equipped: {humanize(slot)}</span>)}
        {price !== null ? <span className="tag"><Coins aria-hidden="true" /> {formatTokens(price)} tokens</span> : null}
      </div>
      {actions ? <div className="hero-actions">{actions}</div> : null}
    </>
  );

  if (onSelect) {
    return (
      <button type="button" className={`panel economy-item-card ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={onSelect} aria-label={selectionLabel ?? `Select ${item.displayName}`}>
        {content}
      </button>
    );
  }

  return <article className="panel economy-item-card">{content}</article>;
}

export function EconomyEmptyState({ title, description, icon = <Box aria-hidden="true" /> }: { title: string; description: string; icon?: ReactNode }) {
  return <section className="panel"><div className="icon-box">{icon}</div><h2>{title}</h2><p className="empty-copy">{description}</p></section>;
}
