"use client";

import { Box, Coins, LockKeyhole, Tag } from "lucide-react";
import type { ReactNode } from "react";

import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import { Panel } from "@/components/ui/panel";
import {
  formatTokens,
  humanize,
  rarityClass,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { economyItemTypeLabel } from "@/lib/economy/item-taxonomy";

type EconomyItemCardProps = {
  item: EconomyItemView;
  actions?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  selectionLabel?: string;
  selectionControls?: string;
  enableMarketPreview?: boolean;
  previewFloat?: number | null;
  previewOverlay?: ReactNode;
  className?: string;
  disabled?: boolean;
};

export function EconomyItemCard({
  item,
  actions,
  selected = false,
  onSelect,
  selectionLabel,
  selectionControls,
  enableMarketPreview = true,
  previewFloat = null,
  previewOverlay,
  className = "",
  disabled = false,
}: EconomyItemCardProps) {
  const price = item.marketPriceTokens;
  const basePrice = item.marketBasePriceTokens;
  const hasDiscount = Boolean(
    item.marketDiscount &&
      price !== null &&
      basePrice !== null &&
      basePrice > price,
  );
  const itemKind = economyItemTypeLabel(item.itemType);
  const content = (
    <>
      <MarketplaceItemPreview
        item={item}
        enableMarketPreview={enableMarketPreview}
        floatValue={previewFloat}
        overlay={previewOverlay}
      />
      <div className="panel-heading">
        <div>
          <span
            className={rarityClass(item.rarityRank)}
          >
            {item.rarity}
          </span>
          <h3>{item.displayName}</h3>
          <p>{itemKind}{item.nametag ? ` · “${item.nametag}”` : ""}</p>
        </div>
      </div>
      <div className="tag-list" aria-label="Item details">
        {item.stattrak ? (
          <span
            className="badge stattrak-badge"
            aria-label={`StatTrak™: ${item.stattrakCount.toLocaleString()} kills`}
          >
            <Tag aria-hidden="true" /> StatTrak™
            <small>{item.stattrakCount.toLocaleString()}</small>
          </span>
        ) : null}
        {item.floatValue !== null ? <span className="tag">Float {item.floatValue.toFixed(6)}</span> : null}
        {item.seed !== null ? <span className="tag">Seed {item.seed}</span> : null}
        {!item.tradable ? (
          <span className="tag" title="This item cannot be traded or sold.">
            <LockKeyhole aria-hidden="true" /> Untradable
          </span>
        ) : null}
        {item.equippedSlots.map((slot) => <span key={slot} className="tag tag-vip">Equipped: {humanize(slot)}</span>)}
        {price !== null ? (
          <span
            className={`tag economy-item-price-tag ${hasDiscount ? "is-discounted" : ""}`.trim()}
            aria-label={
              hasDiscount && basePrice !== null
                ? `Discounted price ${formatTokens(price)} Tokens, originally ${formatTokens(basePrice)} Tokens`
                : `${formatTokens(price)} Tokens`
            }
          >
            <Coins aria-hidden="true" />
            {hasDiscount && basePrice !== null ? (
              <del aria-hidden="true">{formatTokens(basePrice)} Tokens</del>
            ) : null}
            <strong>{formatTokens(price)} Tokens</strong>
          </span>
        ) : null}
      </div>
      {actions ? <div className="hero-actions">{actions}</div> : null}
    </>
  );

  if (onSelect) {
    return (
      <button type="button" className={`panel economy-item-card ${selected ? "is-selected" : ""} ${className}`.trim()} aria-pressed={selected} aria-expanded={selectionControls ? selected : undefined} aria-controls={selected ? selectionControls : undefined} onClick={onSelect} aria-label={selectionLabel ?? `Select ${item.displayName}`} disabled={disabled}>
        {content}
      </button>
    );
  }

  return <Panel as="article" className={`economy-item-card ${className}`.trim()}>{content}</Panel>;
}

export function EconomyEmptyState({ title, description, icon = <Box aria-hidden="true" /> }: { title: string; description: string; icon?: ReactNode }) {
  return <Panel><div className="icon-box">{icon}</div><h2>{title}</h2><p className="empty-copy">{description}</p></Panel>;
}
