import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const state = { failCache: false, failProviders: false, cached: null as Record<string, unknown> | null, writes: [] as unknown[], exact: null as Record<string, unknown> | null, exactCalls: [] as unknown[], variantCalls: 0 };
Object.assign(globalThis, { __marketPricingTest: state });
const stubs: Record<string,string> = {
  "server-only": "export{}",
  "@/lib/economy/skinport-prices": "export async function getSkinportHistoricalPrices(inputs){if(inputs.length&&globalThis.__marketPricingTest.failProviders)throw Error('provider called');return inputs.map(()=>null);}",
  "@/lib/economy/external-market-prices": `const s=globalThis.__marketPricingTest;
    export async function getExternalMarketPrices(inputs){if(inputs.length&&s.failProviders)throw Error('provider called');return inputs.map(()=>null);}
    export async function getCsfloatExactListingPrice(input){s.exactCalls.push(input);return s.exact;}`,
  "@/lib/data/portal-repository": `const s=globalThis.__marketPricingTest;
    export async function getEconomyMarketVariantPrice(){if(s.failCache)throw Error('offline');return s.cached;}
    export async function getEconomyMarketVariantPrices(inputs){s.variantCalls++;if(s.failCache)throw Error('offline');return inputs.map(()=>s.cached);}
    export async function recordEconomyMarketVariantPrices(inputs){s.writes.push(...inputs);}
    export async function getAuthoritativeExternalIdentityMemberships(){return {};}
    export async function getPlayerEconomyInventory(){return {items:[{id:'owned',itemType:'crate',displayName:'Case',catalogueId:1,floatValue:null,seed:null,stattrak:false,catalogue:{marketHashName:'Case',metadata:{},price:{euroCents:1250,source:'skinport',sourceReference:null}}}],total:1,page:1,pageSize:24};}`,
  "@/lib/data/identity-groups": "export async function reconcileIdentityGroupRewards(input){input.onLockWait?.(3.25);}",
};
registerHooks({ resolve(specifier,context,next){
  if(stubs[specifier])return {url:`data:text/javascript,${encodeURIComponent(stubs[specifier])}`,shortCircuit:true};
  if(specifier==="@/lib/economy/market-pricing")return {url:pathToFileURL(resolve("lib/economy/market-pricing.ts")).href,shortCircuit:true};
  if(specifier==="@/lib/economy/market-variant-cache")return {url:pathToFileURL(resolve("lib/economy/market-variant-cache.ts")).href,shortCircuit:true};
  if(specifier.startsWith("@/lib/economy/"))return {url:pathToFileURL(resolve(specifier.slice(2)+".ts")).href,shortCircuit:true};
  return next(specifier,context);
} });
const { getMarketplacePriceQuotes, getBrowseMarketplacePriceQuotes, selectMarketplacePriceFallback, deriveMarketplacePriceIdentity } = await import("./market-pricing.ts");
const { getCachedMarketplaceVariantFallback, getCachedMarketplaceVariantFallbacks, cacheMarketplaceVariantQuote } = await import("./market-variant-cache.ts");
const { getPlayerEconomyInventoryPage, withCurrentMarketPrices } = await import("./player-inventory.ts");
const { toEconomyItem } = await import("../../components/economy/economy-view-model.ts");
const input = {itemType:"skin",displayName:"AK-47 | Case Hardened",marketHashName:null,metadata:{},minFloat:0,maxFloat:1,floatValue:0.2,seed:661,stattrak:false,exactPatternQuote:true};
const exact = {eurCents:50_000,source:"csfloat-exact-listing",sourceReference:"seed661-listing",marketHashName:"AK-47 | Case Hardened (Field-Tested)",exactFloat:true,exactSeed:true};

test("seed premiums are never usable as generic catalogue fallbacks, including a cache outage",async()=>{
  const premium={eurCents:50_000,source:"csfloat-exact-listing",sourceReference:"seed661-listing"};
  assert.equal(selectMarketplacePriceFallback(premium),null);
  const cacheInput={...input,catalogueId:1,itemType:"skin",floatValue:0.2,stattrak:false,standardFallback:premium};
  for(const failCache of [false,true]){
    state.failCache=failCache;
    assert.equal(await getCachedMarketplaceVariantFallback(cacheInput),null);
    assert.deepEqual(await getCachedMarketplaceVariantFallbacks([cacheInput]),[null]);
  }
  state.failCache=false;
});

