import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
  return next(specifier, context);
} });
const { getCsfloatExactListingPrice } = await import("./external-market-prices.ts");
const originalFetch = globalThis.fetch;
const originalKey = process.env.CSFLOAT_API_KEY;
let listings: unknown[] = [];
let requests: URL[] = [];
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname === "csfloat.com") { requests.push(url); return Response.json({ data: listings }); }
  return Response.json({ rates: { EUR: 0.9 } });
};
process.env.CSFLOAT_API_KEY = "test-key";
test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.CSFLOAT_API_KEY;
  else process.env.CSFLOAT_API_KEY = originalKey;
});
const marketHashName = "AK-47 | Case Hardened (Field-Tested)";
const lookup = (seed: number) => ({marketHashName,stattrak:false,floatValue:0.2,minFloat:0,maxFloat:1,seed});
const listing = (seed: number, floatValue: number, price = 10_000) => ({
  id: String(seed), type:"buy_now",state:"listed",price,
  item:{market_hash_name:marketHashName,float_value:floatValue,paint_seed:seed,is_stattrak:false,is_souvenir:false},
});

test("a same-seed listing with a nearby float is not exact evidence", async () => {
  listings = [listing(661, 0.201)];
  assert.equal(await getCsfloatExactListingPrice(lookup(661)), null);
  const search = requests.at(-1)!.searchParams;
  assert.equal(search.get("paint_seed"), "661");
  assert.ok(Number(search.get("max_float")) - Number(search.get("min_float")) <= 0.0000011);
});

test("only the selected six-decimal float and integer seed contribute a listing price", async () => {
  listings = [listing(700,0.2,100), listing(662,0.205,200), listing(662,0.20000000298023224,10_000)];
  const quote = await getCsfloatExactListingPrice(lookup(662));
  assert.equal(quote?.eurCents,9_000); assert.equal(quote?.exactFloat,true); assert.equal(quote?.exactSeed,true);
  assert.ok(quote?.sourceReference.includes("662"));
});

test("inactive or different-category listings cannot be reused as an exact price", async () => {
  listings = [
    {...listing(663,0.2),state:"sold"},
    {...listing(663,0.2),type:"auction"},
    {...listing(663,0.2),item:{...listing(663,0.2).item,is_stattrak:true}},
  ];
  assert.equal(await getCsfloatExactListingPrice(lookup(663)),null);
});

test("exact quote cache separates seed and float and coalesces identical pending lookups", async () => {
  listings = [listing(664,0.2,500),listing(665,0.2,900),listing(664,0.21,1200)];
  const before = requests.length;
  const [first,same,otherSeed,otherFloat] = await Promise.all([
    getCsfloatExactListingPrice(lookup(664)),getCsfloatExactListingPrice(lookup(664)),
    getCsfloatExactListingPrice(lookup(665)),getCsfloatExactListingPrice({...lookup(664),floatValue:0.21}),
  ]);
  assert.equal(first?.eurCents,450); assert.equal(same?.eurCents,450);
  assert.equal(otherSeed?.eurCents,810); assert.equal(otherFloat?.eurCents,1080);
  assert.equal(requests.length-before,3);
});

test("fractional seed lookup is invalid and a missing API key never initiates a request", async () => {
  const before = requests.length;
  assert.equal(await getCsfloatExactListingPrice(lookup(666.5)),null);
  delete process.env.CSFLOAT_API_KEY;
  assert.equal(await getCsfloatExactListingPrice(lookup(667)),null);
  process.env.CSFLOAT_API_KEY = "test-key";
  assert.equal(requests.length,before);
});
