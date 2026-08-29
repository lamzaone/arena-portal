import { BadgePercent, CalendarClock, Sparkles, Tags } from "lucide-react";

import { formatTokens } from "@/components/economy/economy-view-model";

export type MarketDiscountAnnouncementItem = {
  id: number;
  displayName: string;
  targetLabel: string;
  percentageBps: number;
  fixedTokens: number;
  endsAt: string | null;
  exclusionCount: number;
};

type MarketDiscountAnnouncementProps = {
  discounts: MarketDiscountAnnouncementItem[];
};

const MAX_VISIBLE_DISCOUNTS = 6;

function percentageLabel(basisPoints: number) {
  const value = basisPoints / 100;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function adjustmentLabel(discount: MarketDiscountAnnouncementItem) {
  const parts = [
    discount.percentageBps
      ? `${percentageLabel(discount.percentageBps)}% off`
      : null,
    discount.fixedTokens
      ? `${formatTokens(discount.fixedTokens)} Tokens off`
      : null,
  ].filter(Boolean);
  return parts.join(" + ");
}

function endLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function MarketDiscountAnnouncement({
  discounts,
}: MarketDiscountAnnouncementProps) {
  if (!discounts.length) return null;
  const visibleDiscounts = discounts.slice(0, MAX_VISIBLE_DISCOUNTS);
  const hiddenCount = discounts.length - visibleDiscounts.length;

  return (
    <section
      className="market-discount-announcement"
      aria-labelledby="market-discount-announcement-title"
    >
      <div className="market-discount-announcement-icon" aria-hidden="true">
        <Sparkles />
      </div>
      <header className="market-discount-announcement-heading">
        <p className="eyebrow">
          <BadgePercent aria-hidden="true" /> Active marketplace offers
        </p>
        <h2 id="market-discount-announcement-title">
          {discounts.length} {discounts.length === 1 ? "discount is" : "discounts are"} live
        </h2>
        <p>
          Eligible prices below already include their applicable discount. No
          code is needed.
        </p>
      </header>
      <div className="market-discount-announcement-list">
        {visibleDiscounts.map((discount) => (
          <article key={discount.id}>
            <div className="market-discount-title-row">
              <strong>{discount.displayName}</strong>
              <span className="market-discount-value">
                <BadgePercent aria-hidden="true" /> {adjustmentLabel(discount)}
              </span>
            </div>
            <span className="market-discount-target">
              <Tags aria-hidden="true" /> {discount.targetLabel}
              {discount.exclusionCount
                ? ` · ${discount.exclusionCount} ${discount.exclusionCount === 1 ? "exclusion" : "exclusions"}`
                : ""}
            </span>
            {discount.endsAt ? (
              <time dateTime={discount.endsAt}>
                <CalendarClock aria-hidden="true" /> Ends {endLabel(discount.endsAt)}
              </time>
            ) : (
              <span className="market-discount-active-now">
                <Sparkles aria-hidden="true" /> Active now
              </span>
            )}
          </article>
        ))}
      </div>
      {hiddenCount ? (
        <p className="market-discount-announcement-more">
          Plus {hiddenCount} more active {hiddenCount === 1 ? "offer" : "offers"}.
        </p>
      ) : null}
    </section>
  );
}
