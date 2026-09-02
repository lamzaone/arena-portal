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
  SearchNavigationForm,
  SearchField,
} from "@/components/ui/search-field";
import {
  marketplaceCategories,
  normalizeMarketplaceCategory,
} from "@/lib/economy/market-categories";
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
  floatDiscountBps: number | null;
  discount: EconomyItemView["marketDiscount"];
};

type MarketplaceQuoteStatus = "idle" | "loading" | "ready" | "error";

type MarketplacePurchaseOptions = {
  floatValue?: number;
  stattrak: boolean;
  quantity?: number;
};

function isContainerItem(item: EconomyItemView) {
  return ["crate", "case", "capsule"].includes(item.itemType);
}

function marketHref(filters: MarketplaceFilters, page: number) {
  const parameters = new URLSearchParams();
  if (filters.query) parameters.set("q", filters.query);
  if (filters.itemType) parameters.set("type", filters.itemType);
  if (filters.rarity) parameters.set("rarity", filters.rarity);
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

function floatsMatch(left: number, right: number) {
  return Math.abs(left - right) < 0.0000005;
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
  quote,
  quoteStatus,
  quotePending,
  quoteError,
  onFloatChange,
  stattrak,
  onStattrakChange,
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
  stattrak: boolean;
  onStattrakChange: (value: boolean) => void;
  onPurchase: (item: EconomyItemView, options: MarketplacePurchaseOptions) => void;
}) {
  const vipMembership = isVipMembershipItem(item);
  const profileTheme = isProfileThemeItem(item);
  const supportsFloat = isFloatSelectable(item);
  const supportsStattrak = isStattrakSelectable(item);
  const selectedFloat = parseFloatInput(floatInput);
  // The standard catalogue price must never be shown or charged while the
  // separately quoted StatTrak™ variant is still being resolved.
  const knownPrice = stattrak && !quote ? null : item.marketPriceTokens;
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
            {`Allowed ${minimumFloat.toFixed(6)}-${maximumFloat.toFixed(6)}. The price updates with your float; higher float lowers the Token price.`}
          </small>
        </div>
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
  onPurchase: (item: EconomyItemView, options: MarketplacePurchaseOptions) => void;
}) {
  const defaultFloat = defaultFloatForItem(item, suggestedPurchaseFloat);
  const [floatInput, setFloatInput] = useState(defaultFloat);
  const [stattrak, setStattrak] = useState(false);
  const [quote, setQuote] = useState<MarketplaceQuote | null>(null);
  const [quoteStatus, setQuoteStatus] =
    useState<MarketplaceQuoteStatus>("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const supportsFloat = isFloatSelectable(item);
  const supportsStattrak = isStattrakSelectable(item);
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
    floatsMatch(quote.floatValue, selectedFloat.number) &&
    quote.stattrak === stattrak
      ? quote
      : null;
  const serverQuoteMatchesSelection =
    !stattrak &&
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
    setStattrak(false);
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
                "A float-specific price is not available right now.",
            );
          }
          if (
            !floatsMatch(nextQuote.floatValue, requestedFloat) ||
            nextQuote.stattrak !== stattrak
          ) {
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
    stattrak,
    shouldRefreshQuote,
  ]);

  const previewFloat = parseFloatInput(floatInput).number;
  const pricedItem = {
    ...item,
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
      : {}),
  };
  const discountLabel = discountPercentLabel(pricedItem);
  return (
    <EconomyItemCard
      item={pricedItem}
      className={isSpecialItem(item) ? "market-item-special" : ""}
      enableMarketPreview
      previewFloat={previewFloat}
      previewOverlay={
        discountLabel ? (
          <span className="market-artwork-discount-tag">
            <BadgePercent aria-hidden="true" /> {discountLabel}
          </span>
        ) : null
      }
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
          stattrak={stattrak}
          onStattrakChange={setStattrak}
          onPurchase={onPurchase}
        />
      }
    />
  );
}

