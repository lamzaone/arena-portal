import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const state = { catalogue: [] as unknown[], variants: [] as Array<{ wear: string; stattrak: boolean; euroCents: number }> };
Object.assign(globalThis, { __priceRefreshWearTest: state });
const stubs: Record<string, string> = {
  "server-only": "export{}",
  "@/lib/data/portal-repository": `const s=globalThis.__priceRefreshWearTest;
    export async function withEconomyPublicPriceRefreshLock(fn){return {available:true,result:await fn()};}
    export async function getEconomyPublicPriceRefreshCandidates(){return [{catalogueId:1,itemType:'knife',displayName:'★ Bayonet | Doppler (Phase 2)',marketHashName:null,metadata:{marketBaseName:'★ Bayonet | Doppler',marketVersion:'Phase 2'},minFloat:0,maxFloat:0.08,currentPrice:null,imageUrl:null}];}
    export async function recordAutomaticEconomyPublicPrices(rows){s.catalogue.push(...rows);return rows.length;}
    export async function recordEconomyMarketVariantPrices(rows){s.variants.push(...rows);return rows.length;}`,
  "@/lib/economy/skinport-prices": `export async function getSkinportHistoricalPrices(inputs){return inputs.map(c=>({eurCents:c.marketHashName.includes('StatTrak')?40000:30000,source:'skinport-30d-median',sourceReference:'https://skinport.com/item/bayonet',...c}));}`,
  "@/lib/economy/external-market-prices": "export async function getExternalMarketPrices(inputs){return inputs.map(()=>null);} export async function getCsfloatExactListingPrice(){return null;}",
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier === "@/lib/economy/market-pricing") return { url: pathToFileURL(resolve("lib/economy/market-pricing.ts")).href, shortCircuit: true };
  return next(specifier, context);
} });
const { refreshAllEconomyPublicPrices } = await import("./price-refresh.ts");

test("refresh warms every legal Doppler wear and StatTrak variant without overwriting the default catalogue price", async () => {
  await refreshAllEconomyPublicPrices();
  assert.deepEqual(state.variants.map(row => [row.wear, row.stattrak, row.euroCents]).sort(), [
    ["Factory New", false, 30000], ["Factory New", true, 40000],
    ["Minimal Wear", false, 30000], ["Minimal Wear", true, 40000],
  ].sort());
  assert.equal(state.catalogue.length, 1);
});