test("automatic catalogue snapshots cannot price another exterior or receive a second float adjustment", async () => {
  const standardFallback = { eurCents: 977, source: "skinport-30d-median" };
  try {
    for (const failCache of [false, true]) {
      state.failCache = failCache;
      for (const floatValue of [0.15, 0.02]) {
        const lookup = { ...input, catalogueId: 1, itemType: "skin", floatValue, stattrak: false, standardFallback };
        assert.equal(await getCachedMarketplaceVariantFallback(lookup), null);
        assert.deepEqual(await getCachedMarketplaceVariantFallbacks([lookup]), [null]);
      }
    }
    state.failCache = false;
    const manual = { ...standardFallback, source: "staff-last-known", sourceReference: "staff-panel" };
    assert.equal((await getCachedMarketplaceVariantFallback({ ...input, catalogueId: 1, itemType: "skin", floatValue: 0.02, stattrak: false, standardFallback: manual }))?.eurCents, 977);
    assert.equal((await getCachedMarketplaceVariantFallback({ ...input, catalogueId: 1, itemType: "crate", floatValue: null, stattrak: false, standardFallback }))?.eurCents, 977);
    state.cached = { euroCents: 1000, source: "skinport-30d-median", marketHashName: "AK-47 | Case Hardened (Minimal Wear)", marketVersion: null, sourceReference: null, observedAt: new Date().toISOString(), stale: false };
    const fallbackPrice = await getCachedMarketplaceVariantFallback({ ...input, catalogueId: 1, itemType: "skin", floatValue: 0.15, stattrak: false, standardFallback });
    const [quote] = await getBrowseMarketplacePriceQuotes([{ ...input, floatValue: 0.15, fallbackPrice }]);
    assert.equal(quote?.baseEuroCents, 1000);
    assert.equal(quote?.eurCents, 977);
  } finally { state.failCache = false; state.cached = null; }
});

test("inventory does not display a normal catalogue price for an unpriced exterior", async () => {
  const owned = { id: "unpriced-wear", itemType: "skin", displayName: "AK-47 | Case Hardened", catalogueId: 1, floatValue: 0.02, seed: 661, stattrak: false, marketPriceTokens: 977,
    catalogue: { marketHashName: null, metadata: {}, price: { euroCents: 977, source: "skinport-30d-median", sourceReference: null } } };
  const [item] = await withCurrentMarketPrices([owned as any]);
  assert.equal(item.marketPriceTokens, null);
  const view = toEconomyItem(item);
  assert.equal(view.marketPriceTokens, null);
  assert.equal(view.marketPriceEuroCents, null);
  assert.equal(view.marketPriceSource, null);
});

