"use client";

import {
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gift,
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
import { postEconomyAction } from "@/components/economy/economy-request";
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

type CrateOpenerProps = {
  crates: unknown;
  inventory: unknown;
  wallet: unknown;
  csrf: string;
};

type CatalogueTypeFilter = "all" | "crate" | "capsule";
type CataloguePriceFilter = "all" | "priced" | "affordable" | "unpriced";
type CatalogueSort = "catalogue" | "price-asc" | "price-desc" | "name" | "rarity";
type CrateTab = "owned" | "market";
type CrateDrop = {
  item: EconomyItemView;
  lootEntryId: number;
  weight: number;
  minFloat: number | null;
  maxFloat: number | null;
  stattrakChanceBps: number;
};
type CrateDropState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; totalWeight: number; drops: CrateDrop[] }
  | { status: "unavailable"; message: string };
type OpeningState =
  | { phase: "requesting"; crate: EconomyItemView; run: number }
  | {
      phase: "reeling";
      crate: EconomyItemView;
      reward: EconomyItemView;
      rewardLootEntryId: number | null;
      run: number;
    };

const CATALOGUE_PAGE_SIZE = 50;
const DROP_PAGE_SIZE = 50;
const CRATE_RARITY_RANKS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const MAX_CRATE_PURCHASE_QUANTITY = 50;

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

function formatEuroCents(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
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
    case "staff-last-known":
      return "staff last-known price";
    default:
      return source ? "recorded price" : null;
  }
}

function clampPurchaseQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_CRATE_PURCHASE_QUANTITY, Math.trunc(value)));
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

function crateDropStateFromResponse(value: unknown): CrateDropState {
  if (!isRecord(value))
    return { status: "unavailable", message: "Crate odds are unavailable." };
  const totalWeight = finiteNumber(value.totalWeight, 0) ?? 0;
  const rawDrops = Array.isArray(value.drops) ? value.drops : [];
  const drops = rawDrops.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.catalogue)) return [];
    const weight = finiteNumber(entry.weight, 0) ?? 0;
    const lootEntryId = finiteNumber(entry.lootEntryId, 0) ?? 0;
    if (!Number.isSafeInteger(lootEntryId) || weight <= 0) return [];
    return [
      {
        item: toEconomyItem(entry.catalogue),
        lootEntryId,
        weight,
        minFloat: finiteNumber(entry.minFloat),
        maxFloat: finiteNumber(entry.maxFloat),
        stattrakChanceBps: finiteNumber(entry.stattrakChanceBps, 0) ?? 0,
      },
    ];
  });
  if (!totalWeight || !drops.length)
    return { status: "unavailable", message: "This crate has no enabled drops." };
  return { status: "ready", totalWeight, drops };
}

function crateDropRate(drop: CrateDrop, totalWeight: number) {
  return (drop.weight / totalWeight) * 100;
}

function formatDropRate(drop: CrateDrop, totalWeight: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: crateDropRate(drop, totalWeight) < 0.1 ? 3 : 2,
    minimumFractionDigits: crateDropRate(drop, totalWeight) < 1 ? 2 : 0,
  }).format(crateDropRate(drop, totalWeight));
}