function MarketplaceContainerListing({
  item,
  pending,
  walletBalance,
  onPurchase,
}: {
  item: EconomyItemView;
  pending: boolean;
  walletBalance: number;
  onPurchase: (item: EconomyItemView, options: MarketplacePurchaseOptions) => void;
}) {
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [dropState, setDropState] = useState<EconomyCrateDropState>({
    status: "idle",
  });
  const panelId = `market-container-${item.catalogueId ?? item.id}-details`;
  const toggleId = `market-container-${item.catalogueId ?? item.id}-toggle`;
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
    (priceAvailable || canRefreshPrice) &&
    dropState.status === "ready";
  const buyLabel = pending
    ? "Buying..."
    : dropState.status !== "ready"
      ? "Verify drops before buying"
      : unaffordable
        ? "Not enough Tokens"
        : totalPrice !== null
          ? `Buy ${quantity} for ${formatTokens(totalPrice)} Tokens`
          : canRefreshPrice
            ? `Refresh price & buy ${quantity}`
            : "Price pending staff";

  function closePanel() {
    setExpanded(false);
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }

  return (
    <>
      <EconomyItemCard
        item={item}
        enableMarketPreview
        actions={
          <button
            ref={toggleRef}
            id={toggleId}
            type="button"
            className="button button-secondary market-buy-button crate-inline-drops-toggle"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((current) => !current)}
          >
            <ChevronDown aria-hidden="true" />
            {expanded ? "Hide drops and purchase" : "View drops and purchase"}
          </button>
        }
      />
      <section
        data-ui="item-modal"
        id={panelId}
        className="panel crate-inline-modal crate-market-inline-modal has-drop-odds"
        role="region"
        aria-labelledby={toggleId}
        hidden={!expanded}
        style={expanded ? undefined : { display: "none" }}
      >
        <header className="crate-inline-modal-header">
          <div>
            <p className="eyebrow">
              <ShoppingBag aria-hidden="true" /> Container market
            </p>
            <h3>{item.displayName}</h3>
            <p>
              Review the live server drop pool, choose an amount, then complete
              one quantity-aware purchase.
            </p>
          </div>
          <button
            type="button"
            className="button button-quiet crate-inline-modal-close"
            onClick={closePanel}
          >
            <X aria-hidden="true" /> Close
          </button>
        </header>
        {expanded ? (
          <>
            <div className="crate-inline-modal-drops">
              <CrateDropPreview
                catalogueId={item.catalogueId}
                onStateChange={setDropState}
              />
            </div>
            <div className="crate-catalogue-purchase crate-selected-purchase">
              <div
                className={`market-price-hud ${priceAvailable ? "" : "is-unavailable"}`}
                aria-label={
                  priceAvailable
                    ? `${item.displayName} costs ${formatTokens(unitPrice)} Tokens each`
                    : `${item.displayName} price unavailable`
                }
              >
                <span>Container price</span>
                <strong>
                  {priceAvailable
                    ? `${formatTokens(unitPrice)} Tokens each`
                    : "Price unavailable"}
                </strong>
                {priceAvailable &&
                item.marketBasePriceTokens !== null &&
                item.marketBasePriceTokens > unitPrice ? (
                  <del className="market-base-price">
                    Original {formatTokens(item.marketBasePriceTokens)} Tokens each
                  </del>
                ) : null}
                <small>
                  {priceAvailable
                    ? totalPrice === null
                      ? "Total unavailable"
                      : `${quantity} total: ${formatTokens(totalPrice)} Tokens`
                    : canRefreshPrice
                      ? "The current public price will be checked before purchase."
                      : "No public or staff price is available yet."}
                </small>
              </div>
              <label className="crate-quantity-control">
                <span>Amount</span>
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
                    type="number"
                    min="1"
                    max={MAX_CRATE_PURCHASE_QUANTITY}
                    value={quantity}
                    disabled={pending}
                    aria-label="Containers to buy"
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
                <small>
                  Buy up to {MAX_CRATE_PURCHASE_QUANTITY} containers in one
                  transaction.
                </small>
              </label>
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
              {unaffordable && totalPrice !== null ? (
                <small className="crate-purchase-help" role="status">
                  Need {formatTokens(totalPrice - walletBalance)} more Tokens.
                </small>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}

function MarketplaceListing(props: {
  item: EconomyItemView;
  pending: boolean;
  walletBalance: number;
  suggestedPurchaseFloat: string;
  onPurchase: (item: EconomyItemView, options: MarketplacePurchaseOptions) => void;
}) {
  if (isContainerItem(props.item)) {
    return (
      <MarketplaceContainerListing
        item={props.item}
        pending={props.pending}
        walletBalance={props.walletBalance}
        onPurchase={props.onPurchase}
      />
    );
  }
  return <MarketplaceStandardListing {...props} />;
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
  const pendingPurchaseIdsRef = useRef(new Set<number>());
  const [pendingPurchaseIds, setPendingPurchaseIds] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
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

  function updateDraft<K extends keyof MarketplaceFilters>(
    key: K,
    value: MarketplaceFilters[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function purchase(
    item: EconomyItemView,
    options: MarketplacePurchaseOptions,
  ) {
    if (!item.catalogueId) return;
    const catalogueId = item.catalogueId;
    if (pendingPurchaseIdsRef.current.has(catalogueId)) return;
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
          ...(options.quantity === undefined
            ? {}
            : { quantity: clampCrateQuantity(options.quantity) }),
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
            Token prices use current public market data. Crates and capsules
            use their listed base price unless an explicit admin discount is
            active; no key is needed to open them.
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
      </SearchNavigationForm>

      {items.length ? (
        <div className="feature-grid market-item-grid">
          {items.map((item) => (
            <MarketplaceListing
              key={`${item.catalogueId ?? item.id}-${item.displayName}`}
              item={item}
              pending={
                item.catalogueId !== null &&
                pendingPurchaseIds.has(item.catalogueId)
              }
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
