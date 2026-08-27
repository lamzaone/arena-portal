"use client";

import {
  Box,
  ChevronLeft,
  ChevronRight,
  Gift,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
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

const CATALOGUE_PAGE_SIZE = 50;
const CRATE_RARITY_RANKS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

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

function CrateCataloguePurchase({
  crate,
  walletBalance,
  pending,
  buying,
  onPurchase,
}: {
  crate: EconomyCrateView;
  walletBalance: number;
  pending: boolean;
  buying: boolean;
  onPurchase: (crate: EconomyCrateView) => void;
}) {
  const priceTokens = cratePriceTokens(crate);
  const canRefreshPrice = Boolean(crate.marketHashName);
  const hasCatalogueEntry = crate.catalogueId !== null;
  const unaffordable = priceTokens !== null && priceTokens > walletBalance;
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
            : `Buy for ${formatTokens(priceTokens)}`;

  return (
    <div className="crate-catalogue-purchase">
      <div
        className={`market-price-hud ${priceAvailable ? "" : "is-unavailable"}`}
        aria-label={
          priceAvailable
            ? `${crate.displayName} costs ${formatTokens(priceTokens)} Tokens`
            : `${crate.displayName} price unavailable`
        }
      >
        <span>Container price</span>
        <strong>
          {priceAvailable ? `${formatTokens(priceTokens)} Tokens` : "Price unavailable"}
        </strong>
        <small>{priceDetail}</small>
      </div>
      <button
        type="button"
        className="button button-primary"
        disabled={pending || !purchaseAvailable || unaffordable}
        onClick={() => onPurchase(crate)}
      >
        <ShoppingBag aria-hidden="true" /> {buttonLabel}
      </button>
      {unaffordable ? (
        <small className="crate-purchase-help">
          Need {formatTokens(priceTokens - walletBalance)} more Tokens.
        </small>
      ) : null}
    </div>
  );
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
  const [selectedCrateId, setSelectedCrateId] = useState("");
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
  const [activeAction, setActiveAction] = useState<"open" | "purchase" | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const selectedCrate =
    ownedCrates.find((item) => item.id === selectedCrateId) ?? null;
  const selectedCratePrice =
    selectedCrate?.cratePriceTokens ?? selectedCrate?.marketPriceTokens ?? null;
  const busy = pending || activeAction !== null;
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

  function openCrate() {
    if (!selectedCrate || busy) return;
    setNotice(null);
    setUnboxed(null);
    setActiveAction("open");
    startTransition(async () => {
      try {
        const result = await postEconomyAction("/api/economy/crates/open", csrf, {
          crateItemId: selectedCrate.id,
        });
        const resultItem = result.item ? toEconomyItem(result.item) : null;
        setUnboxed(
          resultItem?.id || resultItem?.displayName !== "Unnamed item"
            ? resultItem
            : null,
        );
        setNotice({
          type: "success",
          text: result.message || "Crate opened. The item is now in your inventory.",
        });
        router.refresh();
      } catch (error) {
        setNotice({
          type: "error",
          text:
            error instanceof Error ? error.message : "The crate could not be opened.",
        });
      } finally {
        setActiveAction(null);
      }
    });
  }

  function buyCrate(crate: EconomyCrateView) {
    if (!crate.catalogueId || busy) return;
    setNotice(null);
    setActiveAction("purchase");
    startTransition(async () => {
      try {
        const result = await postEconomyAction(
          "/api/economy/market/purchase",
          csrf,
          { catalogueId: crate.catalogueId },
        );
        const charged =
          typeof result.priceTokens === "number" &&
          Number.isFinite(result.priceTokens)
            ? ` for ${formatTokens(result.priceTokens)} Tokens`
            : "";
        setNotice({
          type: "success",
          text: `${crate.displayName} was added to your crates${charged}. Choose it above to open it.`,
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

      {unboxed ? (
        <section className="panel unboxed-reveal" aria-live="polite">
          <div>
            <p className="eyebrow">
              <Sparkles aria-hidden="true" /> Unboxed item
            </p>
            <h2>Added to your inventory</h2>
            <p className="empty-copy">
              Your new item is ready to inspect, equip, trade, or customize
              from Inventory.
            </p>
          </div>
          <EconomyItemCard item={unboxed} enableMarketPreview />
        </section>
      ) : null}

      <section className="history-section crate-picker-section">
        <div className="section-heading compact">
          <p className="eyebrow">
            <Box aria-hidden="true" /> Your crates
          </p>
          <h2>Choose one to open</h2>
        </div>
        {ownedCrates.length ? (
          <div className="crate-opening-layout">
            <div className="feature-grid crate-item-grid">
              {ownedCrates.map((crate) => (
                <EconomyItemCard
                  key={crate.id}
                  item={crate}
                  selected={selectedCrateId === crate.id}
                  onSelect={() => setSelectedCrateId(crate.id)}
                  selectionLabel={`Select ${crate.displayName} to open`}
                  enableMarketPreview
                />
              ))}
            </div>
            <aside className="panel crate-opening-stage" aria-live="polite">
              {selectedCrate ? (
                <>
                  <MarketplaceItemPreview
                    item={selectedCrate}
                    enableMarketPreview
                  />
                  <div className="crate-opening-stage-copy">
                    <span className={rarityClass(selectedCrate.rarityRank)}>
                      {selectedCrate.rarity}
                    </span>
                    <h3>{selectedCrate.displayName}</h3>
                    <p>
                      {selectedCrate.description ??
                        `Ready to open this ${humanize(selectedCrate.itemType)}.`}
                    </p>
                    <div className="tag-list">
                      {selectedCratePrice !== null ? (
                        <span className="tag">
                          {formatTokens(selectedCratePrice)} Token container rate
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button button-primary button-large"
                    disabled={busy}
                    onClick={openCrate}
                  >
                    {activeAction === "open"
                      ? "Opening..."
                      : `Open ${selectedCrate.displayName}`}
                  </button>
                </>
              ) : (
                <div className="crate-selection-empty">
                  <Gift aria-hidden="true" />
                  <h3>Select a crate</h3>
                  <p>
                    Choose an owned case or capsule to inspect it here, then
                    open it without a key.
                  </p>
                </div>
              )}
            </aside>
          </div>
        ) : (
          <EconomyEmptyState
            title="You do not have a crate yet"
            description="Crates can arrive as match drops, hourly drops, map-end drops, or direct marketplace purchases below."
            icon={<Gift aria-hidden="true" />}
          />
        )}
      </section>

      <section className="history-section" aria-labelledby="crate-catalogue-heading">
        <div className="section-heading compact">
          <p className="eyebrow">
            <ShoppingBag aria-hidden="true" /> Crate catalogue
          </p>
          <h2 id="crate-catalogue-heading">Find a case or capsule</h2>
          <p>
            Prices show the live stored Token rate: 1 EUR equals 100 Tokens,
            with every container sold at 50% and no key required.
          </p>
        </div>

        <form
          className="panel form-panel crate-catalogue-filters"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="crate-filter-heading">
            <div>
              <p className="eyebrow">
                <SlidersHorizontal aria-hidden="true" /> Browse containers
              </p>
              <p className="empty-copy">
                Search the crate name, public market name, loot-table code, or
                rarity. Results update as you filter.
              </p>
            </div>
            <span className="tag">Up to {CATALOGUE_PAGE_SIZE} per page</span>
          </div>
          <div className="crate-filter-grid">
            <label className="crate-search-field" htmlFor="crate-search">
              Search crates
              <input
                id="crate-search"
                type="search"
                value={catalogueQuery}
                placeholder="e.g. Kilowatt, capsule, autograph"
                onChange={(event) => setCatalogueQuery(event.target.value)}
              />
            </label>
            <label htmlFor="crate-type">
              Type
              <select
                id="crate-type"
                value={catalogueType}
                onChange={(event) =>
                  setCatalogueType(event.target.value as CatalogueTypeFilter)
                }
              >
                <option value="all">All containers</option>
                <option value="crate">Crates / cases</option>
                <option value="capsule">Capsules</option>
              </select>
            </label>
            <label htmlFor="crate-rarity">
              Rarity
              <select
                id="crate-rarity"
                value={catalogueRarity}
                onChange={(event) => setCatalogueRarity(event.target.value)}
              >
                <option value="">All rarities</option>
                {CRATE_RARITY_RANKS.map((rank) => (
                  <option key={rank} value={rank}>
                    {rarityName(rank)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="crate-price-filter">
              Price
              <select
                id="crate-price-filter"
                value={cataloguePrice}
                onChange={(event) =>
                  setCataloguePrice(event.target.value as CataloguePriceFilter)
                }
              >
                <option value="all">All price states</option>
                <option value="priced">Priced now</option>
                <option value="affordable">Within my balance</option>
                <option value="unpriced">Price pending</option>
              </select>
            </label>
            <label htmlFor="crate-sort">
              Sort
              <select
                id="crate-sort"
                value={catalogueSort}
                onChange={(event) =>
                  setCatalogueSort(event.target.value as CatalogueSort)
                }
              >
                <option value="catalogue">Catalogue order</option>
                <option value="price-asc">Lowest Token price</option>
                <option value="price-desc">Highest Token price</option>
                <option value="rarity">Rarity</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
          <div className="crate-filter-summary" aria-live="polite">
            <p>
              {filteredCatalogue.length
                ? `Showing ${catalogueStart + 1}-${catalogueEnd} of ${filteredCatalogue.length} matching containers`
                : "No matching containers"}
            </p>
            {filtersActive ? (
              <button
                className="button button-quiet"
                type="button"
                onClick={resetCatalogueFilters}
              >
                <X aria-hidden="true" /> Clear filters
              </button>
            ) : null}
          </div>
        </form>

        {catalogueItems.length ? (
          <div className="feature-grid crate-catalogue-grid">
            {catalogueItems.map((crate) => (
              <EconomyItemCard
                key={`${crate.catalogueId ?? crate.id}-${crate.displayName}`}
                item={crate}
                enableMarketPreview
                actions={
                  <CrateCataloguePurchase
                    crate={crate}
                    walletBalance={walletView.balance}
                    pending={busy}
                    buying={activeAction === "purchase"}
                    onPurchase={buyCrate}
                  />
                }
              />
            ))}
          </div>
        ) : (
          <EconomyEmptyState
            title="No crates match these filters"
            description="Try a shorter search, another price state, or clear the current filters."
            icon={<Search aria-hidden="true" />}
          />
        )}

        {filteredCatalogue.length > CATALOGUE_PAGE_SIZE ? (
          <nav className="crate-pagination" aria-label="Crate catalogue pages">
            <button
              type="button"
              className="button button-secondary"
              disabled={visibleCataloguePage <= 1}
              onClick={() => setCataloguePage(visibleCataloguePage - 1)}
            >
              <ChevronLeft aria-hidden="true" /> Previous
            </button>
            <span>
              Page {visibleCataloguePage} of {cataloguePageCount}
            </span>
            <button
              type="button"
              className="button button-secondary"
              disabled={visibleCataloguePage >= cataloguePageCount}
              onClick={() => setCataloguePage(visibleCataloguePage + 1)}
            >
              Next <ChevronRight aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </section>
    </section>
  );
}
