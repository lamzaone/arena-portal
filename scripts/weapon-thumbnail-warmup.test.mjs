import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import models from "../lib/economy/cs2-skin-models.json" with { type: "json" };
import catalogue from "../lib/economy/cs2-finishes.json" with { type: "json" };
import { weaponIdForDefindex } from "@skinhub/viewer";
import { parseThumbnailWarmupOptions, selectThumbnailModelRepresentatives } from "./weapon-thumbnail-warmup.mjs";

const finish = (itemType = "skin", minFloat = 0, maxFloat = 1) => ({ itemType, minFloat, maxFloat });

test("model representatives deduplicate each definition and supported mesh generation", () => {
  const finishes = { "7:0": finish(), "7:44": finish(), "7:180": finish(), "7:282": finish(), "500:0": finish("knife"), "5027:10006": finish("glove") };
  const variants = { "7:0": false, "7:44": true, "7:180": true, "7:282": false, "500:0": false, "5027:10006": false };
  const selected = selectThumbnailModelRepresentatives({ finishes, variants });
  assert.deepEqual(selected.map(row => [row.definitionIndex, row.paintkit, row.legacyModel]), [
    [7, 282, false], [7, 44, true], [500, 0, false], [5027, 10006, false],
  ]);
  assert.deepEqual(selectThumbnailModelRepresentatives({ finishes: Object.fromEntries(Object.entries(finishes).reverse()), variants }), selected);
});

test("selection skips unknown, unreleased and invalid identities without inventing a mesh generation", () => {
  const finishes = { "7:44": finish(), "7:180": finish(), "9999:44": finish(), "7:282": finish("sticker"), "4:38": finish("skin", 0.8, 0.1) };
  const variants = { "7:44": true, "7:99999": false, "9999:44": false, "7:282": false, "4:38": false };
  const selected = selectThumbnailModelRepresentatives({ finishes, variants });
  assert.deepEqual(selected.map(row => [row.definitionIndex, row.paintkit, row.legacyModel]), [[7, 44, true]]);
});

test("sample floats stay within official finish bounds and limits truncate a deterministic list", () => {
  const finishes = { "7:44": finish("skin", 0.3, 0.8), "4:38": finish("skin", 0, 0.08) };
  const variants = { "7:44": true, "4:38": false };
  const selected = selectThumbnailModelRepresentatives({ finishes, variants });
  assert.deepEqual(selected.map(row => row.floatValue), [0.08, 0.3]);
  assert.deepEqual(selectThumbnailModelRepresentatives({ finishes, variants, limit: 1 }), selected.slice(0, 1));
  for (const limit of [0, -1, 1.5, Infinity]) assert.throws(() => selectThumbnailModelRepresentatives({ finishes, variants, limit }));
});

test("bundled manifests cover every supported definition/generation with actual released finishes", () => {
  const selected = selectThumbnailModelRepresentatives();
  const expected = new Set(Object.entries(catalogue.finishes).flatMap(([identity, metadata]) => {
    const definition = Number(identity.split(":")[0]);
    const legacy = models.variants[identity];
    return ["skin", "knife", "glove"].includes(metadata.itemType) && weaponIdForDefindex(definition) && typeof legacy === "boolean"
      ? [`${definition}:${legacy}`] : [];
  }));
  assert.deepEqual(new Set(selected.map(row => `${row.definitionIndex}:${row.legacyModel}`)), expected);
  assert.equal(selected.length, expected.size);
  assert.ok(selected.length > 50 && selected.length < 150);
  for (const row of selected) {
    const identity = `${row.definitionIndex}:${row.paintkit}`;
    assert.ok(catalogue.finishes[identity], identity);
    assert.equal(models.variants[identity], row.legacyModel, identity);
    assert.ok(row.floatValue >= (catalogue.finishes[identity].minFloat ?? 0));
    assert.ok(row.floatValue <= (catalogue.finishes[identity].maxFloat ?? 1));
  }
});

test("CLI options preserve existing inventory/catalogue behavior and validate model/profile choices", () => {
  assert.deepEqual(parseThumbnailWarmupOptions([]), { inventory: true, catalogue: true, models: false, limit: Number.MAX_SAFE_INTEGER, profile: "warmer" });
  assert.deepEqual(parseThumbnailWarmupOptions(["--inventory", "--limit=12"]), { inventory: true, catalogue: false, models: false, limit: 12, profile: "warmer" });
  assert.deepEqual(parseThumbnailWarmupOptions(["--catalogue"]), { inventory: false, catalogue: true, models: false, limit: Number.MAX_SAFE_INTEGER, profile: "warmer" });
  assert.deepEqual(parseThumbnailWarmupOptions(["--models", "--profile=server", "--limit=3"]), { inventory: false, catalogue: false, models: true, limit: 3, profile: "server" });
  for (const args of [["--models", "--inventory"], ["--models", "--catalogue"], ["--profile=../../server"], ["--limit=0"], ["--limit=1.5"], ["--unknown"]]) {
    assert.throws(() => parseThumbnailWarmupOptions(args), args.join(" "));
  }
});

test("actual --models CLI avoids the database and warms assets even when images already exist", () => {
  for (const cached of [false, true]) {
    const rendererMock = `export function createWeaponThumbnailRenderer(options) {
      const state=globalThis.__warmup; state.options=options;
      return {async render(item){state.rendered.push(item);return Buffer.from(item.defindex+':'+item.paintIndex);},async close(){state.closed++;}};
    }`;
    const cacheMock = `export function createThumbnailCache(options) {
      const state=globalThis.__warmup,images=new Set();
      return {async request(item){
        const key=item.defindex+':'+item.paintIndex;
        if(!state.cached && !images.has(key)) {
          const image=await options.render(item);
          if(image.toString()!==key)throw Error('Wrong model image');
          images.add(key);state.written++;
        }
        return {status:'ready'};
      },async drain(){}};
    }`;
    const code = `
      import { registerHooks } from 'node:module';
      globalThis.__warmup={cached:${cached},rendered:[],written:0,closed:0};
      const mocks=${JSON.stringify({
        "../lib/economy/thumbnail-renderer.ts": rendererMock,
        "../lib/economy/thumbnail-cache.ts": cacheMock,
        "../lib/economy/thumbnail-paths.ts": "export const thumbnailAssetCacheDirectory=()=>'/fixture/assets'; export const thumbnailImageCacheDirectory=()=>'/fixture/images';",
        "node:process": "export function loadEnvFile(){}",
      })};
      registerHooks({resolve(specifier,context,next){
        if(specifier==='mysql2/promise')throw Error('Model warmup must not load MySQL');
        if(mocks[specifier])return {url:'data:text/javascript,'+encodeURIComponent(mocks[specifier]),shortCircuit:true};
        return next(specifier,context);
      }});
      delete process.env.PORTAL_DATABASE_URL;
      process.argv=[process.execPath,'warm-weapon-thumbnails.mjs','--models','--profile=server','--limit=2'];
      await import(${JSON.stringify(new URL("./warm-weapon-thumbnails.mjs", import.meta.url).href)});
      console.log('RESULT '+JSON.stringify(globalThis.__warmup));
    `;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", code], { encoding: "utf8", timeout: 20_000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const state = JSON.parse(result.stdout.split(/\r?\n/).find(line => line.startsWith("RESULT ")).slice(7));
    assert.equal(state.rendered.length, 2);
    assert.equal(state.written, cached ? 0 : 2);
    assert.equal(state.closed, 1);
    assert.match(state.options.assetCacheDirectory, /[/\\]assets[/\\]server$/);
  }
});
