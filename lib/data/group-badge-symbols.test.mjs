import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import sharp from "sharp";

const records = new Map();
globalThis.__badgeSymbolPool = {
  async execute(sql, [id, bytes, actor]) { if (!records.has(id)) records.set(id, { png_bytes: bytes, actor }); return [{}]; },
  async query(sql, [id]) { return [records.has(id) ? [records.get(id)] : []]; },
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript,export{}" };
  if (specifier === "./database-pools") return { shortCircuit: true, url: "data:text/javascript,export const getPortalDatabasePool=()=>globalThis.__badgeSymbolPool" };
  if (specifier.startsWith("@/")) return { shortCircuit: true, url: pathToFileURL(resolve(`${specifier.slice(2)}.ts`)).href };
  return next(specifier, context);
} });
const { normalizeGroupBadgeSymbol, saveGroupBadgeSymbol, readGroupBadgeSymbol, readGroupBadgeForm } = await import("./group-badge-symbols.ts");
const { GET } = await import("../../app/api/group-badges/[symbolId]/route.ts");

test("custom images become bounded PNG symbols with immutable content-based URLs", async () => {
  const source = await sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 200, g: 30, b: 50, alpha: 0.8 } } }).webp().toBuffer();
  const file = new File([source], "../../arbitrary.webp", { type: "image/webp" });
  const key = await saveGroupBadgeSymbol(file, "76561198000000001");
  assert.match(key, /^custom\.[a-f0-9]{24}$/);
  assert.equal(await saveGroupBadgeSymbol(file, "76561198000000002"), key);
  const bytes = await readGroupBadgeSymbol(key.slice(7));
  assert.equal(records.get(key.slice(7)).actor, "76561198000000001");
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 128); assert.equal(metadata.height, 128);
  assert.equal(metadata.exif, undefined);
  const params = Promise.resolve({ symbolId: key.slice(7) });
  const response = await GET(new Request("https://portal.test/image"), { params });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("cache-control"), /immutable/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal((await GET(new Request("https://portal.test/image", { headers: { "if-none-match": response.headers.get("etag") } }), { params })).status, 304);
});

test("active SVG markup, forged formats, oversized images and files fail before storage", async () => {
  const png = await sharp({ create: { width: 513, height: 16, channels: 4, background: "red" } }).png().toBuffer();
  for (const file of [
    new File(['<svg onload="alert(1)"></svg>'], "evil.svg", { type: "image/svg+xml" }),
    new File(["<html>not a PNG</html>"], "fake.png", { type: "image/png" }),
    new File([new Uint8Array(256 * 1024 + 1)], "large.png", { type: "image/png" }),
    new File([png], "wide.png", { type: "image/png" }),
  ]) await assert.rejects(normalizeGroupBadgeSymbol(file), { code: "badge_symbol_invalid" });
  assert.equal(await readGroupBadgeSymbol("../../private"), null);
  assert.equal((await GET(new Request("https://portal.test/image"), { params: Promise.resolve({ symbolId: "bad" }) })).status, 404);
});

test("multipart requests are bounded even without a content-length header", async () => {
  const body = new FormData(); body.set("badgeIconKey", "crown");
  const parsed = await readGroupBadgeForm(new Request("https://portal.test/form", { method: "POST", body }));
  assert.equal(parsed.get("badgeIconKey"), "crown");
  const huge = new Request("https://portal.test/form", { method: "POST", body: "x".repeat(512 * 1024 + 1), headers: { "content-type": "application/x-www-form-urlencoded" } });
  await assert.rejects(readGroupBadgeForm(huge), { code: "badge_symbol_invalid" });
});
