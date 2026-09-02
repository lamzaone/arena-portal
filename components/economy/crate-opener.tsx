"use client";

import {
  Box,
  ChevronDown,
  Gift,
  ListChecks,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";

import {
  EconomyEmptyState,
  EconomyItemCard,
} from "@/components/economy/economy-item-card";
import {
  CrateDropPreview,
  economyCrateDropStateFromResponse,
  type EconomyCrateDrop as CrateDrop,
  type EconomyCrateDropState as CrateDropState,
} from "@/components/economy/crate-drop-preview";
import {
  createEconomyIdempotencyKey,
  postEconomyAction,
} from "@/components/economy/economy-request";
import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import {
  economyCrates,
  economyItems,
  economyWallet,
  formatTokens,
  humanize,
  rarityClass,
  rarityName,
  rarityRankClass,
  toEconomyItem,
  type EconomyCrateView,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { TokenBalance } from "@/components/economy/token-balance";
import { PortalToast } from "@/components/success-toast";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SearchField } from "@/components/ui/search-field";
import {
  ECONOMY_RARITY_RANKS,
  ECONOMY_SPECIAL_RARITY_RANK,
} from "@/lib/economy/item-taxonomy";
import {
  canAffordCratePurchase,
  clampCrateQuantity,
  cratePurchaseTotal,
  MAX_CRATE_PURCHASE_QUANTITY,
} from "@/lib/economy/crate-presentation";
import {
  activeConsumedItemIds,
  withRetainedOpenedItem,
} from "@/lib/economy/inventory-selection";

type CrateOpenerProps = {
  crates: unknown;
  inventory: unknown;
  wallet: unknown;
  csrf: string;
  mode?: "full" | "owned";
  selectionMode?: boolean;
  onSelectionModeChange?: (active: boolean) => void;
  onOwnedInteraction?: () => void;
  onOwnedOpeningChange?: (active: boolean) => void;
  interactionDisabled?: boolean;
  interactionResetKey?: number;
};

type CatalogueTypeFilter = "all" | "crate" | "capsule";
type CataloguePriceFilter = "all" | "priced" | "affordable" | "unpriced";
type CatalogueSort = "catalogue" | "price-asc" | "price-desc" | "name" | "rarity";
type CrateTab = "owned" | "market";
type OpeningState =
  // The server is authoritative for the roll. Keep a weighted filler reel
  // moving while its transaction is in flight; it intentionally has no
  // winner, so the UI can never imply a client-selected reward.
  | {
      phase: "verifying";
      crate: EconomyItemView;
      // Freeze the verified pool for this run. Selection and inventory state
      // can change while the request resolves, but filler cards must not.
      drops: CrateDrop[];
      run: number;
    }
  | {
      phase: "revealing";
      crate: EconomyItemView;
      reward: EconomyItemView;
      rewardLootEntryId: number | null;
      drops: CrateDrop[];
      run: number;
    };

type BulkOpeningRow = {
  crate: EconomyItemView;
  preparing: boolean;
  opening: OpeningState | null;
  reward: EconomyItemView | null;
  message: string | null;
  error: string | null;
};

const CATALOGUE_PAGE_SIZE = 50;
const OWNED_CRATE_PAGE_SIZE = 30;
const MAX_BULK_OPEN_CRATES = 10;
const FINAL_REEL_DURATION_MS = 4_800;
const REDUCED_MOTION_FINAL_REEL_DURATION_MS = 1_500;
const REEL_ITEM_WIDTH_PX = 132;
const REEL_ITEM_GAP_PX = 10;
const REEL_ITEM_PITCH_PX = REEL_ITEM_WIDTH_PX + REEL_ITEM_GAP_PX;
const VERIFYING_REEL_LOOP_LENGTH = 18;
const VERIFYING_REEL_REPETITIONS = 4;
const REVEAL_WINNER_INDEX = 32;
const REVEAL_REEL_LENGTH = 42;

function isCrate(item: EconomyItemView) {
  return ["crate", "case", "capsule"].includes(item.itemType);
}

function cratePriceTokens(crate: EconomyCrateView) {
  return crate.priceTokens ?? crate.cratePriceTokens ?? crate.marketPriceTokens;
}

function normalizedText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function priceSourceLabel(source: string | null) {
  switch (source) {
    case "skinport-30d-median":
      return "30-day public sales median";
    case "skinport-7d-median":
      return "7-day public sales median";
    case "skinport-90d-median":
      return "90-day public sales median";
    case "skinport-listing-median":
      return "public listing median";
    case "skinport-listing-mean":
      return "public listing mean";
    case "skinport-listing-suggested":
      return "public suggested price";
    case "csfloat-price-index":
      return "CSFloat current listing index";
    case "skincash-listing":
      return "SkinCash current listing";
    case "multi-market-index":
      return "cross-market current price";
    case "csfloat-exact-listing":
      return "CSFloat exact float/pattern listing";
    case "staff-last-known":
      return "staff last-known price";
    default:
      return source ? "recorded price" : null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number | null = null) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function crateLootPresentation(item: EconomyItemView): EconomyItemView {
  // The special-pool probability is kept server-side, but knives and gloves
  // are intentionally presented as Covert throughout this economy.
  if (item.itemType !== "knife" && item.itemType !== "glove") return item;
  return {
    ...item,
    rarityRank: 6,
    rarity: rarityName(6),
  };
}

function dropHeadline(rarityRank: number) {
  if (rarityRank >= ECONOMY_SPECIAL_RARITY_RANK) return "Special unbox";
  if (rarityRank >= 7) return "Extraordinary unbox";
  if (rarityRank >= 6) return "Covert unbox";
  if (rarityRank >= 5) return "Classified unbox";
  if (rarityRank >= 4) return "Restricted unbox";
  return "Crate reward";
}

function rewardWithDropArtwork(
  reward: EconomyItemView,
  drops: CrateDrop[],
  rewardLootEntryId: number | null = null,
) {
  // A staff table may contain the same catalogue item more than once with a
  // different float/art configuration. The opening API gives us the precise
  // winning entry, so use it before falling back to the catalogue identity.
  const matchingDrop =
    (rewardLootEntryId === null
      ? null
      : drops.find((drop) => drop.lootEntryId === rewardLootEntryId)) ??
    drops.find((drop) => drop.item.catalogueId === reward.catalogueId);
  if (!matchingDrop) return crateLootPresentation(reward);

  // The item instance returned by the opening endpoint carries the item's
  // legacy catalogue rarity. The selected loot entry is authoritative for a
  // case opening, including its precise art and float limits, after merging
  // the instance details.
  return crateLootPresentation({
    ...matchingDrop.item,
    ...reward,
    rarityRank: matchingDrop.item.rarityRank,
    rarity: matchingDrop.item.rarity,
    imageUrl: reward.imageUrl ?? matchingDrop.item.imageUrl,
  });
}

function reelDropForIndex(drops: CrateDrop[], index: number, run: number) {
  const totalWeight = drops.reduce((total, drop) => total + drop.weight, 0);
  if (totalWeight <= 0) return null;
  // Deterministic pseudo-random filler keeps React renders stable while making
  // the reel visually follow the configured loot weights instead of giving
  // every rare item the same on-screen frequency as a Mil-Spec item.
  let seed = (run ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35) >>> 0;
  const unit = ((seed ^ (seed >>> 16)) >>> 0) / 0x1_0000_0000;
  let remaining = unit * totalWeight;
  for (const drop of drops) {
    if (remaining < drop.weight) return drop;
    remaining -= drop.weight;
  }
  return drops[drops.length - 1] ?? null;
}

function reelPointerIndex(translateX: number) {
  return Math.max(
    0,
    Math.floor(
      (-translateX - REEL_ITEM_WIDTH_PX / 2) / REEL_ITEM_PITCH_PX + 0.0001,
    ),
  );
}

function translateXFromTransform(transform: string) {
  if (!transform || transform === "none") return -REEL_ITEM_WIDTH_PX / 2;
  const values = transform.match(/^matrix\((.+)\)$/)?.[1]
    .split(",")
    .map((value) => Number(value.trim()));
  if (values?.length === 6 && Number.isFinite(values[4])) return values[4];
  const matrix3d = transform.match(/^matrix3d\((.+)\)$/)?.[1]
    .split(",")
    .map((value) => Number(value.trim()));
  return matrix3d?.length === 16 && Number.isFinite(matrix3d[12])
    ? matrix3d[12]
    : -REEL_ITEM_WIDTH_PX / 2;
}

function CratePurchaseControls({
  crate,
  walletBalance,
  quantity,
  pending,
  buying,
  onQuantityChange,
  onPurchase,
}: {
  crate: EconomyCrateView;
  walletBalance: number;
  quantity: number;
  pending: boolean;
  buying: boolean;
  onQuantityChange: (quantity: number) => void;
  onPurchase: () => void;
}) {
  const priceTokens = cratePriceTokens(crate);
  const basePriceTokens = crate.marketBasePriceTokens;
  const canRefreshPrice = Boolean(crate.marketHashName);
  const hasCatalogueEntry = crate.catalogueId !== null;
  const totalPriceTokens =
    priceTokens === null ? null : cratePurchaseTotal(priceTokens, quantity);
  const unaffordable =
    priceTokens !== null &&
    !canAffordCratePurchase(walletBalance, priceTokens, quantity);
  const priceAvailable = priceTokens !== null;
  const purchaseAvailable = hasCatalogueEntry && (priceAvailable || canRefreshPrice);
  const priceDetail = !priceAvailable
    ? canRefreshPrice
      ? "The current public price will be checked before purchase."
      : "No public or staff price is available yet."
    : [
        priceSourceLabel(crate.marketPriceSource),
        crate.marketDiscount
          ? `${crate.marketDiscount.displayName}: -${formatTokens(crate.marketDiscount.discountTokens)} Tokens`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
  const buttonLabel = buying
    ? "Buying..."
    : !hasCatalogueEntry
      ? "Unavailable"
      : unaffordable
        ? "Not enough Tokens"
        : !priceAvailable && canRefreshPrice
          ? "Refresh price & buy"
          : !priceAvailable
            ? "Price pending staff"
    : `Buy ${quantity} for ${formatTokens(totalPriceTokens)} Tokens`;

  return (
    <div className="crate-catalogue-purchase crate-selected-purchase">
      <div
        className={`market-price-hud ${priceAvailable ? "" : "is-unavailable"}`}
        aria-label={
          priceAvailable
            ? `${crate.displayName} costs ${formatTokens(priceTokens)} Tokens each`
            : `${crate.displayName} price unavailable`
        }
      >
        <span>Container price</span>
        <strong>
          {priceAvailable ? `${formatTokens(priceTokens)} Tokens each` : "Price unavailable"}
        </strong>
        {priceTokens !== null &&
        basePriceTokens !== null &&
        basePriceTokens > priceTokens ? (
          <del className="market-base-price">
            Original {formatTokens(basePriceTokens)} Tokens each
          </del>
        ) : null}
        <small>{priceDetail}</small>
      </div>
      <label className="crate-quantity-control">
        <span>Amount</span>
        <div>
          <button
            type="button"
            aria-label="Buy one fewer crate"
            disabled={pending || quantity <= 1}
            onClick={() => onQuantityChange(quantity - 1)}
          >
            <Minus aria-hidden="true" />
          </button>
          <input
            type="number"
            min="1"
            max={MAX_CRATE_PURCHASE_QUANTITY}
            value={quantity}
            disabled={pending}
            aria-label="Crates to buy"
            onChange={(event) => onQuantityChange(clampCrateQuantity(event.target.value))}
          />
          <button
            type="button"
            aria-label="Buy one more crate"
            disabled={pending || quantity >= MAX_CRATE_PURCHASE_QUANTITY}
            onClick={() => onQuantityChange(quantity + 1)}
          >
            <Plus aria-hidden="true" />
          </button>
        </div>
        <small>Buy up to {MAX_CRATE_PURCHASE_QUANTITY} containers in one transaction.</small>
      </label>
      <button
        type="button"
        className="button button-primary"
        disabled={pending || !purchaseAvailable || unaffordable}
        onClick={onPurchase}
      >
        <ShoppingBag aria-hidden="true" /> {buttonLabel}
      </button>
      {unaffordable ? (
        <small className="crate-purchase-help">
          Need {formatTokens((totalPriceTokens ?? 0) - walletBalance)} more Tokens.
        </small>
      ) : null}
    </div>
  );
}

function CrateOpeningAnimation({
  opening,
  onRevealComplete,
  onTick,
}: {
  opening: OpeningState;
  onRevealComplete?: () => void;
  onTick?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const reel = useMemo(() => {
    const fallback = opening.phase === "revealing" ? opening.reward : opening.crate;
    const reelLength = opening.phase === "revealing"
      ? REVEAL_REEL_LENGTH
      : VERIFYING_REEL_LOOP_LENGTH * VERIFYING_REEL_REPETITIONS;
    return Array.from({ length: reelLength }, (_, index) =>
      opening.phase === "revealing" && index === REVEAL_WINNER_INDEX
        ? rewardWithDropArtwork(
            opening.reward,
            opening.drops,
            opening.rewardLootEntryId,
          )
        : reelDropForIndex(
            opening.drops,
            opening.phase === "verifying"
              ? index % VERIFYING_REEL_LOOP_LENGTH
              : index,
            opening.run,
          )?.item ?? fallback,
    );
  }, [opening]);

  const isVerifying = opening.phase === "verifying";
  const reelStyle = {
    "--reel-start-offset": `${-(REEL_ITEM_WIDTH_PX / 2)}px`,
    "--reel-loop-offset": `${-(
      VERIFYING_REEL_LOOP_LENGTH * REEL_ITEM_PITCH_PX +
      REEL_ITEM_WIDTH_PX / 2
    )}px`,
    "--reel-final-offset": `${-(
      REVEAL_WINNER_INDEX * REEL_ITEM_PITCH_PX + REEL_ITEM_WIDTH_PX / 2
    )}px`,
  } as CSSProperties;

  useEffect(() => {
    if (!onTick) return;
    let animationFrame = 0;
    let previousIndex = 0;

    const tickOnPassedItems = () => {
      const track = trackRef.current;
      if (track) {
        const currentIndex = reelPointerIndex(
          translateXFromTransform(getComputedStyle(track).transform),
        );
        if (currentIndex > previousIndex) {
          // The fast processing loop can pass more than one card in a frame.
          // Preserve its wheel-like cadence without creating an audio burst.
          onTick?.();
        }
        previousIndex = currentIndex;
      }
      animationFrame = window.requestAnimationFrame(tickOnPassedItems);
    };

    animationFrame = window.requestAnimationFrame(tickOnPassedItems);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [onTick, opening.phase, opening.run]);

  return <section className={`crate-opening-animation reeling ${isVerifying ? "is-verifying" : "is-revealing"}`} aria-live="polite">
    <div className="crate-opening-pointer" aria-hidden="true" />
    <div className="crate-opening-reel-window"><div ref={trackRef} key={`${opening.run}-${opening.phase}`} className={`crate-opening-reel-track ${isVerifying ? "is-verifying" : "is-revealing"}`} style={reelStyle} onAnimationEnd={(event) => {
      if (!isVerifying && event.target === event.currentTarget) onRevealComplete?.();
    }}>
      {reel.map((item, index) => <article key={`${opening.run}-${opening.phase}-${index}`} className={`crate-opening-reel-item ${!isVerifying && index === REVEAL_WINNER_INDEX ? "winner" : ""} ${rarityRankClass(item.rarityRank)}`}><MarketplaceItemPreview item={item} enableMarketPreview={false} /><span>{item.displayName}</span></article>)}
    </div></div>
    {isVerifying ? <p aria-label="Opening crate"><LoaderCircle aria-hidden="true" className="crate-opening-spinner" /></p> : null}
  </section>;
}

function OwnedCrateInlineOpener({
  crate,
  dropState,
  opening,
  reward,
  rewardMessage,
  busy,
  onOpen,
  onClose,
  onRevealComplete,
  onTick,
}: {
  crate: EconomyItemView;
  dropState: CrateDropState;
  opening: OpeningState | null;
  reward: EconomyItemView | null;
  rewardMessage: string | null;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRevealComplete: () => void;
  onTick: () => void;
}) {
  const [showDrops, setShowDrops] = useState(false);
  const openingHere = opening?.crate.id === crate.id ? opening : null;
  const displayedRarity = reward?.rarityRank ?? null;
  const dropCount = dropState.status === "ready" ? dropState.drops.length : null;
  const dropsId = `crate-opening-drops-${crate.id}`;
  const openerId = `crate-opening-${crate.id}`;
  const dropButtonLabel = showDrops
    ? "Hide possible drops"
    : dropCount !== null
      ? `Show ${dropCount.toLocaleString()} possible drops`
      : "Show possible drops";

  return (
    <section
      id={openerId}
      data-ui="item-modal"
      className={`panel crate-inline-modal ${openingHere ? "is-opening" : ""} ${showDrops && !openingHere && !reward ? "has-drop-odds" : ""} ${displayedRarity === null ? "" : `is-reward ${rarityRankClass(displayedRarity)}`}`}
      aria-label={`Open ${crate.displayName}`}
    >
      <header className="crate-inline-modal-header">
        <div>
          <p className="eyebrow"><Gift aria-hidden="true" /> Opening station</p>
          <h3>{crate.displayName}</h3>
          <p>Open this container without a key, or inspect its live server-verified pool first.</p>
        </div>
        <button
          type="button"
          className="button button-quiet crate-inline-modal-close"
          onClick={onClose}
          disabled={busy}
          aria-label={`Close ${crate.displayName} opening panel`}
        >
          <X aria-hidden="true" /> Close
        </button>
      </header>

      {openingHere ? (
        <CrateOpeningAnimation
          opening={openingHere}
          onRevealComplete={onRevealComplete}
          onTick={onTick}
        />
      ) : reward ? (
        <section className={`crate-inline-reward crate-drop-reveal ${rarityRankClass(reward.rarityRank)}`} aria-live="polite">
          <div className="crate-inline-reward-copy">
            <p className="eyebrow"><Trophy aria-hidden="true" /> {dropHeadline(reward.rarityRank)}</p>
            <h2>{reward.displayName}</h2>
            <p className="empty-copy">Added to your inventory. You can inspect, equip, trade, or customize it from Inventory.</p>
            <span className={rarityClass(reward.rarityRank)}>{reward.rarity}</span>
            {reward.rarityRank >= 4 ? <p className="crate-global-drop-note"><Sparkles aria-hidden="true" /> Pink-and-above unboxes are announced in global chat while you are online.</p> : null}
            {rewardMessage ? <p className="crate-inline-reward-notice" role="status"><Sparkles aria-hidden="true" /> {rewardMessage}</p> : null}
          </div>
          <EconomyItemCard item={reward} enableMarketPreview />
        </section>
      ) : (
        <>
          <div className="crate-inline-modal-overview">
            <MarketplaceItemPreview item={crate} enableMarketPreview />
            <div className="crate-inline-modal-copy">
              <span className={rarityClass(crate.rarityRank)}>{crate.rarity}</span>
              <h4>{crate.displayName}</h4>
              <p>{crate.description ?? `Ready to open this ${humanize(crate.itemType)}.`}</p>
              <div className="tag-list">
                <span className="tag">No key required</span>
                {dropCount !== null ? <span className="tag">{dropCount.toLocaleString()} possible outcomes</span> : null}
              </div>
            </div>
            <div className="crate-inline-modal-actions">
              <button
                type="button"
                className="button button-primary button-large"
                disabled={busy || dropState.status !== "ready"}
                onClick={onOpen}
              >
                <Gift aria-hidden="true" /> {dropState.status === "loading" ? "Loading drops…" : "Open crate"}
              </button>
              <button
                type="button"
                className="button button-secondary crate-inline-drops-toggle"
                aria-expanded={showDrops}
                aria-controls={showDrops ? dropsId : undefined}
                onClick={() => setShowDrops((visible) => !visible)}
              >
                <ChevronDown aria-hidden="true" /> {dropButtonLabel}
              </button>
              <small>
                {dropState.status === "loading"
                  ? "Loading the active drop pool..."
                  : dropState.status === "empty" || dropState.status === "error"
                    ? "Drop odds are unavailable right now."
                    : "Opening is verified server-side."}
              </small>
            </div>
          </div>
          {showDrops ? (
            <div id={dropsId} className="crate-inline-modal-drops">
              <CrateDropPreview state={dropState} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function BulkCrateOpeningRows({
  rows,
  onRevealComplete,
  onDismiss,
}: {
  rows: BulkOpeningRow[];
  onRevealComplete: (crateId: string) => void;
  onDismiss: () => void;
}) {
  if (!rows.length) return null;
  const finished = rows.every((row) => !row.preparing && !row.opening);

  return (
    <section className="crate-bulk-openings" aria-labelledby="crate-bulk-openings-heading">
      <header className="crate-bulk-openings-heading">
        <div>
          <p className="eyebrow"><Gift aria-hidden="true" /> Multi-open station</p>
          <h3 id="crate-bulk-openings-heading">
            {finished ? "Opening results" : `Opening ${rows.length} crates`}
          </h3>
          <p>Each container keeps its own server-verified reel and result row.</p>
        </div>
        {finished ? (
          <button type="button" className="button button-quiet" onClick={onDismiss}>
            <X aria-hidden="true" /> Dismiss results
          </button>
        ) : null}
      </header>
      <div className="crate-bulk-opening-list">
        {rows.map((row, index) => {
          const rarity = row.reward?.rarityRank ?? null;
          return (
            <article
              key={row.crate.id}
              data-ui="item-modal"
              className={`panel crate-inline-modal crate-bulk-opening-row ${row.opening ? "is-opening" : ""} ${rarity === null ? "" : `is-reward ${rarityRankClass(rarity)}`}`}
              aria-label={`${row.crate.displayName}, opening ${index + 1} of ${rows.length}`}
            >
              <header className="crate-inline-modal-header">
                <div>
                  <p className="eyebrow">Opening {index + 1} of {rows.length}</p>
                  <h3>{row.crate.displayName}</h3>
                  <p>Server-verified container opening.</p>
                </div>
                <span className="tag">
                  {row.preparing
                    ? "Loading drops"
                    : row.opening?.phase === "verifying"
                      ? "Verifying roll"
                      : row.opening?.phase === "revealing"
                        ? "Revealing"
                        : row.error
                          ? "Failed"
                          : "Complete"}
                </span>
              </header>
              {row.preparing ? (
                <div className="crate-bulk-preparing" role="status">
                  <LoaderCircle aria-hidden="true" className="crate-opening-spinner" />
                  <div>
                    <strong>Loading the active drop pool</strong>
                    <span>The opening starts as soon as its possible rewards are verified.</span>
                  </div>
                </div>
              ) : row.opening ? (
                <CrateOpeningAnimation
                  opening={row.opening}
                  onRevealComplete={() => onRevealComplete(row.crate.id)}
                />
              ) : row.reward ? (
                <section className={`crate-inline-reward crate-drop-reveal ${rarityRankClass(row.reward.rarityRank)}`} aria-live="polite">
                  <div className="crate-inline-reward-copy">
                    <p className="eyebrow"><Trophy aria-hidden="true" /> {dropHeadline(row.reward.rarityRank)}</p>
                    <h2>{row.reward.displayName}</h2>
                    <p className="empty-copy">Added to your inventory. You can inspect, equip, trade, or customize it from Inventory.</p>
                    <span className={rarityClass(row.reward.rarityRank)}>{row.reward.rarity}</span>
                    {row.reward.rarityRank >= 4 ? <p className="crate-global-drop-note"><Sparkles aria-hidden="true" /> Pink-and-above unboxes are announced in global chat while you are online.</p> : null}
                    {row.message ? <p className="crate-inline-reward-notice" role="status"><Sparkles aria-hidden="true" /> {row.message}</p> : null}
                  </div>
                  <EconomyItemCard item={row.reward} enableMarketPreview />
                </section>
              ) : (
                <p className="crate-bulk-error" role="alert">
                  {row.error ?? "This crate could not be opened."}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MarketCrateInlineOpener({
  crate,
  dropState,
  busy,
  purchasing,
  quantity,
  walletBalance,
  onQuantityChange,
  onPurchase,
  onClose,
}: {
  crate: EconomyCrateView;
  dropState: CrateDropState;
  busy: boolean;
  purchasing: boolean;
  quantity: number;
  walletBalance: number;
  onQuantityChange: (quantity: number) => void;
  onPurchase: () => void;
  onClose: () => void;
}) {
  const [showDrops, setShowDrops] = useState(false);
  const dropCount = dropState.status === "ready" ? dropState.drops.length : null;
  const dropsId = `crate-market-drops-${crate.catalogueId ?? crate.id}`;

  return <section data-ui="item-modal" id={`crate-market-opening-${crate.catalogueId ?? crate.id}`} className={`panel crate-inline-modal crate-market-inline-modal ${showDrops ? "has-drop-odds" : ""}`} aria-label={`Buy ${crate.displayName}`}>
    <header className="crate-inline-modal-header">
      <div>
        <p className="eyebrow"><ShoppingBag aria-hidden="true" /> Container market</p>
        <h3>{crate.displayName}</h3>
        <p>Buy this container at its listed Token price, then open it from your Owned tab.</p>
      </div>
      <button type="button" className="button button-quiet crate-inline-modal-close" onClick={onClose} disabled={busy} aria-label={`Close ${crate.displayName} market panel`}>
        <X aria-hidden="true" /> Close
      </button>
    </header>
    <div className="crate-inline-modal-overview">
      <MarketplaceItemPreview item={crate} enableMarketPreview />
      <div className="crate-inline-modal-copy">
        <span className={rarityClass(crate.rarityRank)}>{crate.rarity}</span>
        <h4>{crate.displayName}</h4>
        <p>{crate.description ?? `Available as a ${humanize(crate.itemType)}.`}</p>
        <div className="tag-list">
          <span className="tag">No key required</span>
          {dropCount !== null ? <span className="tag">{dropCount.toLocaleString()} possible outcomes</span> : null}
        </div>
      </div>
      <div className="crate-market-inline-actions">
        <CratePurchaseControls crate={crate} walletBalance={walletBalance} quantity={quantity} pending={busy} buying={purchasing} onQuantityChange={onQuantityChange} onPurchase={onPurchase} />
        <button type="button" className="button button-secondary crate-inline-drops-toggle" aria-expanded={showDrops} aria-controls={showDrops ? dropsId : undefined} onClick={() => setShowDrops((visible) => !visible)} disabled={busy}>
          <ChevronDown aria-hidden="true" /> {showDrops ? "Hide possible drops" : dropCount !== null ? `Show ${dropCount.toLocaleString()} possible drops` : "Show possible drops"}
        </button>
      </div>
    </div>
    {showDrops ? <div id={dropsId} className="crate-inline-modal-drops"><CrateDropPreview state={dropState} /></div> : null}
  </section>;
}

function CrateSelectionStage({
  tab,
  crate,
  cratePriceTokens,
  opening,
  busy,
  purchasing,
  quantity,
  walletBalance,
  onQuantityChange,
  onOpen,
  onPurchase,
}: {
  tab: CrateTab;
  crate: EconomyItemView | EconomyCrateView | null;
  cratePriceTokens: number | null;
  opening: OpeningState | null;
  busy: boolean;
  purchasing: boolean;
  quantity: number;
  walletBalance: number;
  onQuantityChange: (quantity: number) => void;
  onOpen: () => void;
  onPurchase: () => void;
}) {
  if (opening) return <aside className="panel crate-opening-stage"><CrateOpeningAnimation opening={opening} /></aside>;

  if (!crate) {
    return <aside className="panel crate-opening-stage"><div className="crate-selection-empty"><Gift aria-hidden="true" /><h3>Select a crate</h3><p>{tab === "owned" ? "Choose an owned case or capsule to inspect its odds and open it without a key." : "Choose a case or capsule to inspect its odds, set the quantity, and buy it."}</p></div></aside>;
  }

  return <aside className="panel crate-opening-stage" aria-live="polite">
    <MarketplaceItemPreview item={crate} enableMarketPreview />
    <div className="crate-opening-stage-copy">
      <span className={rarityClass(crate.rarityRank)}>{crate.rarity}</span>
      <h3>{crate.displayName}</h3>
      <p>{crate.description ?? `Ready to ${tab === "owned" ? "open" : "buy"} this ${humanize(crate.itemType)}.`}</p>
      <div className="tag-list">
        {cratePriceTokens !== null ? <span className="tag">{formatTokens(cratePriceTokens)} Token container rate</span> : null}
        <span className="tag">{tab === "owned" ? "No key required" : "Explicit discounts only"}</span>
      </div>
    </div>
    {tab === "owned" ? <button type="button" className="button button-primary button-large" disabled={busy} onClick={onOpen}>{busy ? "Opening…" : `Open ${crate.displayName}`}</button> : <CratePurchaseControls crate={crate as EconomyCrateView} walletBalance={walletBalance} quantity={quantity} pending={busy} buying={purchasing} onQuantityChange={onQuantityChange} onPurchase={onPurchase} />}
  </aside>;
}

export function CrateOpener({
  crates,
  inventory,
  wallet,
  csrf,
  mode = "full",
  selectionMode: controlledSelectionMode,
  onSelectionModeChange,
  onOwnedInteraction,
  onOwnedOpeningChange,
  interactionDisabled = false,
  interactionResetKey = 0,
}: CrateOpenerProps) {
  const ownedOnly = mode === "owned";
  const router = useRouter();
  const crateCatalogue = useMemo(() => economyCrates(crates), [crates]);
  const inventoryCrates = useMemo(
    () => economyItems(inventory).filter(isCrate),
    [inventory],
  );
  // A crate remains on the server-backed inventory until the current RSC
  // payload refreshes. Hide confirmed-opened crate IDs locally so it cannot
  // reappear between its result reveal and that refresh.
  const [consumedCrateIds, setConsumedCrateIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [retainedOpenedCrate, setRetainedOpenedCrate] =
    useState<EconomyItemView | null>(null);
  const [retainedOpenedCrateIndex, setRetainedOpenedCrateIndex] = useState(0);
  const ownedCrates = useMemo(
    () => inventoryCrates.filter((crate) => !consumedCrateIds.has(crate.id)),
    [consumedCrateIds, inventoryCrates],
  );
  const displayedOwnedCrates = useMemo(
    () => withRetainedOpenedItem(
      inventoryCrates.filter(
        (crate) =>
          !consumedCrateIds.has(crate.id) ||
          crate.id === retainedOpenedCrate?.id,
      ),
      retainedOpenedCrate,
      retainedOpenedCrateIndex,
    ),
    [consumedCrateIds, inventoryCrates, retainedOpenedCrate, retainedOpenedCrateIndex],
  );
  const walletView = useMemo(() => economyWallet(wallet), [wallet]);
  const [activeTab, setActiveTab] = useState<CrateTab>("owned");
  const [ownedPage, setOwnedPage] = useState(1);
  const [selectedCrateId, setSelectedCrateId] = useState("");
  const [internalSelectionMode, setInternalSelectionMode] = useState(false);
  const selectionMode = controlledSelectionMode ?? internalSelectionMode;
  const [bulkSelectedCrateIds, setBulkSelectedCrateIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkOpenConfirming, setBulkOpenConfirming] = useState(false);
  const [bulkOpeningRows, setBulkOpeningRows] = useState<BulkOpeningRow[]>([]);
  const [selectedMarketCatalogueId, setSelectedMarketCatalogueId] = useState<
    number | null
  >(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const [catalogueType, setCatalogueType] = useState<CatalogueTypeFilter>("all");
  const [catalogueRarity, setCatalogueRarity] = useState("");
  const [cataloguePrice, setCataloguePrice] = useState<CataloguePriceFilter>("all");
  const [catalogueSort, setCatalogueSort] = useState<CatalogueSort>("catalogue");
  const [cataloguePage, setCataloguePage] = useState(1);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [unboxed, setUnboxed] = useState<EconomyItemView | null>(null);
  const [unboxedCrateId, setUnboxedCrateId] = useState<string | null>(null);
  const [unboxMessage, setUnboxMessage] = useState<string | null>(null);
  const [dropState, setDropState] = useState<CrateDropState>({
    status: "idle",
  });
  const [opening, setOpening] = useState<OpeningState | null>(null);
  const [activeAction, setActiveAction] = useState<
    "open" | "bulk-open" | "purchase" | null
  >(null);
  const [pending, startTransition] = useTransition();
  const revealTimer = useRef<number | null>(null);
  const bulkRevealTimers = useRef<Map<string, number>>(new Map());
  const bulkOpenRequestRef = useRef<{
    signature: string;
    idempotencyKey: string;
  } | null>(null);
  const revealComplete = useRef<(() => void) | null>(null);
  const reelAudio = useRef<AudioContext | null>(null);
  const reelTickCount = useRef(0);
  const refreshAfterBulkOpen = useRef(false);
  const ownedGridRef = useRef<HTMLDivElement | null>(null);
  const [ownedGridColumns, setOwnedGridColumns] = useState(1);
  const marketGridRef = useRef<HTMLDivElement | null>(null);
  const [marketGridColumns, setMarketGridColumns] = useState(1);

  const ownedPageCount = Math.max(
    1,
    Math.ceil(displayedOwnedCrates.length / OWNED_CRATE_PAGE_SIZE),
  );
  const visibleOwnedPage = Math.min(ownedPage, ownedPageCount);
  const ownedPageStart = (visibleOwnedPage - 1) * OWNED_CRATE_PAGE_SIZE;
  const visibleOwnedCrates = displayedOwnedCrates.slice(
    ownedPageStart,
    ownedPageStart + OWNED_CRATE_PAGE_SIZE,
  );
  const visibleUnopenedCrates = visibleOwnedCrates.filter(
    (crate) => !consumedCrateIds.has(crate.id),
  );
  const ownedPageEnd = Math.min(
    ownedCrates.length,
    ownedPageStart + visibleUnopenedCrates.length,
  );
  const bulkSelectedCrates = ownedCrates.filter((crate) =>
    bulkSelectedCrateIds.has(crate.id),
  );
  const selectedOwnedCrate =
    ownedCrates.find((item) => item.id === selectedCrateId) ??
    (retainedOpenedCrate?.id === selectedCrateId
      ? retainedOpenedCrate
      : null);
  const selectedMarketCrate =
    crateCatalogue.find(
      (crate) => crate.catalogueId === selectedMarketCatalogueId,
    ) ?? null;
  const selectedCrate =
    ownedOnly || activeTab === "owned" ? selectedOwnedCrate : selectedMarketCrate;
  const bulkAnimating = bulkOpeningRows.some(
    (row) => row.preparing || row.opening !== null,
  );
  const localBusy = pending || activeAction !== null || bulkAnimating;
  const busy = localBusy || interactionDisabled;
  const openingCrateId = opening?.crate.id ?? null;
  const selectedVisibleCrateIndex = visibleOwnedCrates.findIndex(
    (item) => item.id === selectedCrateId,
  );
  const selectedCatalogueId = selectedCrate?.catalogueId ?? null;
  const selectedDrops = dropState.status === "ready" ? dropState.drops : [];
  const ownedInlineOpenerIndex = selectedVisibleCrateIndex < 0 || !visibleOwnedCrates.length
    ? -1
    : Math.min(
        visibleOwnedCrates.length - 1,
        Math.ceil((selectedVisibleCrateIndex + 1) / ownedGridColumns) *
          ownedGridColumns -
          1,
      );
  const searchTerms = useMemo(
    () => normalizedText(catalogueQuery).split(" ").filter(Boolean),
    [catalogueQuery],
  );
  const selectedRarity = catalogueRarity ? Number(catalogueRarity) : null;
  const filteredCatalogue = useMemo(() => {
    const matching = crateCatalogue.filter((crate) => {
      const priceTokens = cratePriceTokens(crate);
      if (catalogueType !== "all" && crate.itemType !== catalogueType)
        return false;
      if (
        selectedRarity !== null &&
        (!Number.isSafeInteger(selectedRarity) ||
          crate.rarityRank !== selectedRarity)
      ) {
        return false;
      }
      if (cataloguePrice === "priced" && priceTokens === null) return false;
      if (
        cataloguePrice === "affordable" &&
        (priceTokens === null || priceTokens > walletView.balance)
      ) {
        return false;
      }
      if (cataloguePrice === "unpriced" && priceTokens !== null) return false;
      if (!searchTerms.length) return true;
      const searchable = normalizedText(
        [
          crate.displayName,
          crate.marketHashName ?? "",
          crate.description ?? "",
          crate.code ?? "",
          crate.itemType,
          crate.rarity,
        ].join(" "),
      );
      return searchTerms.every((term) => searchable.includes(term));
    });

    return matching.sort((left, right) => {
      const leftPrice = cratePriceTokens(left);
      const rightPrice = cratePriceTokens(right);
      if (catalogueSort === "price-asc" || catalogueSort === "price-desc") {
        if (leftPrice === null && rightPrice !== null) return 1;
        if (leftPrice !== null && rightPrice === null) return -1;
        if (leftPrice !== null && rightPrice !== null && leftPrice !== rightPrice) {
          return catalogueSort === "price-asc"
            ? leftPrice - rightPrice
            : rightPrice - leftPrice;
        }
      }
      if (catalogueSort === "rarity" && left.rarityRank !== right.rarityRank)
        return right.rarityRank - left.rarityRank;
      if (catalogueSort === "name")
        return left.displayName.localeCompare(right.displayName);
      return 0;
    });
  }, [
    cataloguePrice,
    catalogueSort,
    catalogueType,
    crateCatalogue,
    searchTerms,
    selectedRarity,
    walletView.balance,
  ]);
  const cataloguePageCount = Math.max(
    1,
    Math.ceil(filteredCatalogue.length / CATALOGUE_PAGE_SIZE),
  );
  const visibleCataloguePage = Math.min(cataloguePage, cataloguePageCount);
  const catalogueStart = (visibleCataloguePage - 1) * CATALOGUE_PAGE_SIZE;
  const catalogueItems = filteredCatalogue.slice(
    catalogueStart,
    catalogueStart + CATALOGUE_PAGE_SIZE,
  );
  const selectedMarketCrateIndex = catalogueItems.findIndex(
    (item) => item.catalogueId === selectedMarketCatalogueId,
  );
  const marketInlineOpenerIndex = selectedMarketCrateIndex < 0
    ? -1
    : Math.min(
        catalogueItems.length - 1,
        Math.ceil((selectedMarketCrateIndex + 1) / marketGridColumns) *
          marketGridColumns -
          1,
      );
  const catalogueEnd = Math.min(
    filteredCatalogue.length,
    catalogueStart + catalogueItems.length,
  );
  const filtersActive = Boolean(
    catalogueQuery ||
      catalogueType !== "all" ||
      catalogueRarity ||
      cataloguePrice !== "all" ||
      catalogueSort !== "catalogue",
  );

  useEffect(() => {
    setCataloguePage(1);
  }, [
    cataloguePrice,
    catalogueQuery,
    catalogueRarity,
    catalogueSort,
    catalogueType,
  ]);

  useEffect(() => {
    setPurchaseQuantity(1);
  }, [activeTab, selectedMarketCatalogueId]);

  useEffect(() => {
    setOwnedPage((current) => Math.min(current, ownedPageCount));
  }, [ownedPageCount]);

  useEffect(() => {
    setBulkSelectedCrateIds((current) => {
      const next = new Set(
        [...current].filter((crateId) =>
          ownedCrates.some((crate) => crate.id === crateId),
        ),
      );
      return next.size === current.size ? current : next;
    });
  }, [ownedCrates]);

  useEffect(() => {
    if (
      selectedCrateId &&
      !visibleOwnedCrates.some((crate) => crate.id === selectedCrateId) &&
      selectedCrateId !== retainedOpenedCrate?.id
    ) {
      setSelectedCrateId("");
    }
  }, [retainedOpenedCrate?.id, selectedCrateId, visibleOwnedCrates]);

  useEffect(() => {
    setConsumedCrateIds((current) => {
      const next = new Set(activeConsumedItemIds(
        current,
        new Set(inventoryCrates.map((crate) => crate.id)),
        retainedOpenedCrate?.id ?? null,
      ));
      return next.size === current.size ? current : next;
    });
  }, [inventoryCrates, retainedOpenedCrate?.id]);

  useEffect(() => {
    if (
      selectedMarketCatalogueId !== null &&
      !catalogueItems.some((item) => item.catalogueId === selectedMarketCatalogueId)
    ) {
      setSelectedMarketCatalogueId(null);
    }
  }, [catalogueItems, selectedMarketCatalogueId]);

  useEffect(() => {
    if (selectionMode) return;
    setBulkSelectedCrateIds(new Set());
    setBulkOpenConfirming(false);
  }, [selectionMode]);

  useEffect(() => {
    if (!ownedOnly) return;
    onOwnedOpeningChange?.(
      localBusy || unboxed !== null || bulkOpeningRows.length > 0,
    );
  }, [bulkOpeningRows.length, localBusy, onOwnedOpeningChange, ownedOnly, unboxed]);

  useEffect(() => {
    if (!interactionDisabled && interactionResetKey === 0) return;
    setSelectedCrateId("");
    setBulkSelectedCrateIds(new Set());
    setBulkOpenConfirming(false);
    if (controlledSelectionMode === undefined) setInternalSelectionMode(false);
    clearUnboxResult();
  }, [interactionDisabled, interactionResetKey]);

  useEffect(() => {
    if (
      !refreshAfterBulkOpen.current ||
      !bulkOpeningRows.length ||
      bulkOpeningRows.some((row) => row.preparing || row.opening !== null)
    ) {
      return;
    }
    refreshAfterBulkOpen.current = false;
    router.refresh();
  }, [bulkOpeningRows, router]);

  useEffect(() => {
    const grid = ownedGridRef.current;
    if (!grid) return;

    const syncColumnCount = () => {
      const columns = getComputedStyle(grid).gridTemplateColumns
        .split(" ")
        .filter(Boolean).length;
      setOwnedGridColumns((current) => Math.max(1, columns) === current
        ? current
        : Math.max(1, columns));
    };

    syncColumnCount();
    const observer = new ResizeObserver(syncColumnCount);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [activeTab, visibleOwnedCrates.length]);

  useEffect(() => {
    const grid = marketGridRef.current;
    if (!grid) return;

    const syncColumnCount = () => {
      const columns = getComputedStyle(grid).gridTemplateColumns
        .split(" ")
        .filter(Boolean).length;
      setMarketGridColumns((current) => Math.max(1, columns) === current
        ? current
        : Math.max(1, columns));
    };

    syncColumnCount();
    const observer = new ResizeObserver(syncColumnCount);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [activeTab, catalogueItems.length]);

  useEffect(() => {
    if (selectedCatalogueId === null) {
      setDropState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setDropState({ status: "loading" });
    void fetch(`/api/economy/crates/${selectedCatalogueId}/drops`, {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = isRecord(body) && typeof body.message === "string"
            ? body.message
            : "Crate odds are unavailable.";
          throw new Error(message);
        }
        return economyCrateDropStateFromResponse(body);
      })
      .then((state) => {
        if (!controller.signal.aborted) setDropState(state);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDropState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Crate odds are unavailable.",
        });
      });
    return () => controller.abort();
  }, [selectedCatalogueId]);

  useEffect(
    () => () => {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
      for (const timer of bulkRevealTimers.current.values())
        window.clearTimeout(timer);
      bulkRevealTimers.current.clear();
      revealComplete.current = null;
      if (reelAudio.current && reelAudio.current.state !== "closed") {
        void reelAudio.current.close();
      }
    },
    [],
  );

  function prepareReelAudio() {
    try {
      const context = reelAudio.current ?? new AudioContext();
      reelAudio.current = context;
      if (context.state === "suspended") void context.resume().catch(() => undefined);
    } catch {
      // Audio is an enhancement; opening remains fully functional when a
      // browser or device does not expose Web Audio.
    }
  }

  function playReelTick() {
    const context = reelAudio.current;
    if (!context || context.state !== "running") return;

    const now = context.currentTime;
    const tick = reelTickCount.current++;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(tick % 3 === 0 ? 760 : 980, now);
    oscillator.frequency.exponentialRampToValueAtTime(510, now + 0.026);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.034);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  function openCrate() {
    if (!selectedOwnedCrate || busy || opening) return;
    if (dropState.status !== "ready") {
      setNotice({
        type: "error",
        text: "The verified drop pool is still loading. Please try again in a moment.",
      });
      return;
    }
    const crate = selectedOwnedCrate;
    onOwnedInteraction?.();
    const dropsForOpening = [...dropState.drops];
    prepareReelAudio();
    setNotice(null);
    setUnboxed(null);
    setUnboxedCrateId(null);
    setUnboxMessage(null);
    setOpening({
      phase: "verifying",
      crate,
      drops: dropsForOpening,
      run: Date.now(),
    });
    setActiveAction("open");
    void (async () => {
      try {
        const result = await postEconomyAction("/api/economy/crates/open", csrf, {
          crateItemId: crate.id,
        });
        const resultItem = result.item ? toEconomyItem(result.item) : null;
        if (!resultItem || (!resultItem.id && resultItem.displayName === "Unnamed item"))
          throw new Error("The crate opened, but its reward could not be displayed. Reload Inventory to view it.");
        const rewardLootEntryId = finiteNumber(result.rewardLootEntryId);
        const reward = rewardWithDropArtwork(
          resultItem,
          dropsForOpening,
          rewardLootEntryId !== null && Number.isSafeInteger(rewardLootEntryId)
            ? rewardLootEntryId
            : null,
        );
        // The reward payload is now safely available to present. Remove the
        // consumed crate from the owned collection before the reveal begins,
        // while retaining its opener context so the animation stays mounted.
        setRetainedOpenedCrateIndex(
          Math.max(0, inventoryCrates.findIndex((item) => item.id === crate.id)),
        );
        setRetainedOpenedCrate(crate);
        setConsumedCrateIds((current) => {
          const next = new Set(current);
          next.add(crate.id);
          return next;
        });
        const run = Date.now();
        setOpening({
          phase: "revealing",
          crate,
          reward,
          rewardLootEntryId:
            rewardLootEntryId !== null && Number.isSafeInteger(rewardLootEntryId)
              ? rewardLootEntryId
              : null,
          drops: dropsForOpening,
          run,
        });
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? REDUCED_MOTION_FINAL_REEL_DURATION_MS
          : FINAL_REEL_DURATION_MS;
        await new Promise<void>((resolve) => {
          let finished = false;
          const finishReveal = () => {
            if (finished) return;
            finished = true;
            if (revealTimer.current !== null) {
              window.clearTimeout(revealTimer.current);
              revealTimer.current = null;
            }
            revealComplete.current = null;
            resolve();
          };
          revealComplete.current = finishReveal;
          // The animation event is authoritative. This only protects against
          // an interrupted animation or a browser that suppresses the event.
          revealTimer.current = window.setTimeout(finishReveal, duration + 400);
        });
        setOpening(null);
        setUnboxed(reward);
        setUnboxedCrateId(crate.id);
        setUnboxMessage(
          result.globalAnnouncementQueued
            ? `${reward.displayName} was unboxed and announced in global chat.`
            : result.message || "Crate opened. The item is now in your inventory.",
        );
        // Keep the consumed crate card mounted until the player closes or
        // switches this opener. That preserves the reel and result in one
        // continuous panel instead of letting a refresh remove it mid-reveal.
        router.refresh();
      } catch (error) {
        // A lost response can hide a committed server transaction. Refresh
        // authoritatively on every failure while preserving this notice.
        router.refresh();
        setNotice({
          type: "error",
          text:
            error instanceof Error ? error.message : "The crate could not be opened.",
        });
      } finally {
        if (revealTimer.current !== null) {
          window.clearTimeout(revealTimer.current);
          revealTimer.current = null;
        }
        revealComplete.current = null;
        setOpening(null);
        setActiveAction(null);
      }
    })();
  }

  function completeBulkReveal(crateId: string) {
    const timer = bulkRevealTimers.current.get(crateId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      bulkRevealTimers.current.delete(crateId);
    }
    setBulkOpeningRows((current) =>
      current.map((row) =>
        row.crate.id === crateId ? { ...row, opening: null } : row,
      ),
    );
  }

  function toggleCrateSelection(crate: EconomyItemView) {
    if (busy) return;
    setBulkOpenConfirming(false);
    if (
      !bulkSelectedCrateIds.has(crate.id) &&
      bulkSelectedCrateIds.size >= MAX_BULK_OPEN_CRATES
    ) {
      setNotice({
        type: "error",
        text: `You can open up to ${MAX_BULK_OPEN_CRATES} crates at once.`,
      });
      return;
    }
    setNotice(null);
    setBulkSelectedCrateIds((current) => {
      const next = new Set(current);
      if (next.has(crate.id)) {
        next.delete(crate.id);
        return next;
      }
      next.add(crate.id);
      return next;
    });
  }

  function selectOwnedPage() {
    if (busy) return;
    setBulkOpenConfirming(false);
    setBulkSelectedCrateIds((current) => {
      const next = new Set(current);
      for (const crate of visibleOwnedCrates) {
        if (next.size >= MAX_BULK_OPEN_CRATES) break;
        if (consumedCrateIds.has(crate.id)) continue;
        next.add(crate.id);
      }
      return next;
    });
  }

  function changeSelectionMode(active: boolean) {
    if (controlledSelectionMode === undefined) setInternalSelectionMode(active);
    onSelectionModeChange?.(active);
    if (!active) {
      setBulkSelectedCrateIds(new Set());
      setBulkOpenConfirming(false);
    }
  }

  function toggleCrateSelectionMode() {
    if (busy) return;
    if (!selectionMode) onOwnedInteraction?.();
    changeSelectionMode(!selectionMode);
    setBulkOpenConfirming(false);
    setSelectedCrateId("");
    clearUnboxResult();
  }

  function changeOwnedPage(page: number) {
    setOwnedPage(page);
    setSelectedCrateId("");
    clearUnboxResult();
  }

  async function openSelectedCrates() {
    if (!bulkSelectedCrates.length || busy) return;
    if (!bulkOpenConfirming) {
      setBulkOpenConfirming(true);
      return;
    }

    const selectedForOpening = bulkSelectedCrates.slice(
      0,
      MAX_BULK_OPEN_CRATES,
    );
    const crateItemIds = selectedForOpening.map((crate) => crate.id);
    const signature = JSON.stringify([...crateItemIds].sort());
    if (bulkOpenRequestRef.current?.signature !== signature) {
      bulkOpenRequestRef.current = {
        signature,
        idempotencyKey: createEconomyIdempotencyKey(),
      };
    }
    const requestId = bulkOpenRequestRef.current.idempotencyKey;
    const initialRows: BulkOpeningRow[] = selectedForOpening.map((crate) => ({
      crate,
      preparing: true,
      opening: null,
      reward: null,
      message: null,
      error: null,
    }));
    setNotice(null);
    setBulkOpeningRows(initialRows);
    setBulkOpenConfirming(false);
    setBulkSelectedCrateIds(new Set());
    setActiveAction("bulk-open");
    try {
      const result = await postEconomyAction(
        "/api/economy/crates/open",
        csrf,
        { crateItemIds },
        requestId,
      );
      refreshAfterBulkOpen.current = true;
      const dropsByCatalogueId = new Map<number, CrateDrop[]>();
      for (const rawPool of result.dropPools ?? []) {
        if (!isRecord(rawPool)) continue;
        const catalogueId = finiteNumber(rawPool.containerCatalogueId);
        if (catalogueId === null || !Number.isSafeInteger(catalogueId)) continue;
        const state = economyCrateDropStateFromResponse(rawPool);
        if (state.status === "ready")
          dropsByCatalogueId.set(catalogueId, state.drops);
      }
      const openingsByCrateId = new Map<string, Record<string, unknown>>();
      for (const rawOpening of result.openings ?? []) {
        if (!isRecord(rawOpening) || typeof rawOpening.crateItemId !== "string")
          continue;
        openingsByCrateId.set(rawOpening.crateItemId, rawOpening);
      }
      const resolvedRows = selectedForOpening.map((crate, index) => {
        if (crate.catalogueId === null)
          throw new Error("This crate is missing its catalogue drop pool.");
        const drops = dropsByCatalogueId.get(crate.catalogueId);
        const rawOpening = openingsByCrateId.get(crate.id);
        if (!drops?.length || !rawOpening)
          throw new Error(
            "The crates opened, but their reveal summary was incomplete. Reload Inventory to verify the rewards.",
          );
        const resultItem = rawOpening.item
          ? toEconomyItem(rawOpening.item)
          : null;
        if (
          !resultItem ||
          (!resultItem.id && resultItem.displayName === "Unnamed item")
        ) {
          throw new Error(
            "The crates opened, but one reward could not be displayed. Reload Inventory to view it.",
          );
        }
        const rewardLootEntryId = finiteNumber(rawOpening.rewardLootEntryId);
        const safeLootEntryId =
          rewardLootEntryId !== null && Number.isSafeInteger(rewardLootEntryId)
            ? rewardLootEntryId
            : null;
        const reward = rewardWithDropArtwork(
          resultItem,
          drops,
          safeLootEntryId,
        );
        return {
          crate,
          preparing: false,
          opening: {
            phase: "revealing" as const,
            crate,
            reward,
            rewardLootEntryId: safeLootEntryId,
            drops,
            run: Date.now() + index,
          },
          reward,
          message:
            rawOpening.globalAnnouncementQueued === true
              ? `${reward.displayName} was unboxed and announced in global chat.`
              : typeof rawOpening.message === "string"
                ? rawOpening.message
                : "Crate opened. The item is now in your inventory.",
          error: null,
        } satisfies BulkOpeningRow;
      });
      setConsumedCrateIds(
        (current) =>
          new Set([...current, ...selectedForOpening.map((crate) => crate.id)]),
      );
      setBulkOpeningRows(resolvedRows);
      bulkOpenRequestRef.current = null;
      const duration = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
        ? REDUCED_MOTION_FINAL_REEL_DURATION_MS
        : FINAL_REEL_DURATION_MS;
      for (const crate of selectedForOpening) {
        const existingTimer = bulkRevealTimers.current.get(crate.id);
        if (existingTimer !== undefined) window.clearTimeout(existingTimer);
        bulkRevealTimers.current.set(
          crate.id,
          window.setTimeout(
            () => completeBulkReveal(crate.id),
            duration + 400,
          ),
        );
      }
      setNotice({
        type: "success",
        text:
          result.message ||
          `${resolvedRows.length} ${resolvedRows.length === 1 ? "crate" : "crates"} opened. Every reward has been added to Inventory.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The selected crates could not be opened.";
      setBulkOpeningRows((current) =>
        current.map((row) => ({
          ...row,
          preparing: false,
          opening: null,
          error: message,
        })),
      );
      setNotice({ type: "error", text: message });
      // Network ambiguity can occur after the atomic open commits. Keep the
      // error rows visible, but reconcile both Inventory surfaces now.
      router.refresh();
    } finally {
      setActiveAction(null);
    }
  }

  function clearUnboxResult() {
    setUnboxed(null);
    setUnboxedCrateId(null);
    setUnboxMessage(null);
    setRetainedOpenedCrate(null);
  }

  function syncOwnedGridColumns() {
    const grid = ownedGridRef.current;
    if (!grid) return;
    const columns = getComputedStyle(grid).gridTemplateColumns
      .split(" ")
      .filter(Boolean).length;
    setOwnedGridColumns(Math.max(1, columns));
  }

  function toggleOwnedCrate(crateId: string) {
    if (busy) return;
    onOwnedInteraction?.();
    syncOwnedGridColumns();
    const nextCrateId = selectedCrateId === crateId ? "" : crateId;
    setSelectedCrateId(nextCrateId);
    if (nextCrateId !== unboxedCrateId) clearUnboxResult();
  }

  function closeOwnedCrate(crateId: string) {
    if (busy) return;
    setSelectedCrateId("");
    if (unboxedCrateId === crateId) clearUnboxResult();
  }

  function toggleMarketCrate(catalogueId: number) {
    if (busy) return;
    const grid = marketGridRef.current;
    if (grid) {
      const columns = getComputedStyle(grid).gridTemplateColumns
        .split(" ")
        .filter(Boolean).length;
      setMarketGridColumns(Math.max(1, columns));
    }
    setSelectedMarketCatalogueId((current) =>
      current === catalogueId ? null : catalogueId,
    );
  }

  function changeCrateTab(tab: CrateTab) {
    if (busy || tab === activeTab) return;
    if (tab !== "owned") {
      changeSelectionMode(false);
      setSelectedCrateId("");
      clearUnboxResult();
    }
    setActiveTab(tab);
  }

  function dismissBulkOpeningResults() {
    setBulkOpeningRows([]);
    changeSelectionMode(false);
  }

  function buyCrate(crate: EconomyCrateView, quantity: number) {
    if (!crate.catalogueId || busy) return;
    setNotice(null);
    setActiveAction("purchase");
    startTransition(async () => {
      try {
        const result = await postEconomyAction(
          "/api/economy/market/purchase",
          csrf,
          { catalogueId: crate.catalogueId, quantity },
        );
        const charged =
          typeof result.totalPriceTokens === "number" &&
          Number.isFinite(result.totalPriceTokens)
            ? ` for ${formatTokens(result.totalPriceTokens)} Tokens`
            : "";
        setNotice({
          type: "success",
          text: `${quantity} ${crate.displayName}${quantity === 1 ? " was" : "s were"} added to your crates${charged}.`,
        });
        router.refresh();
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "The crate purchase could not be completed.",
        });
      } finally {
        setActiveAction(null);
      }
    });
  }

  function resetCatalogueFilters() {
    setCatalogueQuery("");
    setCatalogueType("all");
    setCatalogueRarity("");
    setCataloguePrice("all");
    setCatalogueSort("catalogue");
  }

  return (
    <section className={ownedOnly ? "inventory-owned-crates" : undefined} aria-label={ownedOnly ? "Owned crate opening" : "Crate opening"} aria-busy={busy}>
      {!ownedOnly ? <div className="content-grid">
        <div className="panel">
          <p className="eyebrow">
            <Gift aria-hidden="true" /> Crate opening
          </p>
          <h2>Open crates without a key.</h2>
          <p className="empty-copy">
            Select a crate from your inventory and reveal one random item.
            Cases and capsules can also be acquired below at their listed
            Token price.
          </p>
        </div>
        <TokenBalance wallet={walletView} />
      </div> : null}

      {notice ? (
        <PortalToast
          variant={notice.type === "success" ? "success" : "danger"}
          message={notice.text}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <section className="history-section crate-picker-section" aria-labelledby="crate-browser-heading">
        <div className="section-heading compact crate-browser-heading">
          <div><p className="eyebrow"><Box aria-hidden="true" /> Crate inventory</p><h2 id="crate-browser-heading">{ownedOnly ? "Open owned crates and capsules" : "Select, inspect, then open or buy"}</h2><p>{ownedOnly ? "Inspect the server-verified possible drops, then open one container or select several for a multi-open." : "Every container shows its live price and server-verified possible drops before you commit."}</p></div>
          {!ownedOnly ? <div className="crate-tabs" role="tablist" aria-label="Crate source">
            <button id="crate-owned-tab" type="button" role="tab" aria-controls="crate-owned-panel" aria-selected={activeTab === "owned"} className={activeTab === "owned" ? "active" : ""} disabled={busy} onClick={() => changeCrateTab("owned")}><Gift aria-hidden="true" /> Owned <span>{ownedCrates.length}</span></button>
            <button id="crate-market-tab" type="button" role="tab" aria-controls="crate-market-panel" aria-selected={activeTab === "market"} className={activeTab === "market" ? "active" : ""} disabled={busy} onClick={() => changeCrateTab("market")}><ShoppingBag aria-hidden="true" /> Market <span>{crateCatalogue.length}</span></button>
          </div> : <span className="tag" role={interactionDisabled ? "status" : undefined}>{interactionDisabled ? "Inventory update in progress" : `${ownedCrates.length} owned`}</span>}
        </div>

        {ownedOnly || activeTab === "owned" ? <>
          <section
            className={`panel economy-bulk-toolbar crate-bulk-toolbar${selectionMode ? " is-active" : ""}`}
            aria-label="Crate selection actions"
          >
            <div className="economy-bulk-toolbar-copy">
              <ListChecks aria-hidden="true" />
              <div>
                <strong>{selectionMode ? "Selection mode" : "Multi-open"}</strong>
                <span>
                  {selectionMode
                    ? `${bulkSelectedCrates.length} of ${MAX_BULK_OPEN_CRATES} crates selected`
                    : `Select and open up to ${MAX_BULK_OPEN_CRATES} owned crates together.`}
                </span>
              </div>
            </div>
            <div className="economy-bulk-toolbar-actions">
              {selectionMode ? <>
                <button type="button" className="button button-quiet" disabled={busy || !visibleUnopenedCrates.length || bulkSelectedCrates.length >= MAX_BULK_OPEN_CRATES} onClick={selectOwnedPage}>Select page</button>
                <button type="button" className="button button-quiet" disabled={busy || !bulkSelectedCrates.length} onClick={() => { setBulkSelectedCrateIds(new Set()); setBulkOpenConfirming(false); }}>Clear</button>
              </> : null}
              {selectionMode && bulkSelectedCrates.length ? (
                <button
                  type="button"
                  className="button button-primary crate-open-all-button"
                  disabled={busy}
                  onClick={() => void openSelectedCrates()}
                >
                  {activeAction === "bulk-open" ? <LoaderCircle aria-hidden="true" className="economy-bulk-spinner" /> : <Gift aria-hidden="true" />}
                  {bulkOpenConfirming ? `CONFIRM OPEN ${bulkSelectedCrates.length}` : "OPEN ALL"}
                </button>
              ) : null}
              <button
                type="button"
                className={`button ${selectionMode ? "button-secondary" : "button-primary"}`}
                aria-pressed={selectionMode}
                disabled={busy || !ownedCrates.length}
                onClick={toggleCrateSelectionMode}
              >
                <ListChecks aria-hidden="true" /> {selectionMode ? "Exit selection" : "Selection mode"}
              </button>
            </div>
            {selectionMode && bulkOpenConfirming ? <p className="economy-bulk-confirmation" role="alert">Opening consumes all {bulkSelectedCrates.length} selected crates. Select CONFIRM OPEN {bulkSelectedCrates.length} to start every opening row.</p> : null}
          </section>

          <BulkCrateOpeningRows
            rows={bulkOpeningRows}
            onRevealComplete={completeBulkReveal}
            onDismiss={dismissBulkOpeningResults}
          />

          {displayedOwnedCrates.length ? <>
            <p className="crate-owned-page-summary" aria-live="polite">
              {retainedOpenedCrate
                ? ownedCrates.length
                  ? `${ownedCrates.length} unopened crate${ownedCrates.length === 1 ? "" : "s"} remain`
                  : "No unopened crates remain"
                : ownedCrates.length
                  ? `Showing ${ownedPageStart + 1}-${ownedPageEnd} of ${ownedCrates.length} owned crates`
                  : "No unopened crates remain"}
            </p>
            <div ref={ownedGridRef} id={ownedOnly ? "inventory-owned-crates" : "crate-owned-panel"} className="feature-grid crate-item-grid crate-owned-grid" role={ownedOnly ? undefined : "tabpanel"} aria-labelledby={ownedOnly ? undefined : "crate-owned-tab"}>
            {visibleOwnedCrates.map((crate, index) => {
              const isRetainedConsumedSlot =
                crate.id === retainedOpenedCrate?.id &&
                consumedCrateIds.has(crate.id);
              const isSelected = selectionMode
                ? bulkSelectedCrateIds.has(crate.id)
                : selectedCrateId === crate.id;

              return <Fragment key={crate.id}>
                <EconomyItemCard
                  item={crate}
                  selected={!isRetainedConsumedSlot && isSelected}
                  onSelect={isRetainedConsumedSlot ? undefined : () => selectionMode ? toggleCrateSelection(crate) : toggleOwnedCrate(crate.id)}
                  selectionLabel={isRetainedConsumedSlot ? undefined : selectionMode ? `${bulkSelectedCrateIds.has(crate.id) ? "Remove" : "Add"} ${crate.displayName} ${bulkSelectedCrateIds.has(crate.id) ? "from" : "to"} opening selection` : `Open ${crate.displayName} options`}
                  selectionControls={!isRetainedConsumedSlot && !selectionMode && selectedCrateId === crate.id ? `crate-opening-${crate.id}` : undefined}
                  enableMarketPreview={!isRetainedConsumedSlot}
                  disabled={busy || isRetainedConsumedSlot}
                  className={isRetainedConsumedSlot ? "crate-consumed-slot" : openingCrateId === crate.id ? "is-opening" : ""}
                />
                {!selectionMode && index === ownedInlineOpenerIndex && selectedOwnedCrate ? <OwnedCrateInlineOpener crate={selectedOwnedCrate} dropState={dropState} opening={opening} reward={unboxedCrateId === selectedOwnedCrate.id ? unboxed : null} rewardMessage={unboxedCrateId === selectedOwnedCrate.id ? unboxMessage : null} busy={busy} onOpen={openCrate} onClose={() => closeOwnedCrate(selectedOwnedCrate.id)} onRevealComplete={() => revealComplete.current?.()} onTick={playReelTick} /> : null}
              </Fragment>;
            })}
            </div>
            <PaginationControls page={visibleOwnedPage} pageSize={OWNED_CRATE_PAGE_SIZE} totalItems={displayedOwnedCrates.length} disabled={busy} label="Owned crate pages" onPageChange={changeOwnedPage} />
          </> : <div id={ownedOnly ? "inventory-owned-crates" : "crate-owned-panel"} role={ownedOnly ? undefined : "tabpanel"} aria-labelledby={ownedOnly ? undefined : "crate-owned-tab"}><EconomyEmptyState title="You do not have a crate yet" description="Crates can arrive as match drops, hourly drops, map-end drops, or direct marketplace purchases in Market." icon={<Gift aria-hidden="true" />} /></div>}
        </> : <>
          <form className="panel form-panel crate-catalogue-filters" onSubmit={(event) => event.preventDefault()}>
            <div className="crate-filter-heading"><div><p className="eyebrow"><SlidersHorizontal aria-hidden="true" /> Browse containers</p><p className="empty-copy">Search the crate name, public market name, loot-table code, or rarity. Results update as you filter.</p></div><span className="tag">Up to {CATALOGUE_PAGE_SIZE} per page</span></div>
            <div className="crate-filter-grid">
              <SearchField id="crate-search" label="Search crates" rootClassName="crate-search-field" value={catalogueQuery} onValueChange={setCatalogueQuery} placeholder="Kilowatt, capsule, autograph…" autoComplete="off" />
              <label htmlFor="crate-type">Type<select id="crate-type" value={catalogueType} onChange={(event) => setCatalogueType(event.target.value as CatalogueTypeFilter)}><option value="all">All containers</option><option value="crate">Crates / cases</option><option value="capsule">Capsules</option></select></label>
              <label htmlFor="crate-rarity">Rarity<select id="crate-rarity" value={catalogueRarity} onChange={(event) => setCatalogueRarity(event.target.value)}><option value="">All rarities</option>{ECONOMY_RARITY_RANKS.map((rank) => <option key={rank} value={rank}>{rarityName(rank)}</option>)}</select></label>
              <label htmlFor="crate-price-filter">Price<select id="crate-price-filter" value={cataloguePrice} onChange={(event) => setCataloguePrice(event.target.value as CataloguePriceFilter)}><option value="all">All price states</option><option value="priced">Priced now</option><option value="affordable">Within my balance</option><option value="unpriced">Price pending</option></select></label>
              <label htmlFor="crate-sort">Sort<select id="crate-sort" value={catalogueSort} onChange={(event) => setCatalogueSort(event.target.value as CatalogueSort)}><option value="catalogue">Catalogue order</option><option value="price-asc">Lowest Token price</option><option value="price-desc">Highest Token price</option><option value="rarity">Rarity</option><option value="name">Name</option></select></label>
            </div>
            <div className="crate-filter-summary" aria-live="polite"><p>{filteredCatalogue.length ? `Showing ${catalogueStart + 1}-${catalogueEnd} of ${filteredCatalogue.length} matching containers` : "No matching containers"}</p>{filtersActive ? <button className="button button-quiet" type="button" onClick={resetCatalogueFilters}><X aria-hidden="true" /> Clear filters</button> : null}</div>
          </form>
          {catalogueItems.length ? <div ref={marketGridRef} id="crate-market-panel" className="feature-grid crate-catalogue-grid crate-market-grid" role="tabpanel" aria-labelledby="crate-market-tab">
            {catalogueItems.map((crate, index) => <Fragment key={`${crate.catalogueId ?? crate.id}-${crate.displayName}`}>
              <EconomyItemCard item={crate} selected={selectedMarketCatalogueId === crate.catalogueId} onSelect={() => { if (crate.catalogueId !== null) toggleMarketCrate(crate.catalogueId); }} selectionLabel={`Select ${crate.displayName} to inspect its drops and price`} selectionControls={selectedMarketCatalogueId === crate.catalogueId ? `crate-market-opening-${crate.catalogueId ?? crate.id}` : undefined} enableMarketPreview />
              {index === marketInlineOpenerIndex && selectedMarketCrate ? <MarketCrateInlineOpener crate={selectedMarketCrate} dropState={dropState} busy={busy} purchasing={activeAction === "purchase"} quantity={purchaseQuantity} walletBalance={walletView.balance} onQuantityChange={(quantity) => setPurchaseQuantity(clampCrateQuantity(quantity))} onPurchase={() => buyCrate(selectedMarketCrate, purchaseQuantity)} onClose={() => setSelectedMarketCatalogueId(null)} /> : null}
            </Fragment>)}
          </div> : <div id="crate-market-panel" role="tabpanel" aria-labelledby="crate-market-tab"><EconomyEmptyState title="No crates match these filters" description="Try a shorter search, another price state, or clear the current filters." icon={<Search aria-hidden="true" />} /></div>}
          <PaginationControls page={visibleCataloguePage} pageSize={CATALOGUE_PAGE_SIZE} totalItems={filteredCatalogue.length} disabled={busy} label="Crate marketplace pages" onPageChange={setCataloguePage} />
        </>}

      </section>
    </section>
  );
}
