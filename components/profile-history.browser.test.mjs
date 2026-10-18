import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("profile histories expand, paginate independently and keep server presence public", async (t) => {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ProfileModerationHistory} from './components/profile-moderation-history';import {ProfileHistoryList} from './components/profile-history-list';import {ProfileHistoryPagination} from './components/profile-history-pagination';import {PlayerServerPresence} from './components/player-server-presence';
const query=new URLSearchParams(location.search);const pages={warnings:Number(query.get('warningsPage')||1),bans:Number(query.get('bansPage')||1),comms:Number(query.get('commsPage')||1)};const steamId='76561198000000001';const records=Array.from({length:32},(_,index)=>({id:32-index,reason:'Restriction '+(32-index),adminName:'Moderator',adminSteamId:null,expiresAt:0,createdAt:1750000000,length:0}));const history={bans:{available:true,total:32,page:pages.bans,pageSize:10,records:records.slice((pages.bans-1)*10,pages.bans*10)},sanctions:{available:true,total:32,page:pages.comms,pageSize:10,records:records.slice((pages.comms-1)*10,pages.comms*10).map(row=>({...row,kind:'Mute'}))}};const warnings=Array.from({length:23},(_,index)=><li key={index}>Warning {23-index}</li>).slice((pages.warnings-1)*10,pages.warnings*10);
createRoot(document.getElementById('root')).render(<main data-ready className='player-profile-page'><div className='tapped-kicker'>Player profile <PlayerServerPresence steamId={steamId}/></div><section aria-label='Warnings' className='panel'><h2>Warnings</h2><ProfileHistoryList items={warnings} total={23} page={pages.warnings} label='warnings' pagination={<ProfileHistoryPagination steamId={steamId} kind='warnings' pages={pages} page={pages.warnings} pageSize={10} total={23}/>}/></section><ProfileModerationHistory steamId={steamId} bans={[]} sanctions={[]} history={history} pages={pages}/></main>);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "fixture-link", setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, ({ path }) => ({ path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "import React from 'react';export default function Link({children,prefetch,scroll,...props}){return <a {...props}>{children}</a>}", loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const layout = await readFile(resolve("app/layout.tsx"), "utf8");
  const css = (await Promise.all([...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => readFile(resolve("app", match[1]), "utf8")))).join("\n") + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (request.url === "/api/server-status") {
      const state = new URL(request.headers.referer || "/", "http://localhost").searchParams.get("presence") || "online";
      const now = new Date().toISOString();
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ state: state === "unknown" ? "lost" : "online", players: state === "online" ? 1 : 0, maxPlayers: 32, bots: 0, map: "de_mirage", checkedAt: now, lastSeenAt: now, roster: state === "online" ? [{ steamId: "76561198000000001", name: "Player" }] : [] }));
    } else {
      const theme = new URL(request.url, "http://localhost").searchParams.get("theme") || "default";
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><html data-theme="${theme}" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root" style="max-width:1050px;margin:auto;padding:16px"></div><script src="/fixture.js"></script></body></html>`);
    }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function withPage(query, width, check) {
      const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`${origin}/?${query}`);
        await page.locator("[data-ready]").waitFor();
        await check(page);
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      } finally { await page.close(); }
    }
    await t.test("all histories show three recent records, expand to ten and keep bans above gags and mutes at every width", async () => {
      for (const theme of ["default", "tap_god", "beta_tester"]) for (const width of [390, 1440]) await withPage(`theme=${theme}`, width, async page => {
        const bans = page.locator('article[aria-labelledby="moderation-bans-title"]');
        const comms = page.locator('article[aria-labelledby="moderation-comms-title"]');
        const warnings = page.getByRole("region", { name: "Warnings", exact: true });
        for (const section of [warnings, bans, comms]) assert.equal(await section.getByRole("listitem").count(), 3);
        assert.equal(await page.getByRole("navigation", { name: /history pages/ }).count(), 0);
        const banBox = await bans.boundingBox(); const commsBox = await comms.boundingBox();
        assert.ok(commsBox.y >= banBox.y + banBox.height, "Gags and mutes must stay below bans");
        for (const section of [warnings, bans, comms]) {
          await section.getByRole("button", { name: /Show more/ }).click();
          assert.equal(await section.getByRole("listitem").count(), 10);
          assert.equal(await section.getByRole("button", { name: /Show less/ }).getAttribute("aria-expanded"), "true");
          await section.getByRole("navigation").waitFor();
          await section.getByRole("button", { name: /Show less/ }).click();
          assert.equal(await section.getByRole("listitem").count(), 3);
        }
      });
    });
    await t.test("pagination retains the other history pages and opens older records immediately", async () => {
      await withPage("warningsPage=1&bansPage=3&commsPage=2", 390, async page => {
        const warnings = page.getByRole("region", { name: "Warnings", exact: true });
        await warnings.getByRole("button", { name: /Show more/ }).click();
        const next = warnings.getByRole("link", { name: "Next" });
        assert.equal(await next.getAttribute("href"), "/players/76561198000000001?warningsPage=2&bansPage=3&commsPage=2#warning-history-title");
        await next.click();
        await page.getByRole("region", { name: "Warnings", exact: true }).getByText("Warning 13", { exact: true }).waitFor();
        assert.equal(await page.getByRole("region", { name: "Warnings", exact: true }).getByRole("listitem").count(), 10);
        assert.equal(await page.locator('article[aria-labelledby="moderation-bans-title"]').getByRole("listitem").count(), 10);
      });
    });
    await t.test("everyone can distinguish online, offline and unavailable server presence", async () => {
      for (const [presence, label] of [["online", "Online on server"], ["offline", "Offline"], ["unknown", "Server status unavailable"]]) await withPage(`presence=${presence}`, 390, async page => {
        await page.locator(`[data-server-presence="${presence}"]`).getByText(label, { exact: true }).waitFor();
      });
    });
    await t.test("a last confirmed online roster expires when subsequent status requests fail", async () => {
      await withPage("", 390, async page => {
        await page.clock.install();
        let requests = 0;
        await page.route("**/api/server-status", route => {
          requests++;
          if (requests > 1) return route.abort();
          const now = Date.now();
          return route.fulfill({ json: { state: "online", players: 1, maxPlayers: 32, bots: 0, map: "de_mirage", checkedAt: new Date(now).toISOString(), lastSeenAt: new Date(now - 44_000).toISOString(), roster: [{ steamId: "76561198000000001", name: "Player" }] } });
        });
        await page.reload();
        await page.locator('[data-server-presence="online"]').waitFor();
        await page.clock.fastForward(2_000);
        await page.locator('[data-server-presence="unknown"]').waitFor();
      });
    });
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