function dropHeadline(rarityRank: number) {
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
  return matchingDrop
    ? { ...matchingDrop.item, ...reward, imageUrl: reward.imageUrl ?? matchingDrop.item.imageUrl }
    : reward;
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
  const canRefreshPrice = Boolean(crate.marketHashName);
  const hasCatalogueEntry = crate.catalogueId !== null;
  const totalPriceTokens = priceTokens === null ? null : priceTokens * quantity;
  const unaffordable = totalPriceTokens !== null && totalPriceTokens > walletBalance;
  const priceAvailable = priceTokens !== null;
  const purchaseAvailable = hasCatalogueEntry && (priceAvailable || canRefreshPrice);
  const priceDetail = !priceAvailable
    ? canRefreshPrice
      ? "The current public price will be checked before purchase."
      : "No public or staff price is available yet."
    : [
        formatEuroCents(crate.marketPriceEuroCents),
        priceSourceLabel(crate.marketPriceSource),
        "50% container rate applied",
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
            onChange={(event) => onQuantityChange(clampPurchaseQuantity(Number(event.target.value)))}
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

function LegacyCrateDropOdds({ state }: { state: CrateDropState }) {
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return <div className="crate-odds-loading" aria-live="polite"><LoaderCircle aria-hidden="true" /><span>Loading possible drops and their rates…</span></div>;
  }
  if (state.status === "unavailable") {
    return <p className="crate-odds-unavailable">{state.message}</p>;
  }
  return <section className="crate-drop-odds" aria-label="Possible crate drops">
    <header><div><p className="eyebrow"><Trophy aria-hidden="true" /> Verified crate odds</p><h3>Possible drops</h3></div><span>{state.drops.length} outcomes</span></header>
    <p className="empty-copy">Rates are calculated from the active server loot-table weights. Opening remains a server-side random roll.</p>
    <div className="crate-drop-grid">
      {state.drops.map((drop) => <article key={drop.lootEntryId} className={`crate-drop-card ${rarityRankClass(drop.item.rarityRank)}`}>
        <MarketplaceItemPreview item={drop.item} enableMarketPreview />
        <div><span className={rarityClass(drop.item.rarityRank)}>{drop.item.rarity}</span><h4>{drop.item.displayName}</h4><strong>{formatDropRate(drop, state.totalWeight)}%</strong><small>{formatTokens(drop.weight)} of {formatTokens(state.totalWeight)} weight</small>{drop.stattrakChanceBps ? <small>StatTrak chance {(drop.stattrakChanceBps / 100).toFixed(2)}%</small> : null}</div>
      </article>)}
    </div>
  </section>;
}

function CrateDropOdds({ state }: { state: CrateDropState }) {
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return <div className="crate-odds-loading" aria-live="polite"><LoaderCircle aria-hidden="true" /><span>Loading possible drops and their rates...</span></div>;
  }
  if (state.status === "unavailable") {
    return <p className="crate-odds-unavailable">{state.message}</p>;
  }
  return <CrateDropOddsReady totalWeight={state.totalWeight} drops={state.drops} />;
}

