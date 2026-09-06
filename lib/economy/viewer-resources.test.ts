import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { viewerResourceUrl, rewriteViewerResource, viewerFramePolicy, viewerRequestOrigin, createViewerResourceCache } from "./viewer-resources.ts";
import { browserViewerAssetUrl } from "../../components/economy/browser-viewer-assets.ts";

async function removeFixture(directory: string) {
  const target = resolve(directory);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith("arena-viewer-test-"));
  await rm(target, { recursive: true, force: true });
}

test("resource proxy accepts only fixed public asset paths and never an arbitrary destination", () => {
  assert.equal(viewerResourceUrl("cdn", "models/weapons/ak47.glb"), "https://cdn.skinhub.gg/models/weapons/ak47.glb");
  for (const [provider,path] of [["other","data/x.json"],["viewer","api/auth"],["cdn","../secret"],["cdn","models/%2e%2e/x.glb"],["cdn","models/x.glb?token=1"],["viewer","_next/static/x.html"],["cdn","models//x.glb"]])
    assert.equal(viewerResourceUrl(provider,path),null);
  const origin = "https://tapped.ro";
  assert.equal(browserViewerAssetUrl(`${origin}/api/economy/render-assets/cdn/models/test.glb`, origin), `${origin}/api/economy/render-assets/cdn/models/test.glb`);
  for (const url of ["https://evil.test/api/economy/render-assets/cdn/data/test.json", `${origin}/api/health`, `${origin}/api/economy/render-assets/viewer/_next/static/test.js`, `${origin}/api/economy/render-assets/cdn/data/test.json?auth=1`, `${origin}/api/economy/render-assets/../../../api/auth.json`])
    assert.equal(browserViewerAssetUrl(url, origin), null);
});

test("proxy rewrites the runtime prefix consistently and confines the frame to script-only sandbox", () => {
  const root="https://tapped.ro";
  const source='"/_next/static/x.js";const prefix="/_next/";const cdn="https://cdn.skinhub.gg/models/a.glb";';
  const rewritten=rewriteViewerResource(source,root);
  assert.ok(rewritten.includes('"/api/economy/render-assets/viewer/_next/"'));
  assert.ok(rewritten.includes('https://tapped.ro/api/economy/render-assets/cdn/models/a.glb'));
  assert.equal(rewriteViewerResource(rewritten,root),rewritten);
  const policy=viewerFramePolicy(root);
  assert.match(policy,/sandbox allow-scripts;/);
  assert.doesNotMatch(policy,/allow-same-origin/);
  assert.match(policy,/connect-src https:\/\/tapped.ro\/api\/economy\/render-assets\//);
  assert.match(policy,/form-action 'none'/);
});

test("frame resource URLs and CSP use the public host behind Next and the hosting TLS proxy", () => {
  assert.equal(viewerRequestOrigin(new Request("http://localhost:3000/api/economy/render-frame", { headers: { host: "tapped.ro", "x-forwarded-proto": "https" } })), "https://tapped.ro");
  assert.equal(viewerRequestOrigin(new Request("http://localhost:4391/api/economy/render-frame", { headers: { host: "127.0.0.1:4391" } })), "http://127.0.0.1:4391");
  assert.throws(() => viewerRequestOrigin(new Request("http://localhost:3000", { headers: { host: 'evil.test/path?bad=1' } })));
});

test("asset fetches coalesce, survive restart and preserve cached resources during an upstream outage", async () => {
  const directory=await mkdtemp(join(tmpdir(),"arena-viewer-test-"));
  try {
    let calls=0;
    const fetcher=async (_url: string, options: RequestInit) => {calls++;assert.equal(options.redirect,"error");assert.equal(options.credentials,"omit");assert.equal(options.headers,undefined);return new Response("asset",{headers:{"Content-Type":"application/javascript","Cache-Control":"public,max-age=3600"}});};
    const cache=createViewerResourceCache({directory,fetcher});
    const url="https://skinhub.gg/_next/static/test.js";
    const values=await Promise.all([cache.get(url),cache.get(url)]);
    assert.equal(calls,1);assert.equal(values[0].bytes.toString(),"asset");
    // Expire the on-disk entry to exercise stale-on-error, not just a fresh hit.
    const meta = (await readdir(directory)).find(name => name.endsWith(".json"))!;
    const info = JSON.parse(await readFile(join(directory,meta),"utf8"));
    await writeFile(join(directory,meta),JSON.stringify({...info,storedAt:1}));
    const restarted=createViewerResourceCache({directory,fetcher:async()=>{throw new Error("offline");}});
    assert.equal((await restarted.get(url)).bytes.toString(),"asset");
    await assert.rejects(restarted.get("https://skinhub.gg/_next/static/missing.js"));
  } finally {await removeFixture(directory);}
});

test("error pages and oversized assets are never published as successful resources", async () => {
  const directory=await mkdtemp(join(tmpdir(),"arena-viewer-test-"));
  try {
    for(const response of [new Response("bad",{status:525}),new Response("oversized",{headers:{"Content-Length":"999999999"}}),new Response("<html>Cloudflare error</html>",{headers:{"Content-Type":"text/html"}})]) {
      const cache=createViewerResourceCache({directory,fetcher:async()=>response});
      await assert.rejects(cache.get("https://cdn.skinhub.gg/models/test.glb"));
    }
    assert.equal((await readdir(directory)).length,0);
  } finally {await removeFixture(directory);}
});

test("asset downloads are bounded, and disk cache evicts old files before exceeding its budget", async () => {
  const directory=await mkdtemp(join(tmpdir(),"arena-viewer-test-"));
  try {
    let active=0,peak=0;
    const cache=createViewerResourceCache({directory,maxBytes:20,fetcher:async()=>{
      peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,10));active--;return new Response("12345");
    }});
    await Promise.all(Array.from({length:10},(_,i)=>cache.get(`https://cdn.skinhub.gg/models/${i}.glb`)));
    assert.ok(peak<=4);
    assert.equal((await readdir(directory)).filter(name=>name.endsWith(".data")).length,4);
    const unbounded=createViewerResourceCache({directory,maxAssetBytes:3,fetcher:async()=>new Response("too big without Content-Length")});
    await assert.rejects(unbounded.get("https://cdn.skinhub.gg/models/large.glb"),/too large/);
  } finally {await removeFixture(directory);}
});
