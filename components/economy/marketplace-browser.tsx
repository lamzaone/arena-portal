"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import {
  EconomyEmptyState,
  EconomyItemCard,
} from "@/components/economy/economy-item-card";
import { postEconomyAction } from "@/components/economy/economy-request";
import {
  economyCatalogueItems,
  economyWallet,
  formatTokens,
  rarityName,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { TokenBalance } from "@/components/economy/token-balance";
import { PortalToast } from "@/components/success-toast";
import {
  marketplaceCategories,
  normalizeMarketplaceCategory,
} from "@/lib/economy/market-categories";

const MARKET_RARITY_RANKS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const DEFAULT_MARKET_FLOAT = 0.15;
const FLOAT_FILTER_SLIDER_STEP = 0.000001;
const FLOAT_PURCHASE_SLIDER_STEP = 0.000001;

type MarketplaceFilters = {
  query: string;
  itemType: string;
  rarity: string;
  minFloat: string;
  maxFloat: string;
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
  euroCents: number | null;
  source: string | null;
  floatValue: number;
  wear: string | null;
  floatDiscountBps: number | null;
};

type MarketplaceQuoteStatus = "idle" | "loading" | "ready" | "error";

function marketHref(filters: MarketplaceFilters, page: number) {
  const parameters = new URLSearchParams();
  if (filters.query) parameters.set("q", filters.query);
  if (filters.itemType) parameters.set("type", filters.itemType);
  if (filters.rarity) parameters.set("rarity", filters.rarity);
  if (filters.minFloat) parameters.set("minFloat", filters.minFloat);
  if (filters.maxFloat) parameters.set("maxFloat", filters.maxFloat);
  if (page > 1) parameters.set("page", String(page));
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

function validRarity(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) &&
    (MARKET_RARITY_RANKS as readonly number[]).includes(parsed)
    ? String(parsed)
    : "";
}

function normalizeFilters(filters: MarketplaceFilters) {
  const minFloat = parseFloatInput(filters.minFloat);
  const maxFloat = parseFloatInput(filters.maxFloat);
  if (!minFloat.valid || !maxFloat.valid)
    return {
      error: "Float values must be between 0.000000 and 1.000000.",
      filters: null,
    };
  if (
    minFloat.number !== null &&
    maxFloat.number !== null &&
    minFloat.number > maxFloat.number
  ) {
    return {
      error: "The minimum float cannot be higher than the maximum float.",
      filters: null,
    };
  }
  return {
    error: null,
    filters: {
      query: filters.query.replace(/\s+/g, " ").trim().slice(0, 120),
      itemType: validItemType(filters.itemType),
      rarity: validRarity(filters.rarity),
      // Slider endpoints represent the natural unfiltered 0-to-1 range. Keep
      // generated URLs clean and preserve the meaning of an unset filter.
      minFloat: minFloat.number === 0 ? "" : minFloat.value,
      maxFloat: maxFloat.number === 1 ? "" : maxFloat.value,
    } satisfies MarketplaceFilters,
  };
}

function isFloatSelectable(item: EconomyItemView) {
  return ["skin", "knife", "glove"].includes(item.itemType);
}

function formatFloat(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function floatInRange(value: number, minimum: number, maximum: number) {
  return value >= minimum && value <= maximum;
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

function floatsMatch(left: number, right: number) {
  return Math.abs(left - right) < 0.0000005;
}

function displayQuotedWear(item: EconomyItemView) {
  if (item.marketPriceWear) return item.marketPriceWear;
  const value = item.raw.displayPriceWear ?? item.raw.marketPriceWear;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displayQuotedFloatDiscountBps(item: EconomyItemView) {
  const value =
    item.marketPriceFloatDiscountBps ??
    numberFromUnknown(
      item.raw.displayPriceFloatDiscountBps ??
        item.raw.marketPriceFloatDiscountBps,
    );
  return value !== null && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function marketplaceQuoteFromResponse(value: unknown): MarketplaceQuote | null {
  if (!isRecord(value)) return null;
  const record = isRecord(value.quote) ? value.quote : value;
  const priceTokens = numberFromUnknown(record.priceTokens);
  const floatValue = numberFromUnknown(record.floatValue);
  const euroCents = numberFromUnknown(record.euroCents);
  const floatDiscountBps = numberFromUnknown(record.floatDiscountBps);
  if (
    priceTokens === null ||
    !Number.isSafeInteger(priceTokens) ||
    priceTokens < 1 ||
    floatValue === null ||
    floatValue < 0 ||
    floatValue > 1
  ) {
    return null;
  }
  return {
    priceTokens,
    euroCents:
      euroCents !== null &&
      Number.isSafeInteger(euroCents) &&
      euroCents >= 0
        ? euroCents
        : null,
    source: typeof record.source === "string" && record.source.trim()
      ? record.source.trim()
      : null,
    floatValue: Math.round(floatValue * 1_000_000) / 1_000_000,
    wear: typeof record.wear === "string" && record.wear.trim()
      ? record.wear.trim()
      : null,
    floatDiscountBps:
      floatDiscountBps !== null &&
      Number.isSafeInteger(floatDiscountBps) &&
      floatDiscountBps >= 0
        ? floatDiscountBps
        : null,
  };
}

function marketplaceQuoteError(value: unknown) {
  if (!isRecord(value) || typeof value.message !== "string") return null;
  return value.message.trim() || null;
}

function formatEurosFromCents(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function marketPriceSourceLabel(source: string | null) {
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
  quote,
  quoteStatus,
  quotePending,
  quoteError,
  onFloatChange,
  onPurchase,
}: {
  item: EconomyItemView;
  pending: boolean;
  walletBalance: number;
  floatInput: string;
  quote: MarketplaceQuote | null;
  quoteStatus: MarketplaceQuoteStatus;
  quotePending: boolean;
  quoteError: string | null;
  onFloatChange: (value: string) => void;
  onPurchase: (item: EconomyItemView, floatValue?: number) => void;
}) {
  const supportsFloat = isFloatSelectable(item);
  const selectedFloat = parseFloatInput(floatInput);
  const knownPrice = item.marketPriceTokens;
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
  const containerRate = item.itemType === "crate" || item.itemType === "capsule";
  const priceSource = marketPriceSourceLabel(item.marketPriceSource);
  const euroPrice = formatEurosFromCents(item.marketPriceEuroCents);
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
  const quoteWear = quote?.wear ?? displayQuotedWear(item);
  const quoteDiscountBps =
    quote?.floatDiscountBps ?? displayQuotedFloatDiscountBps(item);
  const floatPriceDetail =
    supportsFloat && selectedFloat.number !== null
      ? [
          `Float ${selectedFloat.number.toFixed(6)}`,
          quoteWear,
          quoteDiscountBps !== null
            ? `${(quoteDiscountBps / 100).toFixed(2)}% float adjustment`
            : "higher float lowers this price",
        ]
          .filter(Boolean)
          .join(" | ")
      : null;
  const priceDetail = quoteLoading
    ? "Updating the Token price for this float..."
    : quoteFailed
      ? quoteError ?? "The float-specific price could not be refreshed."
      : knownPrice === null
    ? canFetchMarketPrice
      ? "No public price match yet. Try again later or ask staff to set a last-known price."
      : "This item needs an exact public market name or a staff last-known price."
    : [
        euroPrice,
        priceSource,
        containerRate ? "50% container rate applied" : null,
        floatPriceDetail,
      ]
        .filter(Boolean)
        .join(" · ");
  const disabled =
    pending ||
    !item.catalogueId ||
    unaffordable ||
    (needsMarketPrice && !canFetchMarketPrice) ||
    missingFloat ||
    (supportsFloat && (!selectedFloat.valid || !floatIsSupported)) ||
    quoteLoading ||
    quoteFailed;

  return (
    <div className="market-item-purchase">
      <div
        className={`market-price-hud ${knownPrice === null ? "is-unavailable" : ""}`}
        aria-label={
          knownPrice === null
            ? "Marketplace price unavailable"
            : `Marketplace price: ${formatTokens(knownPrice)} Tokens`
        }
      >
        <span>{containerRate ? "Container price" : "Marketplace price"}</span>
        <strong>
          {quoteLoading
            ? "Updating price..."
            : knownPrice === null
            ? "Price unavailable"
            : `${formatTokens(knownPrice)} Tokens`}
        </strong>
        <small>{priceDetail}</small>
      </div>
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
            {`Allowed ${minimumFloat.toFixed(6)}-${maximumFloat.toFixed(6)}. The price updates with your float; higher float lowers the Token price.`}
          </small>
        </div>
      ) : null}
      <button
        type="button"
        className="button button-primary"
        disabled={disabled}
        onClick={() =>
          onPurchase(
            item,
            supportsFloat ? (selectedFloat.number ?? undefined) : undefined,
          )
        }
      >
        {pending
          ? "Processing…"
          : missingFloat
            ? "Enter a float"
            : supportsFloat && (!selectedFloat.valid || !floatIsSupported)
            ? "Enter a valid float"
            : quoteLoading
              ? "Updating price..."
              : quoteFailed
                ? "Price unavailable"
            : needsMarketPrice && !canFetchMarketPrice
              ? "Price pending staff"
              : needsMarketPrice
                ? "Refresh public price & buy"
                : `Buy for ${formatTokens(knownPrice)}`}
      </button>
    </div>
  );
}

function MarketplaceListing({
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
  onPurchase: (item: EconomyItemView, floatValue?: number) => void;
}) {
  const defaultFloat = defaultFloatForItem(item, suggestedPurchaseFloat);
  const [floatInput, setFloatInput] = useState(defaultFloat);
  const [quote, setQuote] = useState<MarketplaceQuote | null>(null);
  const [quoteStatus, setQuoteStatus] =
    useState<MarketplaceQuoteStatus>("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const supportsFloat = isFloatSelectable(item);
  const selectedFloat = parseFloatInput(floatInput);
  const minimumFloat = item.minFloat ?? 0;
  const maximumFloat = item.maxFloat ?? 1;
  const defaultFloatValue = parseFloatInput(defaultFloat).number;
  const serverQuoteFloat = displayQuotedFloat(item) ?? defaultFloatValue;
  const selectedFloatIsSupported =
    selectedFloat.number !== null &&
    floatInRange(selectedFloat.number, minimumFloat, maximumFloat);
  const activeQuote =
    quote &&
    selectedFloat.number !== null &&
    floatsMatch(quote.floatValue, selectedFloat.number)
      ? quote
      : null;
  const serverQuoteMatchesSelection =
    selectedFloat.number !== null &&
    serverQuoteFloat !== null &&
    floatsMatch(serverQuoteFloat, selectedFloat.number);
  const shouldRefreshQuote =
    supportsFloat &&
    Boolean(item.catalogueId) &&
    selectedFloat.valid &&
    selectedFloatIsSupported &&
    !activeQuote &&
    !serverQuoteMatchesSelection;

  useEffect(() => {
    setFloatInput(defaultFloat);
    setQuote(null);
    setQuoteStatus("idle");
    setQuoteError(null);
  }, [defaultFloat, item.catalogueId]);

  useEffect(() => {
    const requestedFloat = selectedFloat.number;
    if (!shouldRefreshQuote || requestedFloat === null || !item.catalogueId) {
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
                "A float-specific price is not available right now.",
            );
          }
          if (!floatsMatch(nextQuote.floatValue, requestedFloat)) {
            throw new Error("The marketplace returned a price for a different float.");
          }
          setQuote(nextQuote);
          setQuoteStatus("ready");
        } catch (error) {
          if (controller.signal.aborted) return;
          setQuote(null);
          setQuoteStatus("error");
          setQuoteError(
            error instanceof Error
              ? error.message
              : "A float-specific price is not available right now.",
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
    shouldRefreshQuote,
  ]);

  const previewFloat = parseFloatInput(floatInput).number;
  const pricedItem = activeQuote
    ? {
        ...item,
        marketPriceTokens: activeQuote.priceTokens,
        marketPriceEuroCents: activeQuote.euroCents,
        marketPriceSource: activeQuote.source,
        marketPriceFloatValue: activeQuote.floatValue,
        marketPriceWear: activeQuote.wear,
        marketPriceFloatDiscountBps: activeQuote.floatDiscountBps,
      }
    : item;
  return (
    <EconomyItemCard
      item={pricedItem}
      enableMarketPreview
      previewFloat={previewFloat}
      actions={
        <MarketplacePurchaseAction
          item={pricedItem}
          pending={pending}
          walletBalance={walletBalance}
          floatInput={floatInput}
          quote={activeQuote}
          quoteStatus={quoteStatus}
          quotePending={shouldRefreshQuote}
          quoteError={quoteError}
          onFloatChange={setFloatInput}
          onPurchase={onPurchase}
        />
      }
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
  const walletView = useMemo(() => economyWallet(wallet), [wallet]);
  const [draft, setDraft] = useState<MarketplaceFilters>(() => ({
    ...filters,
    itemType: validItemType(filters.itemType),
  }));
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const pageCount = Math.max(
    1,
    Math.ceil(pagination.total / pagination.pageSize),
  );
  const firstResult = pagination.total
    ? (pagination.page - 1) * pagination.pageSize + 1
    : 0;
  const lastResult = pagination.total
    ? Math.min(pagination.total, firstResult + items.length - 1)
    : 0;
  const pageLinks = paginationPages(pageCount, pagination.page);
  // Browsing by a float range only filters catalogue entries; it does not
  // silently change the exact float a player is about to buy. Each card starts
  // on its server-quoted default and lets the player select a specific float.
  const suggestedPurchaseFloat = formatFloat(DEFAULT_MARKET_FLOAT);
  const filterMinimumFloat = parseFloatInput(draft.minFloat).number ?? 0;
  const filterMaximumFloat = parseFloatInput(draft.maxFloat).number ?? 1;

  useEffect(() => {
    setDraft({
      ...filters,
      itemType: validItemType(filters.itemType),
    });
  }, [
    filters.itemType,
    filters.maxFloat,
    filters.minFloat,
    filters.query,
    filters.rarity,
  ]);

  function updateDraft<K extends keyof MarketplaceFilters>(
    key: K,
    value: MarketplaceFilters[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeFilters(draft);
    if (!normalized.filters) {
      setNotice({ type: "error", text: normalized.error ?? "Invalid filters." });
      return;
    }
    setNotice(null);
    router.push(marketHref(normalized.filters, 1), { scroll: false });
  }

  function purchase(item: EconomyItemView, floatValue?: number) {
    if (!item.catalogueId) return;
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await postEconomyAction(
          "/api/economy/market/purchase",
          csrf,
          {
            catalogueId: item.catalogueId,
            ...(floatValue === undefined ? {} : { floatValue }),
          },
        );
        setNotice({
          type: "success",
          text:
            result.message ||
            `${item.displayName} was added to your inventory.`,
        });
        router.refresh();
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "The purchase could not be completed.",
        });
      }
    });
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
            Prices use public historical sale medians at 100 Tokens per EUR.
            Crates and capsules use their 50% container rate; no key is needed
            to open them.
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

      <form
        className="panel form-panel market-filters"
        action="/market"
        method="get"
        onSubmit={submitFilters}
      >
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
          <span className="tag">Up to 50 items per page</span>
        </div>
        <div className="market-filter-grid">
          <label className="market-search-field" htmlFor="market-search">
            Search items
            <input
              id="market-search"
              name="q"
              type="search"
              maxLength={120}
              value={draft.query}
              placeholder="e.g. AK-47, weapons, Redline"
              onChange={(event) => updateDraft("query", event.target.value)}
            />
          </label>
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
              {MARKET_RARITY_RANKS.map((value) => (
                <option key={value} value={value}>
                  {rarityName(value)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="market-float-range">
            <legend>Float range</legend>
            <div className="market-float-slider-controls">
              <div>
                <div className="market-float-slider-label">
                  <label htmlFor="market-min-float">Minimum</label>
                  <output htmlFor="market-min-float">
                    {filterMinimumFloat.toFixed(6)}
                  </output>
                </div>
                <input
                  id="market-min-float"
                  name="minFloat"
                  type="range"
                  min="0"
                  max={filterMaximumFloat}
                  step={FLOAT_FILTER_SLIDER_STEP}
                  value={filterMinimumFloat}
                  aria-valuetext={`Minimum float ${filterMinimumFloat.toFixed(6)}`}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    updateDraft(
                      "minFloat",
                      formatFloat(Math.min(value, filterMaximumFloat)),
                    );
                  }}
                />
              </div>
              <div>
                <div className="market-float-slider-label">
                  <label htmlFor="market-max-float">Maximum</label>
                  <output htmlFor="market-max-float">
                    {filterMaximumFloat.toFixed(6)}
                  </output>
                </div>
                <input
                  id="market-max-float"
                  name="maxFloat"
                  type="range"
                  min={filterMinimumFloat}
                  max="1"
                  step={FLOAT_FILTER_SLIDER_STEP}
                  value={filterMaximumFloat}
                  aria-valuetext={`Maximum float ${filterMaximumFloat.toFixed(6)}`}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    updateDraft(
                      "maxFloat",
                      formatFloat(Math.max(value, filterMinimumFloat)),
                    );
                  }}
                />
              </div>
            </div>
          </fieldset>
          <div className="market-filter-actions">
            <button className="button button-secondary" type="submit">
              <Search aria-hidden="true" /> Search catalogue
            </button>
            <Link className="button button-quiet" href="/market" scroll={false}>
              <X aria-hidden="true" /> Clear filters
            </Link>
          </div>
        </div>
        <p className="market-result-summary" aria-live="polite">
          {pagination.total
            ? `Showing ${firstResult}–${lastResult} of ${pagination.total} matching items`
            : "No matching items"}
          <span>{pagination.pageSize} per page</span>
        </p>
      </form>

      {items.length ? (
        <div className="feature-grid market-item-grid">
          {items.map((item) => (
            <MarketplaceListing
              key={`${item.catalogueId ?? item.id}-${item.displayName}`}
              item={item}
              pending={pending}
              walletBalance={walletView.balance}
              suggestedPurchaseFloat={suggestedPurchaseFloat}
              onPurchase={purchase}
            />
          ))}
        </div>
      ) : (
        <EconomyEmptyState
          title="No marketplace items match"
          description="Try a broader search or clear one of the filters."
        />
      )}

      {pagination.total > pagination.pageSize ? (
        <nav className="market-pagination" aria-label="Marketplace pages">
          <Link
            className="button button-secondary market-page-button"
            href={marketHref(filters, Math.max(1, pagination.page - 1))}
            scroll={false}
            aria-disabled={pagination.page <= 1}
            tabIndex={pagination.page <= 1 ? -1 : undefined}
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
                  className={`market-page-number ${page === pagination.page ? "is-current" : ""}`}
                  href={marketHref(filters, page)}
                  scroll={false}
                  aria-current={page === pagination.page ? "page" : undefined}
                >
                  {page}
                </Link>
              ),
            )}
          </div>
          <Link
            className="button button-secondary market-page-button"
            href={marketHref(filters, Math.min(pageCount, pagination.page + 1))}
            scroll={false}
            aria-disabled={pagination.page >= pageCount}
            tabIndex={pagination.page >= pageCount ? -1 : undefined}
          >
            Next <ChevronRight aria-hidden="true" />
          </Link>
        </nav>
      ) : null}
    </section>
  );
}
