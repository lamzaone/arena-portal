import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const state = {
  catalogue: {} as Record<string, any>, items: [] as Array<Record<string, any>>,
  lookups: [] as Array<Record<string, any>>, purchases: [] as Array<Record<string, any>>,
  sales: [] as Array<Record<string, any>>, cacheCalls: 0, purchaseFailure: null as string | null,
};
Object.assign(globalThis, { __customFinishRoutes: state });
const stubs: Record<string, string> = {
  "@/lib/data/portal-repository": `const s=globalThis.__customFinishRoutes;
    export class EconomyRepositoryError extends Error { constructor(code,message){super(message);this.code=code;} }
    export async function getEconomyCatalogueItem(){return s.catalogue;}
    export function isEconomyMarketplacePurchasable(){return true;}
    export function isEconomyProfileTheme(){return false;} export function isEconomyVipMembership(){return false;}
    export async function purchaseEconomyItem(input){s.purchases.push(input);if(s.purchaseFailure)throw new EconomyRepositoryError(s.purchaseFailure,'The price changed. Review the refreshed quote before buying.');return {wallet:{balance:200},itemId:'bought'};}
    export async function recordEconomyPrice(){throw new Error('Unexpected price write');}
    export async function getPlayerEconomyInventoryItem(){return s.items[0];}
    export async function getPlayerEconomyInventoryItems(){return s.items;}
    export async function sellEconomyItem(input){s.sales.push(input);return {wallet:{balance:200},payoutTokens:30};}
    export async function sellEconomyItems(input){s.sales.push(input);return {wallet:{balance:200},itemIds:input.items.map(i=>i.itemId),payoutTokens:30};}
    export async function getEconomyDiscountedPrice(input){return {basePriceTokens:input.basePriceTokens,finalPriceTokens:input.basePriceTokens-100,appliedDiscount:null};}`,
  "@/lib/economy/request": `export async function readEconomyMutation(request){return {session:{steamId:'player'},body:await request.json()};}
    export const isEconomyError=v=>v instanceof Response;
    export const economyJsonError=(message,status)=>Response.json({ok:false,message},{status});
    export const economyJsonSuccess=v=>Response.json({ok:true,...v});
    export const economyMutationFailure=e=>Response.json({ok:false,message:e.message},{status:400});
    export const integerField=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max?v:null;
    export const textField=v=>typeof v==='string'&&v.length?v:null;
    export const stringArrayField=v=>Array.isArray(v)?v:null;`,
  "@/lib/auth/session": "export async function getSession(){return {steamId:'player'};}",
  "@/lib/economy/market-pricing": `const s=globalThis.__customFinishRoutes;
    export const isFloatPricedMarketplaceItem=t=>['skin','knife','glove'].includes(t);
    export const isStattrakMarketplaceItem=t=>['skin','knife'].includes(t);
    export const marketplaceWearLabel=()=> 'Field-Tested';
    export async function getMarketplacePriceQuotes(inputs){s.lookups.push(...inputs);return inputs.map(i=>i.metadata?.unpriced?null:{baseEuroCents:900,eurCents:900,source:'csfloat-exact-listing',sourceReference:'listing',marketHashName:i.marketHashName,marketVersion:null,floatValue:i.floatValue,wear:'Field-Tested',stattrak:i.stattrak,floatDiscountBps:0,pricingRule:'external-exact-v2',seed:i.seed,seedMatched:true,fromFallback:false,fallbackStale:false,fallbackObservedAt:null});}`,
  "@/lib/economy/market-variant-cache": `const s=globalThis.__customFinishRoutes;
    export async function getCachedMarketplaceVariantFallback(){s.cacheCalls++;return null;}
    export async function getCachedMarketplaceVariantFallbacks(inputs){s.cacheCalls++;return inputs.map(()=>null);}
    export async function cacheMarketplaceVariantQuote(){s.cacheCalls++;}
    export async function cacheMarketplaceVariantQuotes(){s.cacheCalls++;}`,
  "@/lib/economy/inventory-sale-lock": "export const canSellInventoryItem=i=>i.state==='available';",
  "@/lib/economy/sellback": "export const economySellbackSaleMessage=()=> 'Sold';",
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
  return next(specifier, context);
} });
const { POST: purchase } = await import("./market/purchase/route.ts");
const { POST: sell } = await import("./items/sell/route.ts");
const { GET: quote } = await import("./market/quote/route.ts");
function reset(custom = true) {
  state.catalogue = { id:1,itemType:'skin',displayName:'Glock-18 | Case Hardened',marketHashName:'Glock-18 | Case Hardened',minFloat:0,maxFloat:1,metadata:{customServerFinish:custom},price:{euroCents:1200,tokenPrice:1200,source:'staff-last-known',sourceReference:'staff-panel'} };
  state.items = [{id:'custom',catalogueId:1,catalogue:state.catalogue,itemType:'skin',state:'available',floatValue:.2,seed:661,stattrak:false}];
  state.lookups=[]; state.purchases=[]; state.sales=[]; state.cacheCalls=0; state.purchaseFailure=null;
}
const mutation = (body: Record<string, unknown>) => new Request('http://localhost/api', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:'test-request-0001',...(body.catalogueId ? {expectedUnitPriceTokens:900} : {}),...body})});
const quoteRequest = (seed = '661') => new Request(`http://localhost/api?catalogueId=1&float=0.2&seed=${seed}`);

