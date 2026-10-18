import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("Discord linking refreshes committed server state and prevents overlapping requests", async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from'react';import{createRoot}from'react-dom/client';import{DiscordLinkForm}from'./app/discord-link/link-form';
        window.fixtureRequests=[];window.fixtureRefreshes=0;
        window.fetch=(path,options)=>new Promise(resolve=>{window.fixtureRequests.push({path,payload:JSON.parse(options.body)});window.fixtureRespond=(status,body)=>resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}))});
        createRoot(document.getElementById('root')).render(<DiscordLinkForm csrf='fixture-csrf' initialLink={null} available/>);`,
      loader: "tsx", resolveDir: process.cwd(),
    },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "discord-client-boundary", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const useRouter=()=>({refresh(){window.fixtureRefreshes++}})", loader: "js" }));
    } }],
  });
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const css = bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const input = page.getByLabel("Discord link code", { exact: true });
      await input.fill("ABCD-1234-EF56");
      await page.evaluate(() => {
        const form = document.querySelector("form");
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      assert.equal(await page.evaluate(() => window.fixtureRequests.length), 1);
      assert.equal(await input.isDisabled(), true);
      assert.equal(await page.evaluate(() => window.fixtureRefreshes), 0);
      assert.equal(await page.evaluate(() => window.fixtureRequests[0].payload.csrf), "fixture-csrf");
      await page.evaluate(() => window.fixtureRespond(200, { ok: true, link: { steamId: "76561198000000001", discordUserId: "123456789123456789", linkedAt: "2026-10-18T10:00:00.000Z" } }));
      await page.getByRole("heading", { name: "Discord connected", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.fixtureRefreshes), 1);

      await page.reload();
      await input.fill("ABCD-1234-EF56");
      await page.locator('button[type="submit"]').click();
      await page.evaluate(() => window.fixtureRespond(400, { ok: false, message: "That code has expired." }));
      await page.getByRole("alert").filter({ hasText: "That code has expired." }).waitFor();
      assert.equal(await page.evaluate(() => window.fixtureRefreshes), 0);
      assert.equal(await input.inputValue(), "ABCD-1234-EF56");
      assert.equal(await input.isEnabled(), true);
      assert.equal(await page.locator('button[type="submit"]').isEnabled(), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
