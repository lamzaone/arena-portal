import { ShoppingBag } from "lucide-react";

import {
  MarketDiscountAnnouncement,
  type MarketDiscountAnnouncementItem,
} from "@/components/economy/market-discount-announcement";
import { MarketplaceBrowser } from "@/components/economy/marketplace-browser";
import { SignInRequired } from "@/components/sign-in-required";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import {
  getActiveEconomyDiscountRules,
  getEconomyCatalogueItem,
  getMarketplaceCatalogue,
  getTokenWallet,
  isEconomyMarketplacePurchasable,
} from "@/lib/data/portal-repository";
import {
  marketplaceCategoryItemTypes,
  normalizeMarketplaceCategory,
} from "@/lib/economy/market-categories";
import { ECONOMY_MAX_RARITY_RANK } from "@/lib/economy/item-taxonomy";
import { normalizeItemGridPageSize } from "@/lib/economy/item-grid-layout";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata = buildPageMetadata("/market");

const marketDiscountCategoryLabels: Record<string, string> = {
  skin: "All weapon skins",
  weapon: "All weapons",
  knife: "All knives",
  glove: "All gloves",
  crate: "All crates and cases",
  capsule: "All capsules",
  sticker: "All stickers",
  agent: "All agents",
  keychain: "All keychains",
  vip_membership: "All group memberships",
  profile_theme: "All profile themes",
};

type MarketPageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    rarity?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function positivePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, 10_000)
    : 1;
}

export default async function MarketPage({ searchParams }: MarketPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session)
    return (
      <SignInRequired
        title="Token marketplace"
        description="Sign in with Steam to use Tokens to buy specific cosmetics directly from the marketplace."
      />
    );

  const query = (params.q ?? "").trim().slice(0, 120);
  const itemType = normalizeMarketplaceCategory(params.type);
  const itemTypes = marketplaceCategoryItemTypes(itemType);
  // `Number("")` is 0, which made the native "All rarities" form value
  // accidentally turn into the rank-0 filter. Preserve a deliberate `0`, but
  // treat an omitted or empty value as no rarity filter.
  const rarityText = (params.rarity ?? "").trim();
  const rarityValue = rarityText ? Number(rarityText) : Number.NaN;
  const rarity =
    Number.isSafeInteger(rarityValue) &&
    rarityValue >= 0 &&
    rarityValue <= ECONOMY_MAX_RARITY_RANK
      ? rarityValue
      : null;
  const [wallet, catalogue, activeDiscountRules] = await Promise.all([
    getTokenWallet(session.steamId),
    getMarketplaceCatalogue({
      query: query || undefined,
      itemTypes: itemTypes ? [...itemTypes] : undefined,
      rarityRanks: rarity === null ? undefined : [rarity],
      page: positivePage(params.page),
      pageSize: normalizeItemGridPageSize(params.pageSize),
    }),
    getActiveEconomyDiscountRules(),
  ]);
  const catalogueDiscountIds = [
    ...new Set(
      activeDiscountRules.flatMap((rule) =>
        rule.targetType === "catalogue_item" && rule.catalogueId !== null
          ? [rule.catalogueId]
          : [],
      ),
    ),
  ];
  const discountCatalogueItems = await Promise.all(
    catalogueDiscountIds.map((catalogueId) =>
      getEconomyCatalogueItem(catalogueId),
    ),
  );
  const discountCatalogueById = new Map(
    discountCatalogueItems.flatMap((item) =>
      item ? [[item.id, item] as const] : [],
    ),
  );
  const discountAnnouncements = activeDiscountRules.flatMap((rule) => {
    let targetLabel: string;
    if (rule.targetType === "catalogue_item") {
      const item = rule.catalogueId
        ? discountCatalogueById.get(rule.catalogueId)
        : null;
      if (!item || !isEconomyMarketplacePurchasable(item)) return [];
      targetLabel = item.displayName;
    } else {
      if (!rule.itemType || !marketDiscountCategoryLabels[rule.itemType])
        return [];
      targetLabel = marketDiscountCategoryLabels[rule.itemType];
    }
    return [
      {
        id: rule.id,
        displayName: rule.displayName,
        targetLabel,
        percentageBps: rule.percentageBps,
        fixedTokens: rule.fixedTokens,
        endsAt: rule.endsAt,
        exclusionCount: rule.excludedCatalogueIds.length,
      } satisfies MarketDiscountAnnouncementItem,
    ];
  });

  return (
    <PortalShell authenticated className="tapped-page">
        <PageHeading
          eyebrow={<><ShoppingBag aria-hidden="true" /> Player economy</>}
          title="Marketplace"
          description="Buy a specific cosmetic, case, or group membership item directly with Tokens."
        />
        <MarketDiscountAnnouncement discounts={discountAnnouncements} />
        <MarketplaceBrowser
          catalogue={catalogue}
          wallet={wallet}
          csrf={createEconomyActionToken(session)}
          filters={{
            query,
            itemType,
            rarity: rarity === null ? "" : String(rarity),
          }}
          pagination={{
            page: catalogue.page,
            pageSize: catalogue.pageSize,
            total: catalogue.total,
          }}
        />
    </PortalShell>
  );
}