function CrateDropOddsReady({
  totalWeight,
  drops,
}: {
  totalWeight: number;
  drops: CrateDrop[];
}) {
  const [rarityFilter, setRarityFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const queryTerms = useMemo(
    () => normalizedText(query).split(" ").filter(Boolean),
    [query],
  );
  const rarityGroups = useMemo(
    () => [3, 4, 5, 6, 7].map((rank) => {
      const matching = drops.filter((drop) => drop.item.rarityRank === rank);
      const weight = matching.reduce((total, drop) => total + drop.weight, 0);
      return { rank, count: matching.length, weight };
    }),
    [drops],
  );
  const filteredDrops = useMemo(
    () => drops
      .filter((drop) => rarityFilter === "all" || drop.item.rarityRank === Number(rarityFilter))
      .filter((drop) => !queryTerms.length || queryTerms.every((term) => normalizedText([
        drop.item.displayName,
        drop.item.marketHashName ?? "",
        drop.item.itemType,
        drop.item.rarity,
      ].join(" ")).includes(term)))
      .sort((left, right) =>
        right.item.rarityRank - left.item.rarityRank ||
        left.item.displayName.localeCompare(right.item.displayName) ||
        left.lootEntryId - right.lootEntryId),
    [drops, queryTerms, rarityFilter],
  );
  const pageCount = Math.max(1, Math.ceil(filteredDrops.length / DROP_PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount);
  const pageStart = (visiblePage - 1) * DROP_PAGE_SIZE;
  const visibleDrops = filteredDrops.slice(pageStart, pageStart + DROP_PAGE_SIZE);

  useEffect(() => setPage(1), [query, rarityFilter]);

  return <section className="crate-drop-odds" aria-label="Possible crate drops">
    <header><div><p className="eyebrow"><Trophy aria-hidden="true" /> Verified crate odds</p><h3>Possible drops</h3></div><span>{drops.length.toLocaleString()} outcomes</span></header>
    <p className="empty-copy">These are the active server entries. Select a rarity or search a finish to browse the full pool; displayed percentages are the actual per-item chance.</p>
    <div className="crate-drop-tier-tabs" role="tablist" aria-label="Filter crate drops by rarity">
      <button type="button" role="tab" aria-selected={rarityFilter === "all"} className={rarityFilter === "all" ? "active" : ""} onClick={() => setRarityFilter("all")}>All <span>100%</span></button>
      {rarityGroups.map((group) => <button key={group.rank} type="button" role="tab" aria-selected={rarityFilter === String(group.rank)} className={`${rarityRankClass(group.rank)} ${rarityFilter === String(group.rank) ? "active" : ""}`} onClick={() => setRarityFilter(String(group.rank))} disabled={group.count === 0}><span>{rarityName(group.rank)}</span><small>{((group.weight / totalWeight) * 100).toFixed(2)}%</small></button>)}
    </div>
    <div className="crate-drop-toolbar">
      <label htmlFor="crate-drop-search">Search this crate<input id="crate-drop-search" type="search" value={query} placeholder="e.g. Butterfly, Fade, AK-47" onChange={(event) => setQuery(event.target.value)} /></label>
      <p aria-live="polite">{filteredDrops.length ? `Showing ${pageStart + 1}-${Math.min(pageStart + visibleDrops.length, filteredDrops.length)} of ${filteredDrops.length.toLocaleString()} drops` : "No drops match this filter"}</p>
    </div>
    {visibleDrops.length ? <div className="crate-drop-grid">
      {visibleDrops.map((drop) => <article key={drop.lootEntryId} className={`crate-drop-card ${rarityRankClass(drop.item.rarityRank)}`}>
        <MarketplaceItemPreview item={drop.item} enableMarketPreview floatValue={drop.minFloat ?? drop.item.minFloat} />
        <div><span className={rarityClass(drop.item.rarityRank)}>{drop.item.rarity}</span><h4>{drop.item.displayName}</h4><strong>{formatDropRate(drop, totalWeight)}%</strong><small>{formatTokens(drop.weight)} of {formatTokens(totalWeight)} weight</small>{drop.minFloat !== null || drop.maxFloat !== null ? <small>Float {(drop.minFloat ?? drop.maxFloat ?? 0).toFixed(2)} - {(drop.maxFloat ?? drop.minFloat ?? 1).toFixed(2)}</small> : null}{drop.stattrakChanceBps ? <small>StatTrak chance {(drop.stattrakChanceBps / 100).toFixed(2)}%</small> : null}</div>
      </article>)}
    </div> : <p className="crate-odds-unavailable">No possible drops match this filter.</p>}
    {filteredDrops.length > DROP_PAGE_SIZE ? <nav className="crate-drop-pagination" aria-label="Crate drop pages"><button type="button" className="button button-secondary" disabled={visiblePage <= 1} onClick={() => setPage(visiblePage - 1)}><ChevronLeft aria-hidden="true" /> Previous</button><span>Page {visiblePage} of {pageCount}</span><button type="button" className="button button-secondary" disabled={visiblePage >= pageCount} onClick={() => setPage(visiblePage + 1)}>Next <ChevronRight aria-hidden="true" /></button></nav> : null}
  </section>;
}

function CrateOpeningAnimation({
  opening,
  drops,
}: {
  opening: OpeningState;
  drops: CrateDrop[];
}) {
  const reel = useMemo(() => {
    if (opening.phase !== "reeling") return [];
    const fallback = opening.reward;
    const winnerIndex = 24;
    return Array.from({ length: 30 }, (_, index) =>
      index === winnerIndex
        ? rewardWithDropArtwork(opening.reward, drops, opening.rewardLootEntryId)
        : reelDropForIndex(drops, index, opening.run)?.item ?? fallback,
    );
  }, [drops, opening]);

  if (opening.phase === "requesting") {
    return <section className="crate-opening-animation requesting" aria-live="polite"><LoaderCircle aria-hidden="true" className="crate-opening-spinner" /><div><strong>Opening {opening.crate.displayName}</strong><span>Rolling your server-verified reward…</span></div></section>;
  }

  return <section className={`crate-opening-animation reeling ${rarityRankClass(opening.reward.rarityRank)}`} aria-live="polite">
    <div className="crate-opening-pointer" aria-hidden="true" />
    <div className="crate-opening-reel-window"><div className="crate-opening-reel-track" style={{ "--reel-translate": `${-(24 * 142)}px` } as CSSProperties}>
      {reel.map((item, index) => <article key={`${opening.run}-${index}`} className={`crate-opening-reel-item ${index === 24 ? "winner" : ""} ${rarityRankClass(item.rarityRank)}`}><MarketplaceItemPreview item={item} enableMarketPreview={false} /><span>{item.displayName}</span></article>)}
    </div></div>
    <p><Sparkles aria-hidden="true" /> {dropHeadline(opening.reward.rarityRank)} incoming</p>
  </section>;
}

function OwnedCrateInlineOpener({
  crate,
  dropState,
  opening,
  busy,
  onOpen,
  onClose,
}: {
  crate: EconomyItemView;
  dropState: CrateDropState;
  opening: OpeningState | null;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [showDrops, setShowDrops] = useState(false);
  const openingHere = opening?.crate.id === crate.id ? opening : null;
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
      className={`panel crate-inline-modal ${openingHere ? "is-opening" : ""}`}
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
          drops={dropState.status === "ready" ? dropState.drops : []}
        />
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
                disabled={busy}
                onClick={onOpen}
              >
                <Gift aria-hidden="true" /> Open crate
              </button>
              <button
                type="button"
                className="button button-secondary crate-inline-drops-toggle"
                aria-expanded={showDrops}
                aria-controls={dropsId}
                onClick={() => setShowDrops((visible) => !visible)}
              >
                <ChevronDown aria-hidden="true" /> {dropButtonLabel}
              </button>
              <small>
                {dropState.status === "loading"
                  ? "Loading the active drop pool..."
                  : dropState.status === "unavailable"
                    ? "Drop odds are unavailable right now."
                    : "Opening is verified server-side."}
              </small>
            </div>
          </div>
          {showDrops ? (
            <div id={dropsId} className="crate-inline-modal-drops">
              <CrateDropOdds state={dropState} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function CrateSelectionStage({
  tab,
  crate,
  cratePriceTokens,
  drops,
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
  drops: CrateDrop[];
  opening: OpeningState | null;
  busy: boolean;
  purchasing: boolean;
  quantity: number;
  walletBalance: number;
  onQuantityChange: (quantity: number) => void;
  onOpen: () => void;
  onPurchase: () => void;
}) {
  if (opening) return <aside className="panel crate-opening-stage"><CrateOpeningAnimation opening={opening} drops={drops} /></aside>;

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
        <span className="tag">{tab === "owned" ? "No key required" : "50% container price"}</span>
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
}: CrateOpenerProps) {
  const router = useRouter();
  const crateCatalogue = useMemo(() => economyCrates(crates), [crates]);
  const ownedCrates = useMemo(
    () => economyItems(inventory).filter(isCrate),
    [inventory],
  );
  const walletView = useMemo(() => economyWallet(wallet), [wallet]);
  const [activeTab, setActiveTab] = useState<CrateTab>("owned");
  const [selectedCrateId, setSelectedCrateId] = useState("");
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
  const [dropState, setDropState] = useState<CrateDropState>({
    status: "idle",
  });
  const [opening, setOpening] = useState<OpeningState | null>(null);
  const [activeAction, setActiveAction] = useState<"open" | "purchase" | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const revealTimer = useRef<number | null>(null);

  const selectedOwnedCrate =
    ownedCrates.find((item) => item.id === selectedCrateId) ?? null;
  const selectedMarketCrate =
    crateCatalogue.find(
      (crate) => crate.catalogueId === selectedMarketCatalogueId,
    ) ?? null;
  const selectedCrate =
    activeTab === "owned" ? selectedOwnedCrate : selectedMarketCrate;
  const selectedCratePrice =
    selectedCrate?.cratePriceTokens ?? selectedCrate?.marketPriceTokens ?? null;
  const busy = pending || activeAction !== null;
  const selectedCatalogueId = selectedCrate?.catalogueId ?? null;
  const selectedDrops = dropState.status === "ready" ? dropState.drops : [];
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
        return crateDropStateFromResponse(body);
      })
      .then((state) => {
        if (!controller.signal.aborted) setDropState(state);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDropState({
          status: "unavailable",
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
    },
    [],
  );

  function openCrate() {
    if (!selectedOwnedCrate || busy || opening) return;
    const crate = selectedOwnedCrate;
    setNotice(null);
    setUnboxed(null);
    setOpening({ phase: "requesting", crate, run: Date.now() });
    setActiveAction("open");
    startTransition(async () => {
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
          selectedDrops,
          rewardLootEntryId !== null && Number.isSafeInteger(rewardLootEntryId)
            ? rewardLootEntryId
            : null,
        );
        const run = Date.now();
        setOpening({
          phase: "reeling",
          crate,
          reward,
          rewardLootEntryId:
            rewardLootEntryId !== null && Number.isSafeInteger(rewardLootEntryId)
              ? rewardLootEntryId
              : null,
          run,
        });
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 250
          : 4_200;
        await new Promise<void>((resolve) => {
          revealTimer.current = window.setTimeout(resolve, duration);
        });
        revealTimer.current = null;
        setOpening(null);
        setUnboxed(reward);
        setNotice({
          type: "success",
          text: result.globalAnnouncementQueued
            ? `${reward.displayName} was unboxed and announced in global chat.`
            : result.message || "Crate opened. The item is now in your inventory.",
        });
        router.refresh();
      } catch (error) {
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
        setOpening(null);
        setActiveAction(null);
      }
    });
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
    <section aria-label="Crate opening">
      <div className="content-grid">
        <div className="panel">
          <p className="eyebrow">
            <Gift aria-hidden="true" /> Crate opening
          </p>
          <h2>Open crates without a key.</h2>
          <p className="empty-copy">
            Select a crate from your inventory and reveal one random item.
            Cases and capsules can also be acquired below at their half-price
            Token rate.
          </p>
        </div>
        <TokenBalance wallet={walletView} />
      </div>

      {notice ? (
        <p
          className={`notice notice-${notice.type === "success" ? "success" : "danger"}`}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}

      {unboxed ? <section className={`panel unboxed-reveal crate-drop-reveal ${rarityRankClass(unboxed.rarityRank)}`} aria-live="polite">
        <div><p className="eyebrow"><Trophy aria-hidden="true" /> {dropHeadline(unboxed.rarityRank)}</p><h2>{unboxed.displayName}</h2><p className="empty-copy">Added to your inventory. You can inspect, equip, trade, or customize it from Inventory.</p><span className={rarityClass(unboxed.rarityRank)}>{unboxed.rarity}</span>{unboxed.rarityRank >= 4 ? <p className="crate-global-drop-note"><Sparkles aria-hidden="true" /> Pink-and-above unboxes are announced in global chat while you are online.</p> : null}</div>
        <EconomyItemCard item={unboxed} enableMarketPreview />
      </section> : null}

      <section className="history-section crate-picker-section" aria-labelledby="crate-browser-heading">
        <div className="section-heading compact crate-browser-heading">
          <div><p className="eyebrow"><Box aria-hidden="true" /> Crate inventory</p><h2 id="crate-browser-heading">Select, inspect, then open or buy</h2><p>Every container shows its live price and server-verified possible drops before you commit.</p></div>
          <div className="crate-tabs" role="tablist" aria-label="Crate source">
            <button id="crate-owned-tab" type="button" role="tab" aria-controls="crate-owned-panel" aria-selected={activeTab === "owned"} className={activeTab === "owned" ? "active" : ""} disabled={busy} onClick={() => setActiveTab("owned")}><Gift aria-hidden="true" /> Owned <span>{ownedCrates.length}</span></button>
            <button id="crate-market-tab" type="button" role="tab" aria-controls="crate-market-panel" aria-selected={activeTab === "market"} className={activeTab === "market" ? "active" : ""} disabled={busy} onClick={() => setActiveTab("market")}><ShoppingBag aria-hidden="true" /> Market <span>{crateCatalogue.length}</span></button>
          </div>
        </div>

        {activeTab === "owned" ? <>
          {ownedCrates.length ? <div id="crate-owned-panel" className="feature-grid crate-item-grid crate-owned-grid" role="tabpanel" aria-labelledby="crate-owned-tab">
            {ownedCrates.map((crate) => <Fragment key={crate.id}>
              <EconomyItemCard item={crate} selected={selectedCrateId === crate.id} onSelect={() => { if (!busy) setSelectedCrateId((current) => current === crate.id ? "" : crate.id); }} selectionLabel={`Open ${crate.displayName} options`} selectionControls={`crate-opening-${crate.id}`} enableMarketPreview />
              {selectedCrateId === crate.id ? <OwnedCrateInlineOpener crate={crate} dropState={dropState} opening={opening} busy={busy} onOpen={openCrate} onClose={() => setSelectedCrateId("")} /> : null}
            </Fragment>)}
          </div> : <div id="crate-owned-panel" role="tabpanel" aria-labelledby="crate-owned-tab"><EconomyEmptyState title="You do not have a crate yet" description="Crates can arrive as match drops, hourly drops, map-end drops, or direct marketplace purchases in the Market tab." icon={<Gift aria-hidden="true" />} /></div>}
        </> : <>
          <form className="panel form-panel crate-catalogue-filters" onSubmit={(event) => event.preventDefault()}>
            <div className="crate-filter-heading"><div><p className="eyebrow"><SlidersHorizontal aria-hidden="true" /> Browse containers</p><p className="empty-copy">Search the crate name, public market name, loot-table code, or rarity. Results update as you filter.</p></div><span className="tag">Up to {CATALOGUE_PAGE_SIZE} per page</span></div>
            <div className="crate-filter-grid">
              <label className="crate-search-field" htmlFor="crate-search">Search crates<input id="crate-search" type="search" value={catalogueQuery} placeholder="e.g. Kilowatt, capsule, autograph" onChange={(event) => setCatalogueQuery(event.target.value)} /></label>
              <label htmlFor="crate-type">Type<select id="crate-type" value={catalogueType} onChange={(event) => setCatalogueType(event.target.value as CatalogueTypeFilter)}><option value="all">All containers</option><option value="crate">Crates / cases</option><option value="capsule">Capsules</option></select></label>
              <label htmlFor="crate-rarity">Rarity<select id="crate-rarity" value={catalogueRarity} onChange={(event) => setCatalogueRarity(event.target.value)}><option value="">All rarities</option>{CRATE_RARITY_RANKS.map((rank) => <option key={rank} value={rank}>{rarityName(rank)}</option>)}</select></label>
              <label htmlFor="crate-price-filter">Price<select id="crate-price-filter" value={cataloguePrice} onChange={(event) => setCataloguePrice(event.target.value as CataloguePriceFilter)}><option value="all">All price states</option><option value="priced">Priced now</option><option value="affordable">Within my balance</option><option value="unpriced">Price pending</option></select></label>
              <label htmlFor="crate-sort">Sort<select id="crate-sort" value={catalogueSort} onChange={(event) => setCatalogueSort(event.target.value as CatalogueSort)}><option value="catalogue">Catalogue order</option><option value="price-asc">Lowest Token price</option><option value="price-desc">Highest Token price</option><option value="rarity">Rarity</option><option value="name">Name</option></select></label>
            </div>
            <div className="crate-filter-summary" aria-live="polite"><p>{filteredCatalogue.length ? `Showing ${catalogueStart + 1}-${catalogueEnd} of ${filteredCatalogue.length} matching containers` : "No matching containers"}</p>{filtersActive ? <button className="button button-quiet" type="button" onClick={resetCatalogueFilters}><X aria-hidden="true" /> Clear filters</button> : null}</div>
          </form>
          {catalogueItems.length ? <div className="crate-opening-layout">
            <div id="crate-market-panel" className="feature-grid crate-catalogue-grid" role="tabpanel" aria-labelledby="crate-market-tab">
              {catalogueItems.map((crate) => <EconomyItemCard key={`${crate.catalogueId ?? crate.id}-${crate.displayName}`} item={crate} selected={selectedMarketCatalogueId === crate.catalogueId} onSelect={() => { if (!busy && crate.catalogueId !== null) setSelectedMarketCatalogueId(crate.catalogueId); }} selectionLabel={`Select ${crate.displayName} to inspect its drops and price`} enableMarketPreview />)}
            </div>
            <CrateSelectionStage tab="market" crate={selectedMarketCrate} cratePriceTokens={selectedCratePrice} drops={selectedDrops} opening={opening} busy={busy} purchasing={activeAction === "purchase"} quantity={purchaseQuantity} walletBalance={walletView.balance} onQuantityChange={(quantity) => setPurchaseQuantity(clampPurchaseQuantity(quantity))} onOpen={() => undefined} onPurchase={() => { if (selectedMarketCrate) buyCrate(selectedMarketCrate, purchaseQuantity); }} />
          </div> : <div id="crate-market-panel" role="tabpanel" aria-labelledby="crate-market-tab"><EconomyEmptyState title="No crates match these filters" description="Try a shorter search, another price state, or clear the current filters." icon={<Search aria-hidden="true" />} /></div>}
          {filteredCatalogue.length > CATALOGUE_PAGE_SIZE ? <nav className="crate-pagination" aria-label="Crate catalogue pages"><button type="button" className="button button-secondary" disabled={visibleCataloguePage <= 1} onClick={() => setCataloguePage(visibleCataloguePage - 1)}><ChevronLeft aria-hidden="true" /> Previous</button><span>Page {visibleCataloguePage} of {cataloguePageCount}</span><button type="button" className="button button-secondary" disabled={visibleCataloguePage >= cataloguePageCount} onClick={() => setCataloguePage(visibleCataloguePage + 1)}>Next <ChevronRight aria-hidden="true" /></button></nav> : null}
        </>}

        {activeTab === "market" && selectedCrate && !opening ? <CrateDropOdds key={String(selectedCatalogueId ?? "none")} state={dropState} /> : null}
      </section>
    </section>
  );
}
