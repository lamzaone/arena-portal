import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const state = { failCache: false, cached: null as Record<string, unknown> | null, writes: [] as unknown[], exact: null as Record<string, unknown> | null, exactCalls: [] as unknown[] };
Object.assign(globalThis, { __marketPricingTest: state });
const stubs: Record<string,string> = {
  "server-only": "export{}",
  "@/lib/economy/skinport-prices": "export async function getSkinportHistoricalPrices(inputs){return inputs.map(()=>null);}",
  "@/lib/economy/external-market-prices": `const s=globalThis.__marketPricingTest;
    export async function getExternalMarketPrices(inputs){return inputs.map(()=>null);}
    export async function getCsfloatExactListingPrice(input){s.exactCalls.push(input);return s.exact;}`,
  "@/lib/data/portal-repository": `const s=globalThis.__marketPricingTest;
    export async function getEconomyMarketVariantPrice(){if(s.failCache)throw Error('offline');return s.cached;}
    export async function getEconomyMarketVariantPrices(inputs){if(s.failCache)throw Error('offline');return inputs.map(()=>s.cached);}
    export async function recordEconomyMarketVariantPrices(inputs){s.writes.push(...inputs);}`,
};
registerHooks({ resolve(specifier,context,next){
  if(stubs[specifier])return {url:`data:text/javascript,${encodeURIComponent(stubs[specifier])}`,shortCircuit:true};
  if(specifier==="@/lib/economy/market-pricing")return {url:pathToFileURL(resolve("lib/economy/market-pricing.ts")).href,shortCircuit:true};
  return next(specifier,context);
} });
const { getMarketplacePriceQuotes, selectMarketplacePriceFallback } = await import("./market-pricing.ts");
const { getCachedMarketplaceVariantFallback, getCachedMarketplaceVariantFallbacks, cacheMarketplaceVariantQuote } = await import("./market-variant-cache.ts");
const input = {itemType:"skin",displayName:"AK-47 | Case Hardened",marketHashName:null,metadata:{},minFloat:0,maxFloat:1,floatValue:0.2,seed:661,stattrak:false,exactPatternQuote:true};
const exact = {eurCents:50_000,source:"csfloat-exact-listing",sourceReference:"seed661-listing",marketHashName:"AK-47 | Case Hardened (Field-Tested)",exactFloat:true,exactSeed:true};

test("seed premiums are never usable as generic catalogue fallbacks, including a cache outage",async()=>{
  const premium={eurCents:50_000,source:"csfloat-exact-listing",sourceReference:"seed661-listing"};
  assert.equal(selectMarketplacePriceFallback(premium),null);
  const cacheInput={catalogueId:1,floatValue:0.2,stattrak:false,standardFallback:premium};
  for(const failCache of [false,true]){
    state.failCache=failCache;
    assert.equal(await getCachedMarketplaceVariantFallback(cacheInput),null);
    assert.deepEqual(await getCachedMarketplaceVariantFallbacks([cacheInput]),[null]);
  }
  state.failCache=false;
});

test("exact seed-and-float evidence keeps its real price and never writes the coarse wear cache",async()=>{
  state.exact=exact; state.writes=[];
  const [quote]=await getMarketplacePriceQuotes([input]);
  assert.equal(quote?.eurCents,50_000); assert.equal(quote?.seed,661); assert.equal(quote?.seedMatched,true);
  assert.equal(quote?.floatDiscountBps,0); assert.equal(quote?.pricingRule,"external-exact-v2");
  await cacheMarketplaceVariantQuote({catalogueId:1,stattrak:false,imageUrl:null,quote});
  assert.deepEqual(state.writes,[]);
});

test("ordinary market fallback echoes seed but never claims seed-specific evidence",async()=>{
  state.exact=null;
  const [quote]=await getMarketplacePriceQuotes([{...input,seed:700,fallbackPrice:{eurCents:1_000,source:"skinport"}}]);
  assert.equal(quote?.seed,700); assert.equal(quote?.seedMatched,false);
  assert.equal(quote?.pricingRule,"float-linear-v1"); assert.equal(quote?.fromFallback,true);
});
