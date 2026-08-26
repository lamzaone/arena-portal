import { ShoppingBag } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { MarketplaceBrowser } from "@/components/economy/marketplace-browser";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import {
  getMarketplaceCatalogue,
  getTokenWallet,
} from "@/lib/data/portal-repository";
import {
  marketplaceCategoryItemTypes,
  normalizeMarketplaceCategory,
} from "@/lib/economy/market-categories";

const MARKET_PAGE_SIZE = 50;

type MarketPageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    rarity?: string;
    minFloat?: string;
    maxFloat?: string;
    page?: string;
  }>;
};

function positivePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, 10_000)
    : 1;
}

function marketFloat(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return Number((Math.round(parsed * 1_000_000) / 1_000_000).toFixed(6));
}

function marketFloatText(value: number | null) {
  return value === null ? "" : value.toFixed(6).replace(/\.?0+$/, "");
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
    Number.isSafeInteger(rarityValue) && rarityValue >= 0 && rarityValue <= 7
      ? rarityValue
      : null;
  const requestedMinFloat = marketFloat(params.minFloat);
  const requestedMaxFloat = marketFloat(params.maxFloat);
  const floatRangeIsValid =
    requestedMinFloat === null ||
    requestedMaxFloat === null ||
    requestedMinFloat <= requestedMaxFloat;
  const minFloat = floatRangeIsValid ? requestedMinFloat : null;
  const maxFloat = floatRangeIsValid ? requestedMaxFloat : null;
  const [wallet, catalogue] = await Promise.all([
    getTokenWallet(session.steamId),
    getMarketplaceCatalogue({
      query: query || undefined,
      itemTypes: itemTypes ? [...itemTypes] : undefined,
      rarityRanks: rarity === null ? undefined : [rarity],
      minFloat: minFloat ?? undefined,
      maxFloat: maxFloat ?? undefined,
      page: positivePage(params.page),
      pageSize: MARKET_PAGE_SIZE,
    }),
  ]);

  return (
    <main>
      <div className="shell">
        <SiteHeader authenticated />
        <AccountNav current="/market" />
        <section className="page-heading">
          <div>
            <p className="eyebrow">
              <ShoppingBag aria-hidden="true" /> Player economy
            </p>
            <h1>Marketplace</h1>
            <p>
              Search the full catalogue and buy a specific skin, sticker, agent,
              music kit, or other listed cosmetic directly.
            </p>
          </div>
        </section>
        <MarketplaceBrowser
          catalogue={catalogue}
          wallet={wallet}
          csrf={createEconomyActionToken(session)}
          filters={{
            query,
            itemType,
            rarity: rarity === null ? "" : String(rarity),
            minFloat: marketFloatText(minFloat),
            maxFloat: marketFloatText(maxFloat),
          }}
          pagination={{
            page: catalogue.page,
            pageSize: catalogue.pageSize,
            total: catalogue.total,
          }}
        />
      </div>
    </main>
  );
}
