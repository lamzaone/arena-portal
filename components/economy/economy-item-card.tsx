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
  selectionControls?: string;
  enableMarketPreview?: boolean;
  previewFloat?: number | null;
  className?: string;
  disabled?: boolean;
};

function isVipMembership(item: EconomyItemView) {
  const catalogue = item.raw.catalogue;
  const metadata =
    typeof item.raw.metadata === "object" &&
    item.raw.metadata !== null &&
    !Array.isArray(item.raw.metadata)
      ? item.raw.metadata
      : typeof catalogue === "object" &&
          catalogue !== null &&
          !Array.isArray(catalogue) &&
          typeof (catalogue as Record<string, unknown>).metadata === "object" &&
          (catalogue as Record<string, unknown>).metadata !== null &&
          !Array.isArray((catalogue as Record<string, unknown>).metadata)
        ? (catalogue as Record<string, unknown>).metadata
        : null;
  return (
    metadata !== null &&
    (metadata as Record<string, unknown>).specialKind === "vip_membership"
  );
}

export function EconomyItemCard({
  item,
  actions,
  selected = false,
  onSelect,
  selectionLabel,
  selectionControls,
  enableMarketPreview = true,
  previewFloat = null,
  className = "",
  disabled = false,
}: EconomyItemCardProps) {
  const price = item.marketPriceTokens;
  const vipMembership = isVipMembership(item);
  const itemKind = vipMembership ? "VIP membership" : humanize(item.itemType);
  const content = (
    <>
      <MarketplaceItemPreview
        item={item}
        enableMarketPreview={enableMarketPreview}
        floatValue={previewFloat}
      />
      <div className="panel-heading">
        <div>
          <span
            className={
              vipMembership
                ? "badge economy-special-badge"
                : rarityClass(item.rarityRank)
            }
          >
            {vipMembership ? "Special" : item.rarity}
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
        {item.equippedSlots.map((slot) => <span key={slot} className="tag tag-vip">Equipped: {humanize(slot)}</span>)}
        {price !== null ? <span className="tag"><Coins aria-hidden="true" /> {formatTokens(price)} tokens</span> : null}
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

  return <article className={`panel economy-item-card ${className}`.trim()}>{content}</article>;
}

export function EconomyEmptyState({ title, description, icon = <Box aria-hidden="true" /> }: { title: string; description: string; icon?: ReactNode }) {
  return <section className="panel"><div className="icon-box">{icon}</div><h2>{title}</h2><p className="empty-copy">{description}</p></section>;
}
