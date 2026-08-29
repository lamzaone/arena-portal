import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  Archive,
  BadgePercent,
  Coins,
  Gift,
  LockKeyhole,
  PackageSearch,
  PackagePlus,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
} from "lucide-react";

import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import {
  getEconomyCatalogue,
  getEconomyCatalogueItem,
  getEconomyDiscountRules,
  getStaffCustomCrateManagement,
  getStaffCustomCrates,
  type EconomyItemType,
} from "@/lib/data/portal-repository";
import { SignInRequired } from "@/components/sign-in-required";
import { StaffSubmenu } from "@/components/staff-submenu";
import { PortalToast } from "@/components/success-toast";
import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import { DiscountRuleAdmin } from "@/components/economy/discount-rule-admin";
import { PortalShell } from "@/components/ui/portal-shell";
import {
  SearchNavigationForm,
  SearchSubmitButton,
} from "@/components/ui/search-field";
import { ServerSearchField } from "@/components/ui/server-search-field";
import {
  ECONOMY_ITEM_TYPES,
  ECONOMY_RARITIES,
  ECONOMY_SPECIAL_RARITY_RANK,
  economyItemTypeLabel,
  isCustomProductItemType,
} from "@/lib/economy/item-taxonomy";

import styles from "./items-admin.module.css";

type AdminItemsPageProps = {
  searchParams: Promise<{
    tab?: string;
    marketplaceQ?: string;
    crateQ?: string;
    discountQ?: string;
    /** Legacy catalogue links remain valid while callers migrate. */
    catalogue?: string;
    crate?: string;
    crateReward?: string;
    crateRewardType?: string;
    notice?: string;
    error?: string;
  }>;
};

const itemsTabs = ["marketplace", "crates", "discount"] as const;
type ItemsTab = (typeof itemsTabs)[number];

const itemTypes = ECONOMY_ITEM_TYPES;