test('custom finish purchase preserves selected float/seed and delegates locked manual pricing without external or cache lookup', async()=>{
  reset(); const result=await purchase(mutation({catalogueId:1,floatValue:.2,seed:661,stattrak:true}));
  assert.equal(result.status,200); assert.equal(state.lookups.length,0); assert.equal(state.cacheCalls,0);
  assert.equal(state.purchases[0].seed,661); assert.equal(state.purchases[0].floatValue,.2);
  assert.equal(state.purchases[0].resolvedMarketQuote,undefined);
});
test('ordinary purchase quotes the selected seed and forwards quote identity',async()=>{
  reset(false); const result=await purchase(mutation({catalogueId:1,floatValue:.2,seed:0}));
  assert.equal(result.status,200); assert.equal(state.lookups[0].seed,0);
  assert.equal(state.purchases[0].seed,0); assert.equal(state.purchases[0].resolvedMarketQuote.seed,0);
  assert.equal(state.purchases[0].expectedUnitPriceTokens,900);
});

test('float-priced purchases require a valid displayed unit price before provider lookup',async()=>{
  for(const expectedUnitPriceTokens of [undefined,null,-1,0.5,Number.MAX_SAFE_INTEGER+1]){
    reset(); const response=await purchase(mutation({catalogueId:1,floatValue:.2,seed:661,expectedUnitPriceTokens}));
    assert.equal(response.status,400); assert.equal(state.lookups.length,0); assert.equal(state.purchases.length,0);
  }
});

test('a locked price change is returned as a409 conflict with a quote refresh instruction',async()=>{
  reset(); state.purchaseFailure='price_changed';
  const response=await purchase(mutation({catalogueId:1,floatValue:.2,seed:661,expectedUnitPriceTokens:1100}));
  assert.equal(response.status,409); const body=await response.json();
  assert.equal(body.code,'price_changed'); assert.equal(body.reloadQuote,true);
  assert.equal(state.purchases[0].expectedUnitPriceTokens,1100);
});

test('ordinary nonfloat goods retain checkout without a displayed-price field',async()=>{
  reset(false); state.catalogue.itemType='keychain'; state.catalogue.marketHashName=null;
  const response=await purchase(mutation({catalogueId:1,expectedUnitPriceTokens:undefined}));
  assert.equal(response.status,200); assert.equal(state.purchases[0].expectedUnitPriceTokens,undefined);
});
test('selected market seeds reject fractional or out-of-range values',async()=>{
  for(const seed of [-1,1001,1.5]){
    reset(); assert.equal((await purchase(mutation({catalogueId:1,floatValue:.2,seed}))).status,400);
    assert.equal((await quote(quoteRequest(String(seed)))).status,400); assert.equal(state.purchases.length,0);
  }
});
test('custom single sale delegates locked manual pricing and skips external/cache access',async()=>{
  reset(); assert.equal((await sell(mutation({itemId:'custom'}))).status,200);
  assert.equal(state.lookups.length,0); assert.equal(state.cacheCalls,0); assert.equal(state.sales[0].marketQuote,undefined);
});
test('mixed bulk sale excludes custom finishes from provider lookup without skipping their sale',async()=>{
  reset(); state.items.push({...state.items[0],id:'official',catalogueId:2,catalogue:{...state.catalogue,metadata:{}}});
  const response=await sell(mutation({itemIds:['custom','official']}));
  assert.equal(response.status,200); assert.equal(state.lookups.length,1);
  assert.deepEqual(state.sales[0].items.map((i:Record<string,unknown>)=>i.itemId),['custom','official']);
  assert.equal(state.sales[0].items[0].marketQuote,undefined); assert.ok(state.sales[0].items[1].marketQuote);
  assert.deepEqual((await response.json()).skippedItemIds,[]);
});
test('manual quote echoes selection and applies promotions to fixed staff price without inventing pattern premiums',async()=>{
  reset(); const response=await quote(quoteRequest()); const body=await response.json();
  assert.equal(response.status,200); assert.equal(body.seed,661); assert.equal(body.seedMatched,false);
  assert.equal(body.priceTokens,1100); assert.equal(body.basePriceTokens,1200);
  assert.equal(body.pricingRule,'custom-server-fixed-v1'); assert.equal(state.lookups.length,0); assert.equal(state.cacheCalls,0);
});
test('custom quote rejects missing or nonmanual prices without consulting providers',async()=>{
  for(const price of [null,{euroCents:1200,tokenPrice:1200,source:'csfloat-price-index',sourceReference:'staff-panel'},{euroCents:0,tokenPrice:0,source:'staff-last-known',sourceReference:'staff-panel'}]){
    reset(); state.catalogue.price=price; assert.equal((await quote(quoteRequest())).status,409); assert.equal(state.lookups.length,0);
  }
});
