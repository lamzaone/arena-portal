"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgePercent,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Minus,
  Plus,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  EconomyEmptyState,
  EconomyItemCard,
} from "@/components/economy/economy-item-card";
import {
  CrateDropPreview,
  type EconomyCrateDropState,
} from "@/components/economy/crate-drop-preview";
import {
  createEconomyIdempotencyKey,
  EconomyActionRequestError,
  postEconomyAction,
} from "@/components/economy/economy-request";
import {
  economyCatalogueItems,
  economyWallet,
  formatTokens,
  rarityName,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { TokenBalance } from "@/components/economy/token-balance";
import { useItemGridLayout } from "@/components/economy/item-grid";
import { WeaponInspectButton } from "@/components/economy/weapon-inspect-button";
import { PortalToast } from "@/components/success-toast";
import {
  SearchNavigationForm,
  SearchField,
} from "@/components/ui/search-field";
import {
  marketplaceCategories,
  normalizeMarketplaceCategory,
} from "@/lib/economy/market-categories";
import {
  marketQuoteEvidenceLabel,
  marketQuoteMatchesSelection,
  MAX_MARKET_SEED,
  MIN_MARKET_SEED,
  parseMarketSeed,
} from "@/lib/economy/market-selection";
import {
  ECONOMY_RARITY_RANKS,
  ECONOMY_SPECIAL_RARITY_RANK,
} from "@/lib/economy/item-taxonomy";
import {
  canAffordCratePurchase,
  clampCrateQuantity,
  crateDropDisclosureLabel,
  cratePurchaseTotal,
  inlinePanelInsertionIndex,
  marketContainerModalPresentation,
  marketplacePurchaseIntentSignature,
  MAX_CRATE_PURCHASE_QUANTITY,
  retainedPurchaseRequest,
  type RetainedPurchaseRequest,
} from "@/lib/economy/crate-presentation";

const DEFAULT_MARKET_FLOAT = 0.15;
const FLOAT_PURCHASE_SLIDER_STEP = 0.000001;

type MarketplaceFilters = {
  query: string;
  itemType: string;
  rarity: string;
};

type MarketplacePagination = {
  page: number;
  pageSize: number;
  total: number;
};

type MarketplaceBrowserProps = {
  catalogue: unknown;
  wallet: unknown;
  csrf: string;
  filters: MarketplaceFilters;
  pagination: MarketplacePagination;
};

type ParsedFloat = {
  valid: boolean;
  value: string;
  number: number | null;
};

type MarketplaceQuote = {
  priceTokens: number;
  basePriceTokens: number;
  source: string | null;
  floatValue: number;
  wear: string | null;
  stattrak: boolean;
  seed: number;
  seedMatched: boolean;
  pricingRule: string | null;
  floatDiscountBps: number | null;
  discount: EconomyItemView["marketDiscount"];
};

type MarketplaceQuoteStatus = "idle" | "loading" | "ready" | "error";

type MarketplacePurchaseOptions = {
  floatValue?: number;
  seed?: number;
  expectedUnitPriceTokens?: number;
  stattrak: boolean;
  quantity?: number;
};

function isContainerItem(item: EconomyItemView) {
  return ["crate", "case", "capsule"].includes(item.itemType);
}

function marketHref(filters: MarketplaceFilters, page: number, pageSize: number) {
  const parameters = new URLSearchParams();
  if (filters.query) parameters.set("q", filters.query);
  if (filters.itemType) parameters.set("type", filters.itemType);
  if (filters.rarity) parameters.set("rarity", filters.rarity);
  if (page > 1) parameters.set("page", String(page));
  parameters.set("pageSize", String(pageSize));
  const query = parameters.toString();
  return query ? `/market?${query}` : "/market";
}

function parseFloatInput(value: string): ParsedFloat {
  const trimmed = value.trim();
  if (!trimmed) return { valid: true, value: "", number: null };
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1)
    return { valid: false, value: trimmed, number: null };
  const rounded = Math.round(parsed * 1_000_000) / 1_000_000;
  return {
    valid: true,
    value: rounded.toFixed(6).replace(/\.?0+$/, ""),
    number: rounded,
  };
}

function validItemType(value: string) {
  return normalizeMarketplaceCategory(value);
}

function isFloatSelectable(item: EconomyItemView) {
  return ["skin", "knife", "glove"].includes(item.itemType);
}

function isStattrakSelectable(item: EconomyItemView) {
  return ["skin", "knife"].includes(item.itemType);
}