function validCatalogueId(value: string | undefined) {
  if (!value || !/^\d{1,20}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanLookup(value: string | undefined) {
  return (value ?? "").trim().slice(0, 120);
}

function itemsTab(value: string | undefined, hasCrateContext: boolean): ItemsTab {
  if (itemsTabs.includes(value as ItemsTab)) return value as ItemsTab;
  return hasCrateContext ? "crates" : "marketplace";
}

function itemsHref(
  tab: ItemsTab,
  values: {
    marketplaceQuery?: string;
    crateQuery?: string;
    discountQuery?: string;
    crateId?: number | null;
    crateRewardQuery?: string;
    crateRewardType?: EconomyItemType;
  },
) {
  const query = new URLSearchParams({ tab });
  if (values.marketplaceQuery)
    query.set("marketplaceQ", values.marketplaceQuery);
  if (values.crateQuery) query.set("crateQ", values.crateQuery);
  if (values.discountQuery) query.set("discountQ", values.discountQuery);
  if (values.crateId) query.set("crate", String(values.crateId));
  if (values.crateRewardQuery)
    query.set("crateReward", values.crateRewardQuery);
  if (values.crateRewardType)
    query.set("crateRewardType", values.crateRewardType);
  return `/admin/items?${query.toString()}`;
}

function validEconomyItemType(value: string | undefined) {
  return itemTypes.includes(value as (typeof itemTypes)[number])
    ? (value as EconomyItemType)
    : undefined;
}

function formatTokens(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPrice(tokens: number | null) {
  return tokens === null
    ? "No last-known price"
    : `${formatTokens(tokens)} Tokens`;
}

function formatDropChance(weight: number, totalWeight: number) {
  if (totalWeight < 1) return "No active odds";
  const chance = (weight / totalWeight) * 100;
  const digits = chance < 0.1 ? 3 : chance < 1 ? 2 : 1;
  return `${chance.toFixed(digits)}%`;
}

function catalogueArtworkUrl(metadata: Record<string, unknown>) {
  const imageUrl = metadata.imageUrl;
  return typeof imageUrl === "string" && imageUrl.trim()
    ? imageUrl.trim()
    : "";
}

const permanentlyMarketDisabledItemTypes = new Set([
  "graffiti",
  "patch",
  "nametag",
  "music_kit",
]);

function isVipMembership(itemType: EconomyItemType) {
  return itemType === "vip_membership";
}

function isMarketEnabled(metadata: Record<string, unknown>) {
  return metadata.marketEnabled !== false;
}

function noticeText(value: string | undefined) {
  const messages: Record<string, string> = {
    "tokens-updated": "Token balance updated and logged.",
    "item-granted": "Item granted to the selected player's inventory.",
    "item-updated": "Item customization saved and queued for server refresh.",
    "item-state-updated": "Item state updated.",
    "item-transferred": "Item transferred and both loadouts refreshed.",
    "sticker-attached": "Sticker attachment saved.",
    "sticker-detached": "Sticker detached and returned to the inventory.",
    "loadout-updated": "Player loadout slot saved.",
    "loadout-cleared": "Player loadout slot cleared.",
    "price-refreshed":
      "Public market price recorded as the new current snapshot.",
    "market-name-saved":
      "Exact public market name saved; its prior price snapshot was invalidated.",
    "price-saved": "Last-known market price recorded.",
    "artwork-saved": "Catalogue artwork saved and will be used by all item previews.",
    "market-enabled": "This product is now listed in the Marketplace.",
    "market-disabled": "This product is now hidden from the Marketplace.",
    "custom-crate-created": "Custom crate created as a draft. Add rewards, then list it in Marketplace when ready.",
    "custom-crate-saved": "Custom crate product details and direct Token price saved.",
    "custom-crate-reward-added": "Reward added to the crate pool.",
    "custom-crate-reward-removed": "Reward removed from future crate openings.",
    "discount-created": "Discount rule created and audited.",
    "discount-saved": "Discount rule changes saved and audited.",
    "discount-enabled": "Discount rule enabled.",
    "discount-disabled": "Discount rule disabled.",
  };
  return value ? messages[value] : undefined;
}

function errorText(value: string | undefined) {
  const messages: Record<string, string> = {
    verification: "Session verification failed. Reload the page and try again.",
    permission: "Your staff group does not have Token economy access.",
    "token-permission": "Your staff group cannot adjust Token balances.",
    "grant-permission": "Your staff group cannot grant inventory items.",
    "manage-permission":
      "This action requires full inventory administration access.",
    "loadout-permission": "This action requires loadout management access.",
    target:
      "The selected player is invalid or protected by higher staff immunity.",
    catalogue: "Choose a valid catalogue item.",
    "market-name":
      "Set an exact public market-hash name before refreshing its price.",
    "price-unavailable":
      "The public price database has no matching quote. Its last-known Token price remains unchanged.",
    price: "Provide a valid catalogue ID and whole Token price.",
    artwork:
      "Use a PNG, JPEG, or WebP below 5 MB, or an HTTPS URL or /images/economy/ path.",
    "token-details": "Provide a valid token action, amount, and reason.",
    "item-details": "Review the item fields, JSON, and reason before saving.",
    "container-catalogue":
      "Crates and capsules must be granted from a catalogue entry so their loot table is available.",
    "custom-product-catalogue":
      "VIP memberships and profile themes must use a trusted catalogue product.",
    "custom-crate-details":
      "Provide a crate name, rarity, direct Token price, and valid artwork URL or image upload.",
    "custom-crate-reward":
      "Choose a valid catalogue reward and a positive drop weight.",
    "custom-crate-duplicate":
      "That item is already active in this crate's reward pool. Remove it first if you need to change the reward.",
    "discount-details":
      "Review the discount target, adjustment, dates, and category exclusions.",
    "discount-missing": "That discount rule no longer exists.",
    "crate-reward-required":
      "A listed crate, or one with unopened copies in player inventories, must keep at least one active reward.",
    "sticker-details": "Provide a valid weapon, sticker, slot, and reason.",
    "loadout-details": "Choose a valid loadout slot, item, and reason.",
    "transfer-details": "Provide a valid destination SteamID64 and reason.",
    database:
      "The economy action could not be saved. Check the database and try again.",
  };
  return value
    ? (messages[value] ??
        "The requested economy action could not be completed.")
    : undefined;
}

function ActionFields({
  csrf,
  action,
}: {
  csrf: string;
  action: string;
}) {
  return (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value={action} />
      <input
        type="hidden"
        name="idempotencyKey"
        value={randomUUID().replaceAll("-", "")}
      />
    </>
  );
}

export default async function AdminItemsPage({
  searchParams,
}: AdminItemsPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session)
    return (
      <SignInRequired
        title="Token item management"
        description="Sign in with an authorized Steam staff account to manage Tokens, inventory, and loadouts."
      />
    );

  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin || !access.canViewEconomy)
    return (
      <PortalShell authenticated>
        <section className="staff-denied">
          <LockKeyhole aria-hidden="true" />
          <p className="tapped-kicker">Restricted area</p>
          <h1>Economy staff access required.</h1>
          <p>
            Your staff group does not have a TAPPED Token economy permission.
          </p>
          <Link className="button button-secondary" href="/admin">
            Back to staff panel
          </Link>
        </section>
      </PortalShell>
    );

  const selectedCrateId = validCatalogueId(params.crate);
  const activeTab = itemsTab(
    params.tab,
    Boolean(selectedCrateId || params.crateReward || params.crateRewardType),
  );
  const marketplaceQuery = cleanLookup(
    params.marketplaceQ ?? params.catalogue,
  );
  const crateQuery = cleanLookup(params.crateQ);
  const discountQuery = cleanLookup(params.discountQ);
  const crateRewardQuery = cleanLookup(params.crateReward);
  const crateRewardType = validEconomyItemType(params.crateRewardType);

  type CataloguePage = Awaited<ReturnType<typeof getEconomyCatalogue>>;
  type CustomCrateList = Awaited<ReturnType<typeof getStaffCustomCrates>>;
  type CustomCrateManagement = Awaited<
    ReturnType<typeof getStaffCustomCrateManagement>
  >;
  type DiscountRuleList = Awaited<ReturnType<typeof getEconomyDiscountRules>>;
  const emptyCatalogue = (pageSize: number): CataloguePage => ({
    items: [],
    total: 0,
    page: 1,
    pageSize,
  });
  let catalogue = emptyCatalogue(100);
  let customCrates: CustomCrateList = [];
  let customCrate: CustomCrateManagement = null;
  let crateRewardCatalogue = emptyCatalogue(50);
  let discountRules: DiscountRuleList = [];
  let discountCatalogue = emptyCatalogue(100);

  if (activeTab === "marketplace") {
    const catalogueIdLookup = validCatalogueId(marketplaceQuery);
    if (catalogueIdLookup) {
      const item = await getEconomyCatalogueItem(catalogueIdLookup, true);
      catalogue = {
        items: item ? [item] : [],
        total: item ? 1 : 0,
        page: 1,
        pageSize: 100,
      };
    } else {
      catalogue = await getEconomyCatalogue({
        includeDisabled: true,
        query: marketplaceQuery || undefined,
        pageSize: 100,
      });
    }
  } else if (activeTab === "crates") {
    [customCrates, customCrate, crateRewardCatalogue] = await Promise.all([
      getStaffCustomCrates(),
      selectedCrateId
        ? getStaffCustomCrateManagement(selectedCrateId)
        : Promise.resolve(null),
      getEconomyCatalogue({
        query: crateRewardQuery || undefined,
        itemTypes: crateRewardType ? [crateRewardType] : undefined,
        pageSize: 50,
      }),
    ]);
  } else {
    const catalogueIdLookup = validCatalogueId(discountQuery);
    const discountCataloguePromise = catalogueIdLookup
      ? getEconomyCatalogueItem(catalogueIdLookup, true).then((item) => ({
          items: item ? [item] : [],
          total: item ? 1 : 0,
          page: 1,
          pageSize: 100,
        }))
      : getEconomyCatalogue({
          includeDisabled: true,
          query: discountQuery || undefined,
          pageSize: 100,
        });
    [discountRules, discountCatalogue] = await Promise.all([
      getEconomyDiscountRules(),
      discountCataloguePromise,
    ]);
  }

  const normalizedCrateQuery = crateQuery.toLocaleLowerCase();
  const visibleCustomCrates = normalizedCrateQuery
    ? customCrates.filter(
        (crate) =>
          crate.displayName.toLocaleLowerCase().includes(normalizedCrateQuery) ||
          String(crate.id) === normalizedCrateQuery,
      )
    : customCrates;
  const activeCrateRewardWeight = customCrate
    ? customCrate.entries.reduce(
        (total, entry) =>
          total + (entry.enabled && entry.catalogue.enabled ? entry.weight : 0),
        0,
      )
    : 0;
  const activeCrateRewardCount = customCrate?.entries.filter(
    (entry) => entry.enabled && entry.catalogue.enabled,
  ).length ?? 0;
  const customCrateMarketListed = customCrate
    ? isMarketEnabled(customCrate.crate.metadata)
    : false;
  const activeCrateRewardIds = new Set(
    customCrate?.entries
      .filter((entry) => entry.enabled && entry.catalogue.enabled)
      .map((entry) => entry.catalogue.id) ?? [],
  );
  const csrf = createAdminActionToken(session);
  const notice = noticeText(params.notice);
  const error = errorText(params.error);
  const tabContext = {
    marketplaceQuery,
    crateQuery,
    discountQuery,
    crateId: selectedCrateId,
    crateRewardQuery,
    crateRewardType,
  };
  const marketplaceTabHref = itemsHref("marketplace", tabContext);
  const cratesTabHref = itemsHref("crates", tabContext);
  const discountTabHref = itemsHref("discount", tabContext);
  const marketplaceClearHref = itemsHref("marketplace", {
    ...tabContext,
    marketplaceQuery: undefined,
  });
  const cratesClearHref = itemsHref("crates", {
    ...tabContext,
    crateQuery: undefined,
  });

  return (
    <PortalShell authenticated className="staff-page economy-admin-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">
              <ShieldCheck aria-hidden="true" /> Staff economy
            </p>
            <h1>Item management</h1>
            <p>
              Maintain Marketplace products and custom crate pools in separate,
              focused workspaces.
            </p>
          </div>
          <Link className="button button-secondary" href="/admin">
            Back to staff panel
          </Link>
        </section>
        <StaffSubmenu access={access} active="items" />
        {notice ? <PortalToast message={notice} /> : null}
        {error ? <PortalToast variant="danger" message={error} /> : null}
        <nav className={styles.itemTabs} aria-label="Item management sections">
          <Link
            className={activeTab === "marketplace" ? styles.activeTab : undefined}
            href={marketplaceTabHref}
            aria-current={activeTab === "marketplace" ? "page" : undefined}
            scroll={false}
          >
            <ShoppingBag aria-hidden="true" />
            <span>
              <strong>Marketplace</strong>
              <small>Catalogue, pricing, artwork, and availability</small>
            </span>
          </Link>
          <Link
            className={activeTab === "crates" ? styles.activeTab : undefined}
            href={cratesTabHref}
            aria-current={activeTab === "crates" ? "page" : undefined}
            scroll={false}
          >
            <Archive aria-hidden="true" />
            <span>
              <strong>Crates</strong>
              <small>Containers, rewards, odds, and release status</small>
            </span>
          </Link>
          <Link
            className={activeTab === "discount" ? styles.activeTab : undefined}
            href={discountTabHref}
            aria-current={activeTab === "discount" ? "page" : undefined}
            scroll={false}
          >
            <BadgePercent aria-hidden="true" />
            <span>
              <strong>Discount</strong>
              <small>Item and category promotion rules</small>
            </span>
          </Link>
        </nav>

        {activeTab === "marketplace" ? (
          <section className={`${styles.lookupPanel} panel`} aria-labelledby="marketplace-lookup-title">
            <div className={styles.lookupHeading}>
              <PackageSearch aria-hidden="true" />
              <div>
                <p className="eyebrow">Marketplace lookup</p>
                <h2 id="marketplace-lookup-title">Find a catalogue product</h2>
              </div>
            </div>
            <SearchNavigationForm action="/admin/items" role="search">
              <input type="hidden" name="tab" value="marketplace" />
              {crateQuery ? <input type="hidden" name="crateQ" value={crateQuery} /> : null}
              {discountQuery ? <input type="hidden" name="discountQ" value={discountQuery} /> : null}
              {selectedCrateId ? <input type="hidden" name="crate" value={selectedCrateId} /> : null}
              {crateRewardQuery ? <input type="hidden" name="crateReward" value={crateRewardQuery} /> : null}
              {crateRewardType ? <input type="hidden" name="crateRewardType" value={crateRewardType} /> : null}
              <ServerSearchField
                id="staff-marketplace-lookup"
                rootClassName={styles.lookupControl}
                name="marketplaceQ"
                label="Product name, market name, type, or catalogue ID"
                defaultValue={marketplaceQuery}
                maxLength={120}
                placeholder="Skins, VIP products, crates…"
                autoComplete="off"
              />
              <SearchSubmitButton>
                Search Marketplace
              </SearchSubmitButton>
              {marketplaceQuery ? (
                <Link className="button button-secondary" href={marketplaceClearHref} scroll={false}>
                  Clear
                </Link>
              ) : null}
            </SearchNavigationForm>
            <p className={styles.lookupSummary} aria-live="polite">
              {marketplaceQuery
                ? `${catalogue.total} product${catalogue.total === 1 ? "" : "s"} match "${marketplaceQuery}".`
                : `Showing the first ${catalogue.items.length} of ${catalogue.total} catalogue products.`}
            </p>
          </section>
        ) : activeTab === "crates" ? (
          <section className={`${styles.lookupPanel} panel`} aria-labelledby="crate-lookup-title">
            <div className={styles.lookupHeading}>
              <PackageSearch aria-hidden="true" />
              <div>
                <p className="eyebrow">Crate lookup</p>
                <h2 id="crate-lookup-title">Find a managed container</h2>
              </div>
            </div>
            <SearchNavigationForm action="/admin/items" role="search">
              <input type="hidden" name="tab" value="crates" />
              {marketplaceQuery ? <input type="hidden" name="marketplaceQ" value={marketplaceQuery} /> : null}
              {discountQuery ? <input type="hidden" name="discountQ" value={discountQuery} /> : null}
              {selectedCrateId ? <input type="hidden" name="crate" value={selectedCrateId} /> : null}
              {crateRewardQuery ? <input type="hidden" name="crateReward" value={crateRewardQuery} /> : null}
              {crateRewardType ? <input type="hidden" name="crateRewardType" value={crateRewardType} /> : null}
              <ServerSearchField
                id="staff-crate-lookup"
                rootClassName={styles.lookupControl}
                name="crateQ"
                label="Crate name or catalogue ID"
                defaultValue={crateQuery}
                maxLength={120}
                placeholder="Managed crate name or ID…"
                autoComplete="off"
              />
              <SearchSubmitButton>
                Search crates
              </SearchSubmitButton>
              {crateQuery ? (
                <Link className="button button-secondary" href={cratesClearHref} scroll={false}>
                  Clear
                </Link>
              ) : null}
            </SearchNavigationForm>
            <p className={styles.lookupSummary} aria-live="polite">
              {crateQuery
                ? `${visibleCustomCrates.length} of ${customCrates.length} managed crate${customCrates.length === 1 ? "" : "s"} match "${crateQuery}".`
                : `${customCrates.length} managed crate${customCrates.length === 1 ? "" : "s"} available.`}
            </p>
          </section>
        ) : null}

        {activeTab === "crates" && access.canManageEconomy ? (
          <section className="economy-crate-section">
            <div className="section-heading compact">
              <p className="eyebrow">
                <Archive aria-hidden="true" /> Custom crate studio
              </p>
              <h2>Build a crate from any catalogue item.</h2>
              <p>
                Create the container, set its direct Token price and artwork,
                then add skins, knives, gloves, stickers, agents, charms, or
                Special/VIP items to its verified drop pool.
              </p>
            </div>
            <div className="economy-crate-studio-grid">
              <form
                className="panel form-panel economy-crate-create"
                action="/api/admin/economy"
                method="post"
                encType="multipart/form-data"
              >
                <p className="eyebrow">New container</p>
                <h3>Create a draft crate</h3>
                <p className="empty-copy">
                  Draft crates stay out of Marketplace until you deliberately
                  list them after adding rewards.
                </p>
                <ActionFields csrf={csrf} action="custom-crate-create" />
                <div className="form-grid">
                  <label>
                    Crate name
                    <input
                      name="crateDisplayName"
                      required
                      maxLength={160}
                      placeholder="TAPPD Friday Case"
                    />
                  </label>
                  <label>
                    Crate rarity
                    <select name="crateRarityRank" defaultValue="0">
                      {ECONOMY_RARITIES.map((rarity) => (
                        <option key={rarity.rank} value={rarity.rank}>
                          {rarity.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Direct price (Tokens)
                    <input
                      name="crateDirectPriceTokens"
                      required
                      inputMode="numeric"
                      min="0"
                      defaultValue="1000"
                    />
                  </label>
                  <label>
                    Artwork URL
                    <input
                      name="crateArtworkUrl"
                      maxLength={512}
                      placeholder="/images/economy/my-case.png"
                    />
                  </label>
                </div>
                <label>
                  Or upload PNG, JPEG, or WebP
                  <input
                    name="crateArtworkFile"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                  />
                </label>
                <button className="button button-primary" type="submit">
                  <PackagePlus aria-hidden="true" /> Create crate draft
                </button>
              </form>
              <aside className="panel economy-crate-picker">
                <p className="eyebrow">Managed containers</p>
                <h3>Crate library</h3>
                <p className="empty-copy">
                  The TAPPD Weapon Case and every staff-created crate are
                  editable here. Official Valve cases stay protected.
                </p>
                {visibleCustomCrates.length ? (
                  <div className="economy-crate-picker-list">
                    {visibleCustomCrates.map((crate) => (
                      <Link
                        className={`economy-crate-picker-item ${customCrate?.crate.id === crate.id ? "is-selected" : ""}`}
                        key={crate.id}
                        href={itemsHref("crates", {
                          ...tabContext,
                          crateId: crate.id,
                        })}
                        scroll={false}
                      >
                        <MarketplaceItemPreview
                          item={{
                            catalogueId: crate.id,
                            displayName: crate.displayName,
                            floatValue: null,
                            imageUrl: crate.imageUrl,
                            itemType: crate.itemType,
                            rarityRank: crate.rarityRank,
                          }}
                          enableMarketPreview={false}
                        />
                        <div>
                          <span className="badge">
                            {crate.tappdDefault ? "TAPPD" : "Custom"}
                          </span>
                          <strong>{crate.displayName}</strong>
                          <small>
                            {formatPrice(crate.directPurchasePriceTokens)} ·{" "}
                            {crate.entryCount} active rewards
                          </small>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">
                    {crateQuery
                      ? "No managed crates match this lookup."
                      : "No managed crates yet. Create the first one above."}
                  </p>
                )}
              </aside>
            </div>
            {customCrate ? (
              <div className="economy-crate-workbench">
                <header className="economy-crate-workbench-header">
                  <div>
                    <p className="eyebrow">
                      <SlidersHorizontal aria-hidden="true" /> Editing crate
                    </p>
                    <h3>{customCrate.crate.displayName}</h3>
                    <p>
                      {customCrate.crate.tappdDefault
                        ? "TAPPD default container"
                        : "Staff-created container"}{" "}
                      · {activeCrateRewardCount} active rewards
                    </p>
                  </div>
                  <span className="tag">
                    {customCrateMarketListed
                      ? "Marketplace listed"
                      : "Marketplace draft"}
                  </span>
                </header>
                <div className="economy-crate-editor-grid">
                  <form
                    className="panel form-panel economy-crate-product-form"
                    action="/api/admin/economy"
                    method="post"
                    encType="multipart/form-data"
                  >
                    <p className="eyebrow">Container product</p>
                    <h4>Name, artwork, rarity, and price</h4>
                    <ActionFields csrf={csrf} action="custom-crate-update" />
                    <input type="hidden" name="crateId" value={customCrate.crate.id} />
                    <div className="form-grid">
                      <label>
                        Crate name
                        <input
                          name="crateDisplayName"
                          required
                          maxLength={160}
                          defaultValue={customCrate.crate.displayName}
                        />
                      </label>
                      <label>
                        Crate rarity
                        <select
                          name="crateRarityRank"
                          defaultValue={String(customCrate.crate.rarityRank)}
                        >
                          {ECONOMY_RARITIES.map((rarity) => (
                            <option key={rarity.rank} value={rarity.rank}>
                              {rarity.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Direct price (Tokens)
                        <input
                          name="crateDirectPriceTokens"
                          required
                          inputMode="numeric"
                          min="0"
                          defaultValue={customCrate.crate.basePriceTokens ?? 0}
                        />
                      </label>
                      <label>
                        Artwork URL
                        <input
                          name="crateArtworkUrl"
                          maxLength={512}
                          defaultValue={catalogueArtworkUrl(customCrate.crate.metadata)}
                        />
                      </label>
                    </div>
                    <label>
                      Replace artwork with PNG, JPEG, or WebP
                      <input
                        name="crateArtworkFile"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                      />
                    </label>
                    <button className="staff-unban-button" type="submit">
                      Save crate product
                    </button>
                  </form>
                  <form
                    className="panel economy-crate-market-form"
                    action="/api/admin/economy"
                    method="post"
                  >
                    <p className="eyebrow">Release control</p>
                    <h4>Marketplace availability</h4>
                    <p className="empty-copy">
                      A crate needs at least one active reward before it can be
                      released for purchase.
                    </p>
                    <ActionFields csrf={csrf} action="market-status-set" />
                    <input
                      type="hidden"
                      name="catalogueId"
                      value={customCrate.crate.id}
                    />
                    <input
                      type="hidden"
                      name="crateId"
                      value={customCrate.crate.id}
                    />
                    <label className="economy-check">
                      <input
                        name="marketEnabled"
                        type="checkbox"
                        value="true"
                        defaultChecked={customCrateMarketListed}
                        disabled={
                          activeCrateRewardIds.size === 0 &&
                          !customCrateMarketListed
                        }
                      />
                      List this crate in Marketplace
                    </label>
                    <button
                      className="staff-unban-button"
                      type="submit"
                      disabled={
                        activeCrateRewardIds.size === 0 &&
                        !customCrateMarketListed
                      }
                    >
                      Save release status
                    </button>
                  </form>
                </div>
                <div className="economy-crate-rewards-panel panel">
                  <div className="economy-crate-rewards-heading">
                    <div>
                      <p className="eyebrow"><Gift aria-hidden="true" /> Verified reward pool</p>
                      <h4>Build the drop pool from every item type</h4>
                      <p className="empty-copy">
                        Search the full enabled catalogue by name or category.
                        Skins, knives, gloves, stickers, agents, charms,
                        capsules, and Special/VIP memberships all work as
                        rewards.
                      </p>
                    </div>
                    <span className="tag">
                      {activeCrateRewardCount} active
                    </span>
                  </div>
                  <div className="economy-crate-reward-summary">
                    <span>{formatTokens(activeCrateRewardWeight)} total active weight</span>
                    <span>Odds are calculated from active reward weight.</span>
                  </div>
                  <datalist id="custom-crate-reward-options">
                    {crateRewardCatalogue.items
                      .filter((item) => item.id !== customCrate.crate.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.displayName} · {economyItemTypeLabel(item.itemType)}
                        </option>
                      ))}
                  </datalist>
                  <SearchNavigationForm
                    className="economy-crate-reward-search"
                    action="/admin/items"
                  >
                    <input type="hidden" name="crate" value={customCrate.crate.id} />
                    <input type="hidden" name="tab" value="crates" />
                    {marketplaceQuery ? (
                      <input type="hidden" name="marketplaceQ" value={marketplaceQuery} />
                    ) : null}
                    {crateQuery ? (
                      <input type="hidden" name="crateQ" value={crateQuery} />
                    ) : null}
                    {discountQuery ? (
                      <input type="hidden" name="discountQ" value={discountQuery} />
                    ) : null}
                    <ServerSearchField
                      id="staff-crate-reward-lookup"
                      name="crateReward"
                      label="Search catalogue rewards"
                      defaultValue={crateRewardQuery}
                      maxLength={120}
                      placeholder="Skin, sticker, agent, knife, VIP…"
                      autoComplete="off"
                    />
                    <label>
                      Category
                      <select
                        name="crateRewardType"
                        defaultValue={crateRewardType ?? ""}
                      >
                        <option value="">All item types</option>
                        {itemTypes.map((itemType) => (
                          <option key={itemType} value={itemType}>
                            {economyItemTypeLabel(itemType)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <SearchSubmitButton variant="secondary">
                      Find items
                    </SearchSubmitButton>
                  </SearchNavigationForm>
                  <p className="economy-crate-reward-results" aria-live="polite">
                    {crateRewardQuery || crateRewardType
                      ? `${crateRewardCatalogue.total} matching enabled catalogue item${crateRewardCatalogue.total === 1 ? "" : "s"}`
                      : `Browse the first ${crateRewardCatalogue.items.length} enabled catalogue items, or narrow the search.`}
                  </p>
                  <form
                    className="economy-crate-add-reward"
                    action="/api/admin/economy"
                    method="post"
                  >
                    <ActionFields csrf={csrf} action="custom-crate-loot-add" />
                    <input type="hidden" name="crateId" value={customCrate.crate.id} />
                    <label>
                      Catalogue reward ID
                      <input
                        name="rewardCatalogueId"
                        required
                        list="custom-crate-reward-options"
                        inputMode="numeric"
                        placeholder="Known catalogue ID"
                      />
                    </label>
                    <label>
                      Drop weight
                      <input
                        name="rewardWeight"
                        required
                        inputMode="numeric"
                        min="1"
                        defaultValue="1000"
                      />
                    </label>
                    <button className="button button-primary" type="submit">
                      <Gift aria-hidden="true" /> Add reward
                    </button>
                  </form>
                  {crateRewardCatalogue.items.length ? (
                    <div className="economy-crate-candidate-list">
                      {crateRewardCatalogue.items
                        .filter((item) => item.id !== customCrate.crate.id)
                        .map((item) => {
                          const alreadyActive = activeCrateRewardIds.has(item.id);
                          const existingEntry = customCrate.entries.find(
                            (entry) => entry.catalogue.id === item.id,
                          );
                          return (
                            <article className="economy-crate-candidate" key={item.id}>
                              <MarketplaceItemPreview
                                item={{
                                  catalogueId: item.id,
                                  displayName: item.displayName,
                                  floatValue: null,
                                  imageUrl: item.imageUrl,
                                  itemType: item.itemType,
                                  rarityRank: item.rarityRank,
                                }}
                                enableMarketPreview={false}
                              />
                              <div className="economy-crate-candidate-copy">
                                <span className={`badge rarity-rank-${item.rarityRank}`}>
                                  {item.rarityName}
                                </span>
                                <strong>{item.displayName}</strong>
                                <small>
                                  {economyItemTypeLabel(item.itemType)} · ID {item.id}
                                  {existingEntry && !alreadyActive
                                    ? " · previously removed"
                                    : ""}
                                </small>
                              </div>
                              <form action="/api/admin/economy" method="post">
                                <ActionFields csrf={csrf} action="custom-crate-loot-add" />
                                <input type="hidden" name="crateId" value={customCrate.crate.id} />
                                <input type="hidden" name="rewardCatalogueId" value={item.id} />
                                <label>
                                  Weight
                                  <input
                                    name="rewardWeight"
                                    required
                                    inputMode="numeric"
                                    min="1"
                                    defaultValue={existingEntry?.weight ?? 1000}
                                  />
                                </label>
                                <button
                                  className="button button-secondary"
                                  type="submit"
                                  disabled={alreadyActive}
                                >
                                  <Gift aria-hidden="true" />
                                  {alreadyActive
                                    ? "In pool"
                                    : existingEntry
                                      ? "Restore"
                                      : "Add"}
                                </button>
                              </form>
                            </article>
                          );
                        })}
                    </div>
                  ) : (
                    <p className="empty-copy economy-crate-empty-candidates">
                      No enabled catalogue items match this reward search.
                    </p>
                  )}
                  {customCrate.entries.length ? (
                    <div className="economy-crate-reward-list">
                      {customCrate.entries.map((entry) => {
                        const rewardIsActive =
                          entry.enabled && entry.catalogue.enabled;
                        return (
                          <article
                            className={`economy-crate-reward-row ${rewardIsActive ? "" : "is-removed"}`}
                            key={entry.id}
                          >
                            <MarketplaceItemPreview
                              item={{
                                catalogueId: entry.catalogue.id,
                                displayName: entry.catalogue.displayName,
                                floatValue: null,
                                imageUrl: entry.catalogue.imageUrl,
                                itemType: entry.catalogue.itemType,
                                rarityRank: entry.catalogue.rarityRank,
                              }}
                              enableMarketPreview={false}
                            />
                            <div>
                              <span className={`badge rarity-rank-${entry.catalogue.rarityRank}`}>
                                {entry.catalogue.rarityName}
                              </span>
                              <strong>{entry.catalogue.displayName}</strong>
                              <small>
                                {economyItemTypeLabel(entry.catalogue.itemType)} · weight {formatTokens(entry.weight)}
                                {rewardIsActive
                                  ? ` · ${formatDropChance(entry.weight, activeCrateRewardWeight)}`
                                  : entry.catalogue.enabled
                                    ? " · removed from future openings"
                                    : " · catalogue item disabled"}
                              </small>
                            </div>
                            {entry.enabled ? (
                              <form action="/api/admin/economy" method="post">
                                <ActionFields csrf={csrf} action="custom-crate-loot-remove" />
                                <input type="hidden" name="crateId" value={customCrate.crate.id} />
                                <input type="hidden" name="lootEntryId" value={entry.id} />
                                <button className="staff-danger-button" type="submit">
                                  Remove reward
                                </button>
                              </form>
                            ) : entry.catalogue.enabled ? (
                              <form action="/api/admin/economy" method="post">
                                <ActionFields csrf={csrf} action="custom-crate-loot-add" />
                                <input type="hidden" name="crateId" value={customCrate.crate.id} />
                                <input type="hidden" name="rewardCatalogueId" value={entry.catalogue.id} />
                                <input type="hidden" name="rewardWeight" value={entry.weight} />
                                <button className="staff-unban-button" type="submit">
                                  Restore reward
                                </button>
                              </form>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="empty-copy economy-crate-empty-rewards">
                      This crate has no rewards yet. It cannot be listed or opened
                      until you add at least one catalogue item.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
        {activeTab === "crates" && !access.canManageEconomy ? (
          <section className={`${styles.emptyResults} panel`}>
            <LockKeyhole aria-hidden="true" />
            <h2>Crate management permission required</h2>
            <p>
              Your staff role can view the economy, but cannot create or edit
              crate products and reward pools.
            </p>
          </section>
        ) : null}
        {activeTab === "discount" ? (
          <DiscountRuleAdmin
            rules={discountRules}
            catalogue={discountCatalogue.items}
            csrf={csrf}
            returnTab="discount"
            canManage={access.canManageEconomy}
            initialQuery={discountQuery}
            initialTotal={discountCatalogue.total}
          />
        ) : null}
        {activeTab === "marketplace" ? (
          <section
            className={styles.marketplaceSection}
            aria-labelledby="marketplace-products-title"
          >
            <div className={styles.sectionHeading}>
              <p className="eyebrow">
                <Coins aria-hidden="true" /> Price snapshots
              </p>
              <h2 id="marketplace-products-title">Marketplace products</h2>
              <p>
                {catalogue.total} matching entries. Review product identity,
                artwork, price snapshots, and listing status.
              </p>
            </div>
            {catalogue.items.length ? (
              <div className={styles.marketplaceGrid}>
                {catalogue.items.map((item) => {
                  const vipMembership = isVipMembership(item.itemType);
                  const customProduct = isCustomProductItemType(item.itemType);
                  const specialRarity =
                    item.rarityRank === ECONOMY_SPECIAL_RARITY_RANK;
                  const disabledByType = permanentlyMarketDisabledItemTypes.has(
                    item.itemType,
                  );
                  const listed =
                    item.enabled &&
                    !disabledByType &&
                    isMarketEnabled(item.metadata);
                  const tier =
                    typeof item.metadata.vipTier === "string"
                      ? item.metadata.vipTier
                      : null;
                  const duration =
                    typeof item.metadata.vipDurationMinutes === "number"
                      ? item.metadata.vipDurationMinutes
                      : null;

                  return (
                    <article
                      className={`${styles.marketplaceCard} panel ${specialRarity ? styles.specialCard : ""}`}
                      key={item.id}
                    >
                    <div className={styles.marketplaceArtwork}>
                      <MarketplaceItemPreview
                        item={{
                          catalogueId: item.id,
                          displayName: item.displayName,
                          floatValue: null,
                          imageUrl: item.imageUrl,
                          itemType: item.itemType,
                          rarityRank: item.rarityRank,
                        }}
                        enableMarketPreview={false}
                      />
                    </div>
                    <div className={styles.cardCopy}>
                      <span className={`badge rarity-rank-${item.rarityRank}`}>
                        {item.rarityName}
                      </span>
                      <span className="badge">
                        {economyItemTypeLabel(item.itemType)}
                      </span>
                      <span
                        className={`${styles.statusBadge} ${listed ? styles.listed : styles.unlisted}`}
                      >
                        {listed
                          ? "Marketplace listed"
                          : disabledByType
                            ? "Not purchasable"
                            : item.enabled
                              ? "Marketplace hidden"
                              : "Catalogue disabled"}
                      </span>
                      <h3>{item.displayName}</h3>
                      <p className="empty-copy">
                        Catalogue #{item.id}
                        {item.marketHashName
                          ? ` · ${item.marketHashName}`
                          : " · No public market name"}
                      </p>
                      {vipMembership ? (
                        <small>
                          {tier ?? "VIP"}
                          {duration ? ` · ${duration.toLocaleString()} minutes` : ""}
                          {" · activates through Inventory"}
                        </small>
                      ) : null}
                      <small>
                        {item.price
                          ? `Last recorded ${formatDate(item.price.observedAt)} from ${item.price.source}`
                          : "No price snapshot"}
                      </small>
                      <dl className={styles.productStats}>
                        <div>
                          <dt>Direct price</dt>
                          <dd>
                            {formatPrice(item.directPurchasePriceTokens)}
                            {item.appliedDiscount && item.basePriceTokens !== null ? (
                              <small>
                                Base {formatTokens(item.basePriceTokens)} Tokens · {item.appliedDiscount.displayName}
                              </small>
                            ) : null}
                          </dd>
                        </div>
                        <div>
                          <dt>Price source</dt>
                          <dd>{item.price?.source || "Not recorded"}</dd>
                        </div>
                      </dl>
                    </div>
                    {access.canManageEconomy ? (
                    <div className={`${styles.actionGrid} economy-admin-actions`}>
                      {!customProduct ? (
                        <form action="/api/admin/economy" method="post">
                        <ActionFields csrf={csrf} action="market-name-set" />
                        <input
                          type="hidden"
                          name="catalogueId"
                          value={item.id}
                        />
                        <label>
                          Exact public market name
                          <input
                            name="marketHashName"
                            required
                            maxLength={255}
                            defaultValue={item.marketHashName ?? ""}
                            placeholder="AK-47 | Example (Field-Tested)"
                          />
                        </label>
                        <button className="staff-unban-button" type="submit">
                          Save market name
                        </button>
                        </form>
                      ) : null}
                      <form
                        action="/api/admin/economy"
                        method="post"
                        encType="multipart/form-data"
                      >
                        <ActionFields csrf={csrf} action="catalogue-artwork-set" />
                        <input
                          type="hidden"
                          name="catalogueId"
                          value={item.id}
                        />
                        <label>
                          Catalogue artwork
                          <input
                            name="artworkUrl"
                            maxLength={512}
                            defaultValue={catalogueArtworkUrl(item.metadata)}
                            placeholder="/images/economy/my-case.png or https://..."
                          />
                        </label>
                        <label>
                          Or upload PNG, JPEG, or WebP
                          <input
                            name="artworkFile"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                          />
                        </label>
                        <small>
                          Uploading replaces the URL above. Files are stored in
                          the portal artwork folder and are limited to 5 MB.
                        </small>
                        <button className="staff-unban-button" type="submit">
                          Save artwork
                        </button>
                      </form>
                      {!customProduct ? (
                        <form action="/api/admin/economy" method="post">
                        <ActionFields csrf={csrf} action="price-refresh" />
                        <input
                          type="hidden"
                          name="catalogueId"
                          value={item.id}
                        />
                        <button
                          className="staff-unban-button"
                          type="submit"
                          disabled={!item.marketHashName}
                        >
                          Refresh public price
                        </button>
                        </form>
                      ) : null}
                      <form action="/api/admin/economy" method="post">
                        <ActionFields csrf={csrf} action="price-set" />
                        <input
                          type="hidden"
                          name="catalogueId"
                          value={item.id}
                        />
                        <label>
                          {customProduct ? "Direct price (Tokens)" : "Last-known price (Tokens)"}
                          <input
                            name="eurCents"
                            required
                            inputMode="numeric"
                            min="0"
                            defaultValue={item.price?.tokenPrice ?? ""}
                          />
                        </label>
                        <button className="staff-unban-button" type="submit">
                          {customProduct ? "Save direct price" : "Save Token price"}
                        </button>
                      </form>
                      {disabledByType ? (
                        <small className="economy-market-disabled-copy">
                          This item type is disabled from Marketplace purchases.
                        </small>
                      ) : (
                        <form action="/api/admin/economy" method="post">
                          <ActionFields csrf={csrf} action="market-status-set" />
                          <input
                            type="hidden"
                            name="catalogueId"
                            value={item.id}
                          />
                          <label className="economy-check">
                            <input
                              name="marketEnabled"
                              type="checkbox"
                              value="true"
                              defaultChecked={listed}
                            />
                            List in Marketplace
                          </label>
                          <button className="staff-unban-button" type="submit">
                            Save availability
                          </button>
                        </form>
                      )}
                    </div>
                    ) : (
                      <p className={styles.readOnlyNotice}>
                        Your staff role has read-only economy access.
                      </p>
                    )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="empty-copy">
                No catalogue entries match this filter. Run the server catalogue
                import before pricing or granting retained skins.
              </p>
            )}
          </section>
        ) : null}
    </PortalShell>
  );
}
