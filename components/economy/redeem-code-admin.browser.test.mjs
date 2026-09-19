import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("redeem admin edits quantities, confirms actions, and safely retries at desktop and mobile sizes", async () => {
  const itemName = "StatTrak™ AK-47 | A very long souvenir item name with its full Factory New finish";
  const props = {
    csrf: "fixture-csrf", searchQuery: "",
    catalogue: [{ id: 7, displayName: itemName, itemType: "weapon", rarityRank: 5, rarityName: "Classified", imageUrl: null }],
    codes: [{ id: 12, displayName: "Summer rewards", codeHint: "SUM…026", enabled: true,
      tokenAmount: 100, maxRedemptions: 10, redemptionCount: 5,
      rewards: [{ catalogueId: 7, displayName: itemName, quantity: 5, rarityRank: 5 }] }],
  };
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {RedeemCodeAdmin} from './components/economy/redeem-code-admin'; createRoot(document.getElementById('root')).render(<RedeemCodeAdmin {...${JSON.stringify(props)}} />);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "fixture-boundaries", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
      builder.onResolve({ filter: /marketplace-item-preview$/ }, () => ({ path: "preview", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        contents: path === "navigation"
          ? "export const useRouter=()=>({refresh(){window.fixtureRefreshes=(window.fixtureRefreshes||0)+1}}); export const usePathname=()=>'/'; export const useSearchParams=()=>new URLSearchParams();"
          : "import React from 'react'; export function MarketplaceItemPreview(){return React.createElement('div',{className:'economy-item-preview'},React.createElement('div',{className:'economy-item-preview-fallback'}))}", loader: "js", resolveDir: process.cwd(),
      }));
    } }],
  });
  const javascript = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
  const css = await readFile(resolve("app/globals.css"), "utf8") + bundle.outputFiles.find((file) => file.path.endsWith(".css")).text;
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"></head><body><main id="root" style="max-width:1200px;margin:auto;padding:12px"></main><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [1280, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(10_000);
      const requests = [];
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let restartAttempts = 0;
      await page.route("**/api/admin/redeem-codes", async (route) => {
        const request = route.request().postDataJSON();
        requests.push(request);
        if (request.action === "restart" && restartAttempts++ === 0) {
          await route.fulfill({ status: 503, json: { ok: false, message: "Please retry this action." } });
        } else {
          await route.fulfill({ status: 200, json: { ok: true, result: { revealedCode: "TEST-CODE" } } });
        }
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole("button", { name: "Add", exact: true }).click();
      const quantity = page.getByRole("textbox", { name: `Quantity for ${itemName}`, exact: true });
      await quantity.fill("");
      assert.equal(await quantity.inputValue(), "");
      await quantity.fill("25");
      await page.getByPlaceholder("TAPPD-SUMMER-2026").fill("TEST-CODE");
      await page.getByRole("textbox", { name: "Internal label", exact: true }).fill("Typed quantities");
      await quantity.fill("51");
      await page.getByRole("button", { name: "Create redeem code", exact: true }).click();
      assert.equal(requests.length, 0);
      await page.getByRole("alert").filter({ hasText: "Enter a whole quantity" }).waitFor();
      await quantity.fill("25");
      for (const selector of [".redeem-selected-rewards li > span", ".redeem-picker-item strong", ".redeem-card-rewards li > span:last-child"]) {
        assert.equal(await page.locator(selector).textContent(), itemName);
        assert.equal(await page.locator(selector).evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
        assert.notEqual(await page.locator(selector).evaluate((element) => getComputedStyle(element).whiteSpace), "nowrap");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole("button", { name: "Create redeem code", exact: true }).click();
      await page.waitForFunction(() => window.fixtureRefreshes === 1);
      assert.deepEqual(requests[0].rewards, [{ catalogueId: 7, quantity: 25 }]);
      await page.getByRole("button", { name: "Restart code", exact: true }).click();
      let dialog = page.getByRole("dialog");
      assert.match(await dialog.textContent(), /including previous claimants/);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(requests.length, 1);
      await page.getByRole("button", { name: "Restart code", exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Restart code", exact: true }).click();
      await dialog.getByRole("alert").waitFor();
      await dialog.getByRole("button", { name: "Restart code", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(requests[1].action, "restart");
      assert.equal(requests[1].codeId, 12);
      assert.equal(requests[1].idempotencyKey, requests[2].idempotencyKey);
      assert.equal(requests[1].csrf, "fixture-csrf");
      await page.getByRole("button", { name: "Remove code", exact: true }).click();
      dialog = page.getByRole("dialog");
      assert.match(await dialog.textContent(), /Previously awarded rewards and claim history are kept/);
      await dialog.getByRole("button", { name: "Remove code", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(requests[3].action, "remove");
      assert.equal(requests[3].codeId, 12);
      assert.notEqual(requests[2].idempotencyKey, requests[3].idempotencyKey);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
});