test("a generic cached Doppler price cannot be relabelled as a corrected Emerald phase", async () => {
  const phaseInput = { ...input, itemType: "skin", displayName: "Glock-18 | Gamma Doppler (Emerald)", metadata: { marketBaseName: "Glock-18 | Gamma Doppler", marketVersion: "Emerald" }, minFloat: 0, maxFloat: 0.08, floatValue: 0.075 };
  state.cached = { euroCents: 1000, source: "skinport-30d-median", marketHashName: "Glock-18 | Gamma Doppler (Minimal Wear)", marketVersion: null, sourceReference: null, observedAt: new Date().toISOString(), stale: false };
  try {
    const lookup = { ...phaseInput, catalogueId: 1, itemType: "skin", floatValue: 0.075, stattrak: false };
    const fallbackPrice = await getCachedMarketplaceVariantFallback(lookup);
    const [quote] = await getBrowseMarketplacePriceQuotes([{ ...phaseInput, fallbackPrice }]);
    assert.equal(quote, null);
    const manualInput = { ...lookup, standardFallback: { eurCents: 200000, source: "staff-last-known", sourceReference: "staff-panel" } };
    assert.equal((await getCachedMarketplaceVariantFallback(manualInput))?.eurCents, 200000);
    assert.equal((await getCachedMarketplaceVariantFallbacks([manualInput]))[0]?.eurCents, 200000);
    const [wrongWear] = await getBrowseMarketplacePriceQuotes([{ ...input, floatValue: 0.02, fallbackPrice: { eurCents: 1000, source: "skinport-30d-median", marketHashName: "AK-47 | Case Hardened (Minimal Wear)", marketVersion: null } }]);
    assert.equal(wrongWear, null);
    state.cached.marketVersion = "Emerald";
    const validFallback = await getCachedMarketplaceVariantFallback(lookup);
    const [valid] = await getBrowseMarketplacePriceQuotes([{ ...phaseInput, fallbackPrice: validFallback }]);
    assert.equal(valid?.baseEuroCents, 1000);
    assert.equal(valid?.marketVersion, "Emerald");
  } finally { state.cached = null; }
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

test("vanilla knives quote their base market identity with one fixed float",async()=>{
  state.exact=null;
  const [quote]=await getMarketplacePriceQuotes([{
    itemType:"knife",displayName:"★ Bayonet",marketHashName:"★ Bayonet",
    metadata:{vanillaKnife:true,marketBaseName:"★ Bayonet"},
    minFloat:0,maxFloat:0,floatValue:0,seed:0,stattrak:false,
    fallbackPrice:{eurCents:1_000,source:"skinport"},
  }]);
  assert.equal(quote?.marketHashName,"★ Bayonet");
  assert.equal(quote?.wear,"Vanilla");
  assert.equal(quote?.floatValue,0);
  assert.equal(quote?.floatDiscountBps,0);
});

test("browse quotes use stored prices without waiting for public providers",async()=>{
  state.failProviders=true;
  try {
    const [quote]=await getBrowseMarketplacePriceQuotes([{
      itemType:"crate",displayName:"Case",marketHashName:"Case",metadata:{},
      minFloat:null,maxFloat:null,fallbackPrice:{eurCents:1_250,source:"skinport"},
    }]);
    assert.equal(quote?.eurCents,1_250);
    assert.equal(quote?.fromFallback,true);
  } finally {
    state.failProviders=false;
  }
});

test("inventory page prices owned items from snapshots without contacting providers",async()=>{
  state.failProviders=true;
  try {
    const page=await getPlayerEconomyInventoryPage("76561198000000001");
    assert.equal(page.items[0].marketPriceTokens,1250);
    assert.equal(page.total,1);
  } finally {
    state.failProviders=false;
  }
});

test("panel inventory grid omits price enrichment while website pages retain it",async()=>{
  state.variantCalls=0;
  const page=await getPlayerEconomyInventoryPage("76561198000000001",{},undefined,{quotePrices:false});
  assert.equal(page.total,1);
  assert.equal(state.variantCalls,0);
  await getPlayerEconomyInventoryPage("76561198000000001");
  assert.equal(state.variantCalls,1);
});

test("StatTrak lookup names retain the trademark and never duplicate an existing prefix", () => {
  const identity = deriveMarketplacePriceIdentity({ ...input, itemType: "knife", displayName: "★ StatTrak™ Bayonet | Doppler (Phase 2)", metadata: { marketVersion: "Phase 2" }, minFloat: 0, maxFloat: 0.08, floatValue: 0.02, stattrak: true });
  assert.deepEqual(identity.candidates[0], { marketHashName: "★ StatTrak™ Bayonet | Doppler (Factory New)", marketVersion: "Phase 2" });
});

test("Doppler exact pattern requests retain a verified paint identity", async () => {
  state.exact = { ...exact, marketHashName: "★ StatTrak™ Bayonet | Doppler (Factory New)" };
  state.exactCalls = [];
  try {
    const [quote] = await getMarketplacePriceQuotes([{ ...input, itemType: "knife", displayName: "★ Bayonet | Doppler (Phase 2)", definitionIndex: 500, paintkit: 419, metadata: { marketBaseName: "★ Bayonet | Doppler", marketVersion: "Phase 2" }, floatValue: 0.02, minFloat: 0, maxFloat: 0.08, stattrak: true }]);
    assert.equal(quote?.seedMatched, true);
    assert.equal((state.exactCalls[0] as { paintkit: number }).paintkit, 419);
  } finally { state.exact = null; }
});

test("pattern estimates keep float adjustment and stay out of the shared wear cache", async () => {
  state.exact = { ...exact, source: "csfloat-pattern-listing", exactFloat: false };
  state.writes = [];
  try {
    const [quote] = await getMarketplacePriceQuotes([input]);
    assert.equal(quote?.seedMatched, true);
    assert.equal(quote?.floatDiscountBps, 300);
    assert.equal(quote?.eurCents, 48500);
    assert.equal(quote?.pricingRule, "float-linear-v1");
    await cacheMarketplaceVariantQuote({ catalogueId: 1, stattrak: false, imageUrl: null, quote });
    assert.deepEqual(state.writes, []);
    assert.equal(selectMarketplacePriceFallback({ eurCents: 50000, source: "csfloat-pattern-listing" }), null);
  } finally { state.exact = null; }
});

test("inventory page reports membership, lock, SQL, and snapshot stages",async()=>{
  const stages:string[]=[];
  await getPlayerEconomyInventoryPage("76561198000000001",{},(phase,durationMs)=>{
    assert.ok(Number.isFinite(durationMs)&&durationMs>=0);
    stages.push(phase);
  });
  assert.deepEqual(stages,["membership_lookup","lock_wait","reconcile","inventory_sql","snapshot_quote"]);
});
