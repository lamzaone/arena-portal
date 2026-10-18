import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("action guards and confirmed mutation refreshes work through the browser", async t => {
  const navigationStub = `import {useSyncExternalStore,useMemo} from 'react';
    const subscribe=fn=>{window.addEventListener('fixture:navigation',fn);return()=>window.removeEventListener('fixture:navigation',fn)};
    const move=(url)=>setTimeout(()=>{history.pushState(null,'',url);window.dispatchEvent(new Event('fixture:navigation'))},70);
    const router={push:move,replace:move,refresh(){window.fixtureRefreshes.push(location.pathname+location.search)}};
    export const useRouter=()=>router;
    export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);
    export const useSearchParams=()=>{const value=useSyncExternalStore(subscribe,()=>location.search);return useMemo(()=>new URLSearchParams(value),[value])};`;
  const bundle = await build({
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import{ButtonActionGuard}from'./components/ui/button-action-guard';
      import{ProgressiveFormRuntime}from'./components/ui/progressive-form-runtime';
      import{ModerationActionRuntime}from'./components/ui/moderation-action-runtime';
      window.fixtureClicks=0;window.fixtureRefreshes=[];
      createRoot(document.getElementById('root')).render(<><ButtonActionGuard/><ProgressiveFormRuntime/><ModerationActionRuntime/>
      <main><button onClick={()=>window.fixtureClicks++}>Client action</button><form action='/api/mutation' method='post'>
      <input name='item' value='7' readOnly/><button name='action' value='ban'>Submit action</button></form></main></>);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "runtime-boundaries", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: navigationStub, loader: "jsx", resolveDir: process.cwd() }));
      builder.onResolve({ filter: /navigation-progress$/ }, () => ({ path: "progress", namespace: "progress" }));
      builder.onLoad({ filter: /.*/, namespace: "progress" }, () => ({ contents: "export const announceNavigationStart=()=>{}", loader: "js" }));
    } }],
  });
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else { response.setHeader("content-type", "text/html"); response.end("<!doctype html><html><body><div id='root'></div><script src='/fixture.js'></script></body></html>"); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function withPage(path, run) {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(6_000);
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(origin + path);
        await page.getByRole("button", { name: "Client action" }).waitFor();
        await run(page);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    }
    await t.test("rapid mouse and programmatic submits are suppressed with a 500ms cooldown", async () => {
      await withPage("/admin/bans", async page => {
        let calls = 0;
        await page.route("**/api/mutation", async route => { calls++; await route.fulfill({ json: { ok: true, message: "Saved" } }); });
        await page.getByRole("button", { name: "Client action" }).evaluate(button => { button.click(); button.click(); });
        assert.equal(await page.evaluate(() => window.fixtureClicks), 1);
        await page.locator("form").evaluate(form => { form.requestSubmit(form.querySelector("button")); form.requestSubmit(form.querySelector("button")); });
        await page.waitForFunction(() => window.fixtureRefreshes.length === 1);
        assert.equal(calls, 1);
        assert.equal(await page.getByRole("button", { name: "Submit action" }).isDisabled(), true);
        await page.waitForFunction(() => !document.querySelector("form button").disabled);
        await page.getByRole("button", { name: "Submit action" }).click();
        await page.waitForFunction(() => window.fixtureRefreshes.length === 2);
        assert.equal(calls, 2);
      });
    });
    await t.test("in-flight forms stay locked after the minimum cooldown and refresh their destination", async () => {
      await withPage("/admin/bans", async page => {
        let calls = 0;
        let complete;
        const response = new Promise(done => { complete = done; });
        await page.route("**/api/mutation", async route => { calls++; await response; await route.fulfill({ json: { ok: true, redirect: `${origin}/admin/bans?notice=saved` } }); });
        await page.getByRole("button", { name: "Submit action" }).click();
        await page.waitForTimeout(550);
        await page.locator("form").evaluate(form => form.requestSubmit(form.querySelector("button")));
        assert.equal(calls, 1);
        assert.equal(await page.getByRole("button", { name: "Submit action" }).isDisabled(), true);
        complete();
        await page.waitForFunction(() => window.fixtureRefreshes.includes('/admin/bans?notice=saved'));
        assert.equal(await page.evaluate(() => window.fixtureRefreshes.includes('/admin/bans')), false, "refresh must target the destination after it commits");
      });
    });
    await t.test("queued moderation refreshes only after server confirmation and never repeats the mutation", async () => {
      await withPage("/admin/bans?notice=gag-queued-7", async page => {
        // The initial request may already be in flight; subsequent polls are controlled.
        let polls = 0;
        await page.route("**/api/admin/moderation/status?job=7", async route => {
          polls++; await route.fulfill({ json: { status: polls < 2 ? "processing" : "completed", action: "gag" } });
        });
        await page.waitForFunction(() => window.fixtureRefreshes.length > 0);
        assert.ok(polls >= 2);
        await page.waitForURL(url => !url.searchParams.has('notice'));
        assert.equal(await page.evaluate(() => window.fixtureRefreshes.every(url => !url.includes('notice='))), true, "confirmation refresh must happen after clearing the queued notice");
        assert.match(await page.locator("body").textContent(), /Gag confirmed by the server/);
      });
    });
    await t.test("redirects with encoded warning messages still refresh their destination", async () => {
      await withPage("/admin/warnings", async page => {
        await page.route("**/api/mutation", route => route.fulfill({ json: { ok: true, redirect: `${origin}/admin/warnings?notice=Warning%20issued` } }));
        await page.getByRole("button", { name: "Submit action" }).click();
        await page.waitForFunction(() => window.fixtureRefreshes.includes('/admin/warnings?notice=Warning%20issued'));
      });
    });
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