function formatFloat(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function discountPercentLabel(item: EconomyItemView) {
  const price = item.marketPriceTokens;
  const basePrice = item.marketBasePriceTokens;
  if (
    !item.marketDiscount ||
    price === null ||
    basePrice === null ||
    basePrice <= 0 ||
    price >= basePrice
  ) {
    return null;
  }
  const percentage = ((basePrice - price) / basePrice) * 100;
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(percentage)}% OFF`;
}

function floatInRange(value: number, minimum: number, maximum: number) {
  return value >= minimum && value <= maximum;
}

function wearLabel(floatValue: number) {
  if (floatValue <= 0.07) return "Factory New";
  if (floatValue <= 0.15) return "Minimal Wear";
  if (floatValue <= 0.38) return "Field-Tested";
  if (floatValue <= 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

function numberFromUnknown(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function displayQuotedFloat(item: EconomyItemView) {
  const rawFloat = item.marketPriceFloatValue ?? numberFromUnknown(
    item.raw.displayPriceFloatValue ?? item.raw.marketPriceFloatValue,
  );
  return rawFloat !== null && rawFloat >= 0 && rawFloat <= 1
    ? Math.round(rawFloat * 1_000_000) / 1_000_000
    : null;
}

function defaultFloatForItem(item: EconomyItemView, fallback: string) {
  const minimum = item.minFloat ?? 0;
  const maximum = item.maxFloat ?? 1;
  const preferred =
    item.floatValue ??
    displayQuotedFloat(item) ??
    parseFloatInput(fallback).number ??
    DEFAULT_MARKET_FLOAT;
  return formatFloat(Math.min(maximum, Math.max(minimum, preferred)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVipMembershipItem(item: EconomyItemView) {
  return item.itemType === "vip_membership";
}

function isProfileThemeItem(item: EconomyItemView) {
  return item.itemType === "profile_theme";
}

function isSpecialItem(item: EconomyItemView) {
  return item.rarityRank === ECONOMY_SPECIAL_RARITY_RANK;
}

function marketplaceQuoteFromResponse(value: unknown): MarketplaceQuote | null {
  if (!isRecord(value)) return null;
  const record = isRecord(value.quote) ? value.quote : value;
  const priceTokens = numberFromUnknown(record.priceTokens);
  const basePriceTokens = numberFromUnknown(record.basePriceTokens);
  const floatValue = numberFromUnknown(record.floatValue);
  const seed = numberFromUnknown(record.seed);
  const floatDiscountBps = numberFromUnknown(record.floatDiscountBps);
  const stattrak = record.stattrak;
  const discountRecord = isRecord(record.discount) ? record.discount : null;
  const discountRuleId = numberFromUnknown(discountRecord?.ruleId);
  const discountTokens = numberFromUnknown(discountRecord?.discountTokens);
  const discountName =
    typeof discountRecord?.displayName === "string"
      ? discountRecord.displayName.trim()
      : "";
  if (
    priceTokens === null ||
    !Number.isSafeInteger(priceTokens) ||
    priceTokens < 0 ||
    basePriceTokens === null ||
    !Number.isSafeInteger(basePriceTokens) ||
    basePriceTokens < priceTokens ||
    floatValue === null ||
    floatValue < 0 ||
    floatValue > 1 ||
    seed === null ||
    !Number.isSafeInteger(seed) ||
    seed < MIN_MARKET_SEED ||
    seed > MAX_MARKET_SEED ||
    typeof stattrak !== "boolean"
  ) {
    return null;
  }
  return {
    priceTokens,
    basePriceTokens,
    source: typeof record.source === "string" && record.source.trim()
      ? record.source.trim()
      : null,
    floatValue: Math.round(floatValue * 1_000_000) / 1_000_000,
    wear: typeof record.wear === "string" && record.wear.trim()
      ? record.wear.trim()
      : null,
    stattrak,
    seed,
    seedMatched: record.seedMatched === true,
    pricingRule: typeof record.pricingRule === "string" ? record.pricingRule : null,
    floatDiscountBps:
      floatDiscountBps !== null &&
      Number.isSafeInteger(floatDiscountBps) &&
      floatDiscountBps >= 0
        ? floatDiscountBps
        : null,
    discount:
      discountRuleId !== null &&
      Number.isSafeInteger(discountRuleId) &&
      discountRuleId > 0 &&
      discountTokens !== null &&
      Number.isSafeInteger(discountTokens) &&
      discountTokens > 0 &&
      discountName
        ? {
            ruleId: discountRuleId,
            displayName: discountName,
            discountTokens,
          }
        : null,
  };
}

function marketplaceQuoteError(value: unknown) {
  if (!isRecord(value) || typeof value.message !== "string") return null;
  return value.message.trim() || null;
}

function paginationPages(pageCount: number, currentPage: number) {
  const pages = new Set([
    1,
    2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    pageCount - 1,
    pageCount,
  ]);
  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((left, right) => left - right);
  const result: Array<number | "ellipsis"> = [];
  for (const page of sorted) {
    const previous = result.at(-1);
    if (typeof previous === "number" && page > previous + 1)
      result.push("ellipsis");
    result.push(page);
  }
  return result;
}

function MarketplacePurchaseAction({
  item,
  pending,
  walletBalance,
  floatInput,
  seedInput,
  quote,
  quoteStatus,
  quotePending,
  quoteError,
  onFloatChange,
  onSeedChange,
  stattrak,
  onStattrakChange,
  onPurchase,
}: {
  item: EconomyItemView;
  pending: boolean;
  walletBalance: number;
  floatInput: string;
  seedInput: string;
  quote: MarketplaceQuote | null;
  quoteStatus: MarketplaceQuoteStatus;
  quotePending: boolean;
  quoteError: string | null;
  onFloatChange: (value: string) => void;
  onSeedChange: (value: string) => void;
  stattrak: boolean;
  onStattrakChange: (value: boolean) => void;
  onPurchase: (item: EconomyItemView, options: MarketplacePurchaseOptions) => void;
}) {
  const vipMembership = isVipMembershipItem(item);
  const profileTheme = isProfileThemeItem(item);
  const supportsFloat = isFloatSelectable(item);
  const supportsStattrak = isStattrakSelectable(item);
  const selectedFloat = parseFloatInput(floatInput);
  const selectedSeed = parseMarketSeed(seedInput);
  const knownPrice = supportsFloat ? quote?.priceTokens ?? null : item.marketPriceTokens;
  const needsMarketPrice = knownPrice === null;
  const canFetchMarketPrice = supportsFloat
    ? Boolean(item.catalogueId)
    : Boolean(item.marketHashName);
  const unaffordable = knownPrice !== null && knownPrice > walletBalance;
  const minimumFloat = item.minFloat ?? 0;
  const maximumFloat = item.maxFloat ?? 1;
  const currentFloat =
    selectedFloat.number ??
    Math.min(
      maximumFloat,
      Math.max(minimumFloat, DEFAULT_MARKET_FLOAT),
    );
  const floatControlId = `market-purchase-float-${item.catalogueId ?? item.id}`;
  const seedControlId = `market-purchase-seed-${item.catalogueId ?? item.id}`;
  const stattrakControlId = `market-purchase-stattrak-${item.catalogueId ?? item.id}`;
  const missingFloat = supportsFloat && selectedFloat.number === null;
  const floatIsSupported =
    !supportsFloat ||
    (selectedFloat.number !== null &&
      floatInRange(selectedFloat.number, minimumFloat, maximumFloat));
  const quoteLoading =
    supportsFloat &&
    quoteStatus !== "error" &&
    (quoteStatus === "loading" || quotePending);
  const quoteFailed = supportsFloat && quoteStatus === "error";
  const quoteWear = quote?.wear ?? wearLabel(currentFloat);
  const disabled =
    pending ||
    !item.catalogueId ||
    unaffordable ||
    (needsMarketPrice && !canFetchMarketPrice) ||
    missingFloat ||
    (supportsFloat && (!selectedFloat.valid || !floatIsSupported)) ||
    (supportsFloat && (selectedSeed === null || !quote)) ||
    quoteLoading ||
    quoteFailed;

  return (
    <div className="market-item-purchase">
      {supportsFloat && quoteWear ? (
        <div className="market-item-wear" aria-label={`Exterior: ${quoteWear}`}>
          <span>Exterior</span>
          <strong>{quoteWear}</strong>
        </div>
      ) : null}
      {supportsStattrak ? (
        <label className="market-purchase-stattrak" htmlFor={stattrakControlId}>
          <input
            id={stattrakControlId}
            type="checkbox"
            checked={stattrak}
            onChange={(event) => onStattrakChange(event.target.checked)}
          />
          <span>
            <strong>StatTrak™</strong>
            <small>Use the separately priced StatTrak™ market variant.</small>
          </span>
        </label>
      ) : null}
      {supportsFloat ? (
        <div className="market-purchase-float">
          <div className="market-float-slider-label">
            <label htmlFor={floatControlId}>Float</label>
            <output htmlFor={floatControlId}>{currentFloat.toFixed(6)}</output>
          </div>
          <input
            id={floatControlId}
            type="range"
            className="market-float-slider"
            min={minimumFloat}
            max={maximumFloat}
            step={FLOAT_PURCHASE_SLIDER_STEP}
            value={currentFloat}
            aria-valuetext={`Float ${currentFloat.toFixed(6)}`}
            aria-describedby={`market-float-help-${item.catalogueId ?? item.id}`}
            onChange={(event) => onFloatChange(event.target.value)}
          />
          <small id={`market-float-help-${item.catalogueId ?? item.id}`}>
            {`Allowed ${minimumFloat.toFixed(6)}–${maximumFloat.toFixed(6)}. Preview and price update with your selection.`}
          </small>
        </div>
      ) : null}
      {supportsFloat ? (
        <div className="market-purchase-float market-purchase-seed">
          <label className="market-float-slider-label" htmlFor={seedControlId}>
            Pattern seed
            <input
              id={seedControlId}
              type="number"
              inputMode="numeric"
              min={MIN_MARKET_SEED}
              max={MAX_MARKET_SEED}
              step={1}
              value={seedInput}
              aria-invalid={selectedSeed === null}
              aria-describedby={`${seedControlId}-help`}
              onChange={(event) => onSeedChange(event.target.value)}
            />
          </label>
          <small id={`${seedControlId}-help`}>
            {selectedSeed === null
              ? `Enter a whole number from ${MIN_MARKET_SEED} to ${MAX_MARKET_SEED}.`
              : `Choose ${MIN_MARKET_SEED}–${MAX_MARKET_SEED}. This pattern is saved with your purchase.`}
          </small>
        </div>
      ) : null}
      {supportsFloat && quote ? (
        <p className="market-quote-evidence" role="status">
          {marketQuoteEvidenceLabel(quote)}
        </p>
      ) : null}
      {quoteFailed ? (
        <p className="market-purchase-error" role="alert">
          {quoteError ?? "The price for this exterior could not be refreshed."}
        </p>
      ) : null}
      <button
        type="button"
        className="button button-primary market-buy-button"
        disabled={disabled}
        aria-busy={pending}
        onClick={() =>
          onPurchase(
            item,
            {
              floatValue: supportsFloat
                ? (selectedFloat.number ?? undefined)
                : undefined,
              seed: supportsFloat ? (selectedSeed ?? undefined) : undefined,
              expectedUnitPriceTokens: supportsFloat ? quote?.priceTokens : undefined,
              stattrak,
            },
          )
        }
      >
        {pending
          ? (
              <>
                <LoaderCircle className="ui-button-spinner" aria-hidden="true" />
                Processing…
              </>
            )
          : missingFloat
            ? "Enter a float"
            : supportsFloat && (!selectedFloat.valid || !floatIsSupported)
            ? "Enter a valid float"
            : supportsFloat && selectedSeed === null
              ? "Enter a valid seed"
            : quoteLoading
              ? "Updating price..."
              : quoteFailed
                ? "Price unavailable"
            : needsMarketPrice && !canFetchMarketPrice
              ? "Price pending staff"
              : needsMarketPrice
                ? "Refresh public price & buy"
                : vipMembership
                  ? `Buy membership for ${formatTokens(knownPrice)} Tokens`
                  : profileTheme
                    ? `Buy theme for ${formatTokens(knownPrice)} Tokens`
                  : `Buy for ${formatTokens(knownPrice)} Tokens`}
      </button>
    </div>
  );
}

function MarketplaceStandardListing({
  item,
  pending,
  walletBalance,
  suggestedPurchaseFloat,
  onPurchase,
}: {
  item: EconomyItemView;
  pending: boolean;
  walletBalance: number;
  suggestedPurchaseFloat: string;
  onPurchase: (item: EconomyItemView, options: MarketplacePurchaseOptions) => Promise<boolean | undefined>;
}) {
  const defaultFloat = defaultFloatForItem(item, suggestedPurchaseFloat);
  const [floatInput, setFloatInput] = useState(defaultFloat);
  const [seedInput, setSeedInput] = useState(() =>
    String(parseMarketSeed(String(item.seed ?? MIN_MARKET_SEED)) ?? MIN_MARKET_SEED),
  );
  const [stattrak, setStattrak] = useState(false);
  const [quote, setQuote] = useState<MarketplaceQuote | null>(null);
  const [quoteStatus, setQuoteStatus] =
    useState<MarketplaceQuoteStatus>("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const supportsFloat = isFloatSelectable(item);
  const supportsStattrak = isStattrakSelectable(item);
  const selectedFloat = parseFloatInput(floatInput);
  const selectedSeed = parseMarketSeed(seedInput);
  const minimumFloat = item.minFloat ?? 0;
  const maximumFloat = item.maxFloat ?? 1;
  const selectedFloatIsSupported =
    selectedFloat.number !== null &&
    floatInRange(selectedFloat.number, minimumFloat, maximumFloat);
  const activeQuote =
    quote &&
    selectedFloat.number !== null &&
    selectedSeed !== null &&
    marketQuoteMatchesSelection(quote, {
      floatValue: selectedFloat.number,
      seed: selectedSeed,
      stattrak,
    })
      ? quote
      : null;
  const shouldRefreshQuote =
    supportsFloat &&
    Boolean(item.catalogueId) &&
    selectedFloat.valid &&
    selectedFloatIsSupported &&
    selectedSeed !== null &&
    !activeQuote;

  // Listings are keyed by catalogue identity. Keep the player's selection
  // when wallet refreshes deliver a new server price for the same listing.

  useEffect(() => {
    const requestedFloat = selectedFloat.number;
    const requestedSeed = selectedSeed;
    if (!shouldRefreshQuote || requestedFloat === null || requestedSeed === null || !item.catalogueId) {
      if (!shouldRefreshQuote) {
        setQuoteStatus("idle");
        setQuoteError(null);
      }
      return;
    }

    const controller = new AbortController();
    setQuoteStatus("loading");
    setQuoteError(null);
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const parameters = new URLSearchParams({
            catalogueId: String(item.catalogueId),
            float: requestedFloat.toFixed(6),
            seed: String(requestedSeed),
            stattrak: stattrak ? "1" : "0",
          });
          const response = await fetch(
            `/api/economy/market/quote?${parameters.toString()}`,
            {
              headers: { accept: "application/json" },
              credentials: "same-origin",
              signal: controller.signal,
            },
          );
          const payload: unknown = await response.json().catch(() => null);
          const nextQuote = marketplaceQuoteFromResponse(payload);
          if (!response.ok || !nextQuote) {
            throw new Error(
              marketplaceQuoteError(payload) ??
                "A price for this float and seed is not available right now.",
            );
          }
          if (
            !marketQuoteMatchesSelection(nextQuote, {
              floatValue: requestedFloat,
              seed: requestedSeed,
              stattrak,
            })
          ) {
            throw new Error("The marketplace returned a price for a different float, seed, or StatTrak selection.");
          }
          if (controller.signal.aborted) return;
          setQuote(nextQuote);
          setQuoteStatus("ready");
        } catch (error) {
          if (controller.signal.aborted) return;
          setQuote(null);
          setQuoteStatus("error");
          setQuoteError(
            error instanceof Error
              ? error.message
              : "A price for this float and seed is not available right now.",
          );
        }
      })();
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    activeQuote,
    item.catalogueId,
    selectedFloat.number,
    selectedSeed,
    stattrak,
    shouldRefreshQuote,
  ]);

  const previewFloat = selectedFloatIsSupported ? selectedFloat.number : null;
  const pricedItem = {
    ...item,
    ...(supportsFloat ? { floatValue: previewFloat, seed: selectedSeed } : {}),
    stattrak: supportsStattrak && stattrak,
    stattrakCount: 0,
    ...(activeQuote
      ? {
        marketPriceTokens: activeQuote.priceTokens,
        marketBasePriceTokens: activeQuote.basePriceTokens,
        marketPriceSource: activeQuote.source,
        marketPriceFloatValue: activeQuote.floatValue,
        marketPriceWear: activeQuote.wear,
        marketPriceFloatDiscountBps: activeQuote.floatDiscountBps,
        marketDiscount: activeQuote.discount,
        }
      : supportsFloat
        ? {
            marketPriceTokens: null,
            marketBasePriceTokens: null,
            marketPriceSource: null,
            marketPriceFloatValue: null,
            marketPriceWear: null,
            marketPriceFloatDiscountBps: null,
            marketDiscount: null,
          }
        : {}),
  };
  const discountLabel = discountPercentLabel(pricedItem);
  return (
    <EconomyItemCard
      item={pricedItem}
      className={isSpecialItem(item) ? "market-item-special" : ""}
      enableMarketPreview
      previewFloat={supportsFloat ? previewFloat ?? -1 : null}
      previewSeed={supportsFloat ? selectedSeed ?? -1 : null}
      previewOverlay={
        discountLabel ? (
          <span className="market-artwork-discount-tag">
            <BadgePercent aria-hidden="true" /> {discountLabel}
          </span>
        ) : null
      }
      actions={
        <>
        {(!supportsFloat || (previewFloat !== null && selectedSeed !== null)) ? (
          <WeaponInspectButton item={pricedItem} />
        ) : null}
        <MarketplacePurchaseAction
          item={pricedItem}
          pending={pending}
          walletBalance={walletBalance}
          floatInput={floatInput}
          seedInput={seedInput}
          quote={activeQuote}
          quoteStatus={quoteStatus}
          quotePending={shouldRefreshQuote}
          quoteError={quoteError}
          onFloatChange={setFloatInput}
          onSeedChange={setSeedInput}
          stattrak={stattrak}
          onStattrakChange={setStattrak}
          onPurchase={async (selectedItem, options) => {
            if (await onPurchase(selectedItem, options) === false) setQuote(null);
          }}
        />
        </>
      }
    />
  );
}

function marketContainerPanelId(item: EconomyItemView) {
  return `market-container-${item.catalogueId ?? item.id}-details`;
}

function marketContainerToggleId(item: EconomyItemView) {
  return `market-container-${item.catalogueId ?? item.id}-toggle`;
}

function MarketplaceContainerCard({
  item,
  expanded,
  onToggle,
}: {
  item: EconomyItemView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const discountLabel = discountPercentLabel(item);
  return (
    <EconomyItemCard
      item={item}
      enableMarketPreview
      previewOverlay={
        discountLabel ? (
          <span className="market-artwork-discount-tag">
            <BadgePercent aria-hidden="true" /> {discountLabel}
          </span>
        ) : null
      }
      actions={
        <button
          id={marketContainerToggleId(item)}
          type="button"
          className="button button-secondary market-buy-button crate-inline-drops-toggle"
          aria-expanded={expanded}
          aria-controls={expanded ? marketContainerPanelId(item) : undefined}
          disabled={item.catalogueId === null}
          onClick={onToggle}
        >
          <ChevronDown aria-hidden="true" />
          {expanded ? "Hide purchase details" : "Buy / view drops"}
        </button>
      }
    />
  );
}

function MarketplaceContainerPanel({
  item,
  pending,
  walletBalance,
  closing,
  onPurchase,
  onClose,
}: {
  item: EconomyItemView;
  pending: boolean;
  walletBalance: number;
  closing: boolean;
  onPurchase: (item: EconomyItemView, options: MarketplacePurchaseOptions) => void;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [showDrops, setShowDrops] = useState(false);
  const [dropsRequested, setDropsRequested] = useState(false);
  const [dropState, setDropState] = useState<EconomyCrateDropState>({
    status: "idle",
  });
  const quantityId = `market-container-${item.catalogueId ?? item.id}-quantity`;
  const quantityHelpId = `${quantityId}-help`;
  const dropsToggleId = `market-container-${item.catalogueId ?? item.id}-drops-toggle`;
  const dropsPanelId = `market-container-${item.catalogueId ?? item.id}-drops`;
  const unitPrice = item.marketPriceTokens;
  const priceAvailable =
    unitPrice !== null && Number.isSafeInteger(unitPrice) && unitPrice >= 0;
  const totalPrice = priceAvailable
    ? cratePurchaseTotal(unitPrice, quantity)
    : null;
  const unaffordable =
    priceAvailable &&
    !canAffordCratePurchase(walletBalance, unitPrice, quantity);
  const canRefreshPrice = Boolean(item.marketHashName);
  const purchaseAvailable =
    item.catalogueId !== null &&
    (priceAvailable || canRefreshPrice);
  const buyLabel = pending
    ? "Buying..."
    : unaffordable
      ? "Not enough Tokens"
      : totalPrice !== null
        ? `Buy ${quantity} for ${formatTokens(totalPrice)} Tokens`
        : canRefreshPrice
          ? `Refresh price & buy ${quantity}`
          : "Price pending staff";
  const dropToggleLabel = crateDropDisclosureLabel(
    showDrops,
    dropState.status === "ready" ? dropState.drops.length : null,
  );
  const modalPresentation = marketContainerModalPresentation({
    dropsExpanded: showDrops,
    closing,
    reducedMotion: false,
  });

  function toggleDrops() {
    const next = !showDrops;
    if (next) setDropsRequested(true);
    setShowDrops(next);
  }

  return (
    <section
      data-ui="item-modal"
      data-motion={modalPresentation.phase}
      data-size={modalPresentation.size}
      id={marketContainerPanelId(item)}
      className={`panel crate-inline-modal crate-market-inline-modal${
        modalPresentation.size === "wide" ? " has-drop-odds" : ""
      }${modalPresentation.phase === "closing" ? " is-closing" : ""}`}
      role="region"
      aria-labelledby={marketContainerToggleId(item)}
      inert={closing}
    >
      <header className="crate-inline-modal-header">
        <div>
          <p className="eyebrow">
            <ShoppingBag aria-hidden="true" /> Container market
          </p>
          <h3>{item.displayName}</h3>
          <p>Choose an amount and buy now. Drop details are optional below.</p>
        </div>
        <button
          type="button"
          className="button button-quiet crate-inline-modal-close"
          onClick={onClose}
        >
          <X aria-hidden="true" /> Close
        </button>
      </header>
      <div className="crate-catalogue-purchase crate-selected-purchase market-container-purchase-layout">
        <div className="crate-quantity-control">
          <label htmlFor={quantityId}>Amount</label>
          <div>
            <button
              type="button"
              aria-label="Buy one fewer container"
              disabled={pending || quantity <= 1}
              onClick={() => setQuantity(clampCrateQuantity(quantity - 1))}
            >
              <Minus aria-hidden="true" />
            </button>
            <input
              id={quantityId}
              type="number"
              min="1"
              max={MAX_CRATE_PURCHASE_QUANTITY}
              value={quantity}
              disabled={pending}
              aria-describedby={quantityHelpId}
              onChange={(event) =>
                setQuantity(clampCrateQuantity(event.target.value))
              }
            />
            <button
              type="button"
              aria-label="Buy one more container"
              disabled={pending || quantity >= MAX_CRATE_PURCHASE_QUANTITY}
              onClick={() => setQuantity(clampCrateQuantity(quantity + 1))}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          <small id={quantityHelpId}>
            Buy up to {MAX_CRATE_PURCHASE_QUANTITY} containers in one
            transaction.
          </small>
        </div>
        <div className="market-container-purchase-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={pending || !purchaseAvailable || unaffordable}
            aria-busy={pending}
            onClick={() =>
              onPurchase(item, {
                stattrak: false,
                quantity,
              })
            }
          >
            {pending ? (
              <LoaderCircle className="ui-button-spinner" aria-hidden="true" />
            ) : (
              <ShoppingBag aria-hidden="true" />
            )}
            {buyLabel}
          </button>
          <button
            id={dropsToggleId}
            type="button"
            className="button button-secondary crate-inline-drops-toggle"
            aria-expanded={showDrops}
            aria-controls={dropsPanelId}
            disabled={pending}
            onClick={toggleDrops}
          >
            <ChevronDown aria-hidden="true" /> {dropToggleLabel}
          </button>
        </div>
        {unaffordable && totalPrice !== null ? (
          <small className="crate-purchase-help" role="status">
            Need {formatTokens(totalPrice - walletBalance)} more Tokens.
          </small>
        ) : null}
      </div>
      <div
        id={dropsPanelId}
        className="crate-inline-modal-drops"
        role="region"
        aria-labelledby={dropsToggleId}
        hidden={!showDrops}
        style={showDrops ? undefined : { display: "none" }}
      >
        {dropsRequested ? (
          <CrateDropPreview
            catalogueId={item.catalogueId}
            onStateChange={setDropState}
          />
        ) : null}
      </div>
    </section>
  );
}

function MarketplaceListing({
  item,
  pending,
  walletBalance,
  suggestedPurchaseFloat,
  expanded,
  onContainerToggle,
  onPurchase,
}: {
  item: EconomyItemView;
  pending: boolean;
  walletBalance: number;
  suggestedPurchaseFloat: string;
  expanded: boolean;
  onContainerToggle: () => void;
  onPurchase: (item: EconomyItemView, options: MarketplacePurchaseOptions) => Promise<boolean | undefined>;
}) {
  if (isContainerItem(item)) {
    return (
      <MarketplaceContainerCard
        item={item}
        expanded={expanded}
        onToggle={onContainerToggle}
      />
    );
  }
  return (
    <MarketplaceStandardListing
      item={item}
      pending={pending}
      walletBalance={walletBalance}
      suggestedPurchaseFloat={suggestedPurchaseFloat}
      onPurchase={onPurchase}
    />
  );
}

export function MarketplaceBrowser({
  catalogue,
  wallet,
  csrf,
  filters,
  pagination,
}: MarketplaceBrowserProps) {
  const router = useRouter();
  const items = useMemo(() => economyCatalogueItems(catalogue), [catalogue]);
  const { gridProps, pageSize, columns: marketGridColumns, measured } = useItemGridLayout();
  const visibleItems = items.slice(0, pageSize);
  const layoutRequestRef = useRef<string | null>(null);
  const layoutResponsesRef = useRef(new Set<string>());
  const filterKey = JSON.stringify([filters.query, filters.itemType, filters.rarity]);
  const serverPageKey = `${filterKey}:${pagination.page}:${pagination.pageSize}`;
  const anchorRef = useRef({ filterKey, serverPageKey, offset: (pagination.page - 1) * pagination.pageSize });
  if (anchorRef.current.serverPageKey !== serverPageKey) {
    const filtersChanged = anchorRef.current.filterKey !== filterKey;
    if (filtersChanged || !layoutResponsesRef.current.has(serverPageKey)) {
      anchorRef.current.offset = (pagination.page - 1) * pagination.pageSize;
    }
    if (filtersChanged) {
      layoutResponsesRef.current.clear();
      layoutRequestRef.current = null;
    }
    anchorRef.current.filterKey = filterKey;
    anchorRef.current.serverPageKey = serverPageKey;
  }
  const layoutPending = measured && pagination.pageSize !== pageSize;
  const walletView = useMemo(() => economyWallet(wallet), [wallet]);
  const [draft, setDraft] = useState<MarketplaceFilters>(() => ({
    ...filters,
    itemType: validItemType(filters.itemType),
  }));
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const pendingPurchaseIdsRef = useRef(new Set<number>());
  const purchaseRequestRefs = useRef(
    new Map<number, RetainedPurchaseRequest>(),
  );
  const [pendingPurchaseIds, setPendingPurchaseIds] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
  const [selectedContainerCatalogueId, setSelectedContainerCatalogueId] =
    useState<number | null>(null);
  const [closingContainerCatalogueId, setClosingContainerCatalogueId] =
    useState<number | null>(null);
  const containerCloseTimerRef = useRef<number | null>(null);
  const pageCount = Math.max(
    1,
    Math.ceil(pagination.total / pageSize),
  );
  const currentPage = Math.min(pageCount, Math.floor(anchorRef.current.offset / pageSize) + 1);
  const firstResult = pagination.total
    ? (pagination.page - 1) * pagination.pageSize + 1
    : 0;
  const lastResult = pagination.total
    ? Math.min(pagination.total, firstResult + visibleItems.length - 1)
    : 0;
  const pageLinks = paginationPages(pageCount, currentPage);
  const selectedContainerIndex =
    selectedContainerCatalogueId === null
      ? -1
      : visibleItems.findIndex(
          (item) => item.catalogueId === selectedContainerCatalogueId,
        );
  const selectedContainer =
    selectedContainerIndex < 0 ? null : visibleItems[selectedContainerIndex];
  const containerPanelInsertionIndex = inlinePanelInsertionIndex(
    selectedContainerIndex,
    visibleItems.length,
    marketGridColumns,
  );
  // Browsing by a float range only filters catalogue entries; it does not
  // silently change the exact float a player is about to buy. Each card starts
  // on its server-quoted default and lets the player select a specific float.
  const suggestedPurchaseFloat = formatFloat(DEFAULT_MARKET_FLOAT);

  useEffect(() => {
    setDraft({
      ...filters,
      itemType: validItemType(filters.itemType),
    });
  }, [
    filters.itemType,
    filters.query,
    filters.rarity,
  ]);

  useEffect(() => {
    if (!measured || draft.query !== filters.query || draft.itemType !== filters.itemType || draft.rarity !== filters.rarity) return;
    if (!layoutPending && pagination.page === currentPage) {
      layoutRequestRef.current = null;
      layoutResponsesRef.current.clear();
      return;
    }
    const href = marketHref(filters, currentPage, pageSize);
    if (layoutRequestRef.current === href) return;
    layoutRequestRef.current = href;
    layoutResponsesRef.current.add(`${filterKey}:${currentPage}:${pageSize}`);
    router.replace(href, { scroll: false });
  }, [currentPage, draft.itemType, draft.query, draft.rarity, filterKey, filters.itemType, filters.query, filters.rarity, layoutPending, measured, pageSize, pagination.page, router]);

  useEffect(() => {
    if (
      selectedContainerCatalogueId !== null &&
      selectedContainerIndex < 0
    ) {
      if (containerCloseTimerRef.current !== null) {
        window.clearTimeout(containerCloseTimerRef.current);
        containerCloseTimerRef.current = null;
      }
      setClosingContainerCatalogueId(null);
      setSelectedContainerCatalogueId(null);
    }
  }, [selectedContainerCatalogueId, selectedContainerIndex]);

  useEffect(
    () => () => {
      if (containerCloseTimerRef.current !== null)
        window.clearTimeout(containerCloseTimerRef.current);
    },
    [],
  );

  function updateDraft<K extends keyof MarketplaceFilters>(
    key: K,
    value: MarketplaceFilters[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleContainer(item: EconomyItemView) {
    if (item.catalogueId === null) return;
    if (selectedContainerCatalogueId === item.catalogueId) {
      closeContainerPanel(item);
      return;
    }
    if (containerCloseTimerRef.current !== null) {
      window.clearTimeout(containerCloseTimerRef.current);
      containerCloseTimerRef.current = null;
    }
    setClosingContainerCatalogueId(null);
    setSelectedContainerCatalogueId(item.catalogueId);
  }

  function closeContainerPanel(
    item: EconomyItemView | null = selectedContainer,
  ) {
    if (
      !item ||
      item.catalogueId === null ||
      closingContainerCatalogueId !== null
    ) {
      return;
    }
    const catalogueId = item.catalogueId;
    const toggleId = marketContainerToggleId(item);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const { exitDelayMs } = marketContainerModalPresentation({
      dropsExpanded: false,
      closing: true,
      reducedMotion,
    });
    setClosingContainerCatalogueId(catalogueId);

    const finishClosing = () => {
      containerCloseTimerRef.current = null;
      setSelectedContainerCatalogueId((current) =>
        current === catalogueId ? null : current,
      );
      setClosingContainerCatalogueId((current) =>
        current === catalogueId ? null : current,
      );
      window.requestAnimationFrame(() =>
        document.getElementById(toggleId)?.focus(),
      );
    };
    if (exitDelayMs === 0) finishClosing();
    else
      containerCloseTimerRef.current = window.setTimeout(
        finishClosing,
        exitDelayMs,
      );
  }

  async function purchase(
    item: EconomyItemView,
    options: MarketplacePurchaseOptions,
  ) {
    if (!item.catalogueId) return;
    const catalogueId = item.catalogueId;
    if (pendingPurchaseIdsRef.current.has(catalogueId)) return;
    const signature = marketplacePurchaseIntentSignature(
      catalogueId,
      options,
    );
    const request = retainedPurchaseRequest(
      purchaseRequestRefs.current.get(catalogueId) ?? null,
      signature,
      createEconomyIdempotencyKey,
    );
    purchaseRequestRefs.current.set(catalogueId, request);
    pendingPurchaseIdsRef.current.add(catalogueId);
    setPendingPurchaseIds(new Set(pendingPurchaseIdsRef.current));
    setNotice(null);
    try {
      const result = await postEconomyAction(
        "/api/economy/market/purchase",
        csrf,
        {
          catalogueId,
          stattrak: options.stattrak,
          ...(options.floatValue === undefined
            ? {}
            : { floatValue: options.floatValue }),
          ...(options.seed === undefined ? {} : { seed: options.seed }),
          ...(options.expectedUnitPriceTokens === undefined
            ? {}
            : { expectedUnitPriceTokens: options.expectedUnitPriceTokens }),
          ...(options.quantity === undefined
            ? {}
            : { quantity: clampCrateQuantity(options.quantity) }),
        },
        request.idempotencyKey,
      );
      if (
        purchaseRequestRefs.current.get(catalogueId)?.idempotencyKey ===
        request.idempotencyKey
      ) {
        purchaseRequestRefs.current.delete(catalogueId);
      }
      setNotice({
        type: "success",
        text:
          result.message ||
          `${item.displayName} was added to your inventory.`,
      });
      router.refresh();
      return true;
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "The purchase could not be completed.",
      });
      if (isFloatSelectable(item) && error instanceof EconomyActionRequestError && error.code === "price_changed") {
        purchaseRequestRefs.current.delete(catalogueId);
        return false;
      }
    } finally {
      pendingPurchaseIdsRef.current.delete(catalogueId);
      setPendingPurchaseIds(new Set(pendingPurchaseIdsRef.current));
    }
  }

  return (
    <section aria-label="Marketplace catalogue">
      <div className="content-grid">
        <div className="panel">
          <p className="eyebrow">
            <ShoppingBag aria-hidden="true" /> Direct marketplace
          </p>
          <h2>Buy the exact item you want.</h2>
          <p className="empty-copy">
            Public market data informs Token prices; custom server finishes
            use staff-set prices. Crates and capsules use their listed base
            price unless an admin discount is active; no key is needed to open them.
          </p>
        </div>
        <TokenBalance wallet={walletView} />
      </div>

      {notice ? (
        <PortalToast
          variant={notice.type === "success" ? "success" : "danger"}
          message={notice.text}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <SearchNavigationForm
        className="panel form-panel market-filters"
        action="/market"
        instant
        resetFields={["page"]}
      >
        <input type="hidden" name="pageSize" value={pageSize} />
        <div className="market-filter-heading">
          <div>
            <p className="eyebrow">
              <SlidersHorizontal aria-hidden="true" /> Find an item
            </p>
            <p className="empty-copy">
              Search item name, public market name, catalogue key, or a category
              such as weapons or skins.
            </p>
          </div>
          <span className="tag">Up to {pageSize} items per page</span>
        </div>
        <div className="market-filter-grid">
          <SearchField
            id="market-search"
            name="q"
            label="Search items"
            rootClassName="market-search-field"
            maxLength={120}
            value={draft.query}
            placeholder="AK-47, weapons, Redline…"
            autoComplete="off"
            onValueChange={(value) => updateDraft("query", value)}
          />
          <label htmlFor="market-type">
            Category
            <select
              id="market-type"
              name="type"
              value={draft.itemType}
              onChange={(event) => updateDraft("itemType", event.target.value)}
            >
              <option value="">All categories</option>
              {marketplaceCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="market-rarity">
            Rarity
            <select
              id="market-rarity"
              name="rarity"
              value={draft.rarity}
              onChange={(event) => updateDraft("rarity", event.target.value)}
            >
              <option value="">All rarities</option>
              {ECONOMY_RARITY_RANKS.map((value) => (
                <option key={value} value={value}>
                  {rarityName(value)}
                </option>
              ))}
            </select>
          </label>
          <div className="market-filter-actions">
            <Link className="button button-quiet" href={marketHref({ query: "", itemType: "", rarity: "" }, 1, pageSize)} scroll={false}>
              <X aria-hidden="true" /> Clear filters
            </Link>
          </div>
        </div>
        <p className="market-result-summary" aria-live="polite">
          {pagination.total
            ? `Showing ${firstResult}–${lastResult} of ${pagination.total} matching items`
            : "No matching items"}
          <span>{pageSize} per page</span>
        </p>
      </SearchNavigationForm>

        <div {...gridProps} className="feature-grid market-item-grid" aria-busy={layoutPending || undefined}>
          {visibleItems.flatMap((item, index) => {
            const itemKey = `${item.catalogueId ?? item.id}-${item.displayName}`;
            const listing = (
              <MarketplaceListing
                key={`listing-${itemKey}`}
                item={item}
                pending={
                  item.catalogueId !== null &&
                  pendingPurchaseIds.has(item.catalogueId)
                }
                walletBalance={walletView.balance}
                suggestedPurchaseFloat={suggestedPurchaseFloat}
                expanded={
                  item.catalogueId !== null &&
                  item.catalogueId === selectedContainerCatalogueId
                }
                onContainerToggle={() => toggleContainer(item)}
                onPurchase={purchase}
              />
            );
            return index === containerPanelInsertionIndex && selectedContainer
              ? [
                  listing,
                  <MarketplaceContainerPanel
                    key={`container-panel-${selectedContainer.catalogueId ?? selectedContainer.id}`}
                    item={selectedContainer}
                    pending={
                      selectedContainer.catalogueId !== null &&
                      pendingPurchaseIds.has(selectedContainer.catalogueId)
                    }
                    walletBalance={walletView.balance}
                    closing={
                      selectedContainer.catalogueId !== null &&
                      selectedContainer.catalogueId ===
                        closingContainerCatalogueId
                    }
                    onPurchase={purchase}
                    onClose={() => closeContainerPanel()}
                  />,
                ]
              : [listing];
          })}
        </div>
      {!items.length ? (
        <EconomyEmptyState
          title="No marketplace items match"
          description="Try a broader search or clear one of the filters."
        />
      ) : null}

      {pagination.total > pageSize ? (
        <nav className="market-pagination marketplace-pagination" aria-label="Marketplace pages">
          <Link
            className="button button-secondary market-page-button"
            href={marketHref(filters, Math.max(1, currentPage - 1), pageSize)}
            scroll={false}
            aria-disabled={currentPage <= 1 || layoutPending}
            tabIndex={currentPage <= 1 || layoutPending ? -1 : undefined}
            onClick={(event) => { if (currentPage <= 1 || layoutPending) event.preventDefault(); }}
          >
            <ChevronLeft aria-hidden="true" /> Previous
          </Link>
          <div className="market-page-list">
            {pageLinks.map((page, index) =>
              page === "ellipsis" ? (
                <span className="market-page-ellipsis" key={`ellipsis-${index}`}>
                  …
                </span>
              ) : (
                <Link
                  key={page}
                  className={`market-page-number ${page === currentPage ? "is-current" : ""}`}
                  href={marketHref(filters, page, pageSize)}
                  scroll={false}
                  aria-current={page === currentPage ? "page" : undefined}
                  aria-disabled={layoutPending || undefined}
                  tabIndex={layoutPending ? -1 : undefined}
                  onClick={(event) => { if (layoutPending) event.preventDefault(); }}
                >
                  {page}
                </Link>
              ),
            )}
          </div>
          <Link
            className="button button-secondary market-page-button"
            href={marketHref(filters, Math.min(pageCount, currentPage + 1), pageSize)}
            scroll={false}
            aria-disabled={currentPage >= pageCount || layoutPending}
            tabIndex={currentPage >= pageCount || layoutPending ? -1 : undefined}
            onClick={(event) => { if (currentPage >= pageCount || layoutPending) event.preventDefault(); }}
          >
            Next <ChevronRight aria-hidden="true" />
          </Link>
        </nav>
      ) : null}
    </section>
  );
}
