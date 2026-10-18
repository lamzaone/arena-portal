import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("staff inventory cards, searches and refresh-all feedback work across viewport sizes", async () => {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import Page from './app/admin/inventories/page';
      import {RefreshAllPrices} from './app/admin/items/refresh-all-prices';
      window.requests=[];
      const root=createRoot(document.getElementById('root'));
      root.render(location.pathname==='/refresh-prices' ? <RefreshAllPrices csrf="test"/> : await Page({searchParams:Promise.resolve({steamId:'76561198000000001',inventoryPageSize:'12'})}));`,
      loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", format: "esm", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": '{}' },
    plugins: [{ name: "boundaries", setup(builder) {
      const modules = {
        "next/navigation": `const router={replace(href){window.requests.push(href)},push(href){window.requests.push(href)},prefetch(){},refresh(){}};export const useRouter=()=>router;export const usePathname=()=>'/admin/inventories';export const useSearchParams=()=>new URLSearchParams(location.search);`,
        "next/link": `import React from 'react';export default function Link({children,href,...props}){return <a href={href} {...props}>{children}</a>}`,
        "node:crypto": "export const randomUUID=()=>crypto.randomUUID();",
        "@/lib/auth/session": `export async function getSession(){return {steamId:'76561198000000001'}}export function createAdminActionToken(){return 'test'}`,
        "@/lib/admin/access": `export async function getAdminAccess(){return {isAdmin:true,canViewEconomy:true,canManageEconomy:true,canGrantEconomyItems:false}}`,
        "@/lib/player-identities": `export async function resolvePlayerIdentities(){return {}}`,
        "@/lib/data/portal-repository": `
          const account={steamId:'76561198000000001',displayName:'Player with a long display name',wallet:{balance:100,lifetimeEarned:200,lifetimeSpent:100},inventoryCount:12,pendingIncomingTrades:0,pendingOutgoingTrades:0,loadout:[],loadoutCandidates:[],inventory:{total:12,page:1,pageSize:12,items:Array.from({length:12},(_,i)=>({id:'instance-long-identifier-'+i,displayName:'StatTrak™ AK-47 | A very long inventory item name',itemType:'skin',rarityRank:4,state:'available',floatValue:0.13,seed:123,tradable:true,nametag:'A long custom nametag',equippedSlotKeys:[],stickers:[],attributes:{},catalogue:null,stattrak:true,stattrakCount:5}))}};
          export async function findStaffEconomyAccounts(){return {accounts:[account],total:1,page:1,pageSize:24}}
          export async function getStaffEconomyAccount(){return account}
          export async function getEconomyCatalogue(){return {items:[],total:0,page:1,pageSize:20}}`,
        "@/components/ui/portal-shell": `import React from 'react';export const PortalShell=({children,className})=><main className={'shell '+className}>{children}</main>;`,
        "@/components/staff-submenu": "export const StaffSubmenu=()=>null;",
        "@/components/ui/admin-page-header": "export const AdminPageHeader=()=>null;",
        "@/components/economy/staff-grant-item-form": "export const StaffGrantItemForm=()=>null;",
        "@/components/economy/marketplace-item-preview": `import React from 'react';export const MarketplaceItemPreview=()=> <div className="economy-item-preview" aria-label="Item artwork"><span>AK-47</span></div>;`,
        "@/components/adaptive-player-hover-card": `export const AdaptivePlayerHoverCard=()=>null;`,
      };
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in modules ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: modules[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const css = await readFile("app/globals.css", "utf8") + "\n" + bundle.outputFiles.find(file => file.path.endsWith(".css")).text;
  const server = createServer((req, res) => {
    res.setHeader("content-type", req.url === "/fixture.js" ? "text/javascript" : req.url === "/fixture.css" ? "text/css" : "text/html");
    res.end(req.url === "/fixture.js" ? js : req.url === "/fixture.css" ? css : '<html><head><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch();
  await mkdir(".cache/staff-inventories", { recursive: true });
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/players/search?*", route => route.fulfill({ json: { players: [{ steamId: "76561198000000002", displayName: "Another player", avatarUrl: null, presence: "offline", identityGroups: [] }] } }));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/admin/inventories`);
        await page.locator(".staff-inventory-item").first().waitFor();
        assert.deepEqual(errors, []);
        const overflow = await page.locator(".staff-inventory-item").first().evaluate(card => ({
          width: card.clientWidth, content: card.scrollWidth,
          preview: card.querySelector(".economy-item-preview").getBoundingClientRect().right,
          edge: card.getBoundingClientRect().right,
        }));
        assert.ok(overflow.content <= overflow.width + 1, `card content overflows at ${width}px: ${JSON.stringify(overflow)}`);
        assert.ok(overflow.preview <= overflow.edge + 1, `artwork overflows at ${width}px`);
        const pageOverflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(el => `${el.tagName}.${el.className}: ${el.getBoundingClientRect().right}`));
        assert.deepEqual(pageOverflow, [], `page overflows at ${width}px`);
        const inventorySearch = page.getByRole("searchbox", { name: "Search inventory" });
        assert.ok((await inventorySearch.boundingBox()).width > 170, `inventory search input uses its control width at ${width}px`);
        await inventorySearch.fill("Doppler");
        await page.waitForFunction(() => window.requests.some(href => new URL(href, location.origin).searchParams.get("inventoryQ") === "Doppler"));
        assert.equal(await page.evaluate(() => new URL(window.requests.at(-1), location.origin).searchParams.get('steamId')), '76561198000000001');
        await page.getByRole("button", { name: "Clear search inventory" }).click();
        await page.locator(".economy-admin-edit > summary").first().click();
        assert.equal(await page.locator(".staff-inventory-item").first().evaluate(card => card.scrollWidth > card.clientWidth + 1), false, `expanded item editor fits at ${width}px`);
        await page.locator(".economy-admin-edit > summary").first().click();
        const search = page.getByRole("combobox", { name: "Search player" });
        assert.ok((await search.boundingBox()).width >= 140, "directory search has usable typing width");
        await search.fill("Another");
        await page.getByRole("option", { name: /Another player/ }).click();
        await page.waitForFunction(() => window.requests.some(href => new URL(href, location.origin).searchParams.get("steamId") === "76561198000000002"));
        await page.getByRole("link", { name: /Selected inventory for/ }).focus();
        assert.equal(await page.locator(".staff-player-result-row").getAttribute("data-player-owner"), "76561198000000001");
        await page.screenshot({ path: `.cache/staff-inventories/${width}.png`, fullPage: true });
      } finally { await page.close(); }
    }
    const page = await browser.newPage();
    try {
      let finish;
      let requests = 0;
      await page.route("**/api/admin/economy/prices/refresh", async route => {
        requests++;
        assert.deepEqual(route.request().postDataJSON(), { csrf: "test" });
        await new Promise(resolve => { finish = resolve; });
        await route.fulfill({ json: requests === 1 ? { status: "busy" } : { status: "refreshed", scanned: 1350, updated: 1200, variantCached: 4000 } });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/refresh-prices`);
      const refresh = page.getByRole("button", { name: "Refresh all prices", exact: true });
      await refresh.click();
      await page.waitForFunction(() => document.querySelector('button').disabled);
      assert.match(await page.getByRole("status").textContent(), /few minutes/);
      finish();
      await page.getByText("A price refresh is already running.", { exact: false }).waitFor();
      await refresh.click();
      await page.waitForFunction(() => document.querySelector('button').disabled);
      finish();
      await page.getByText("Checked 1350 products; updated 1200 prices and cached 4000 market variants.", { exact: true }).waitFor();
      assert.equal(requests, 2);
    } finally { await page.close(); }
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
