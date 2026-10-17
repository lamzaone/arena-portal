import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const playerId = "76561198000000001";
const issuerId = "76561198000000002";
const records = [
  { id: 1, steamId: playerId, playerName: "Arena player", expiresAt: 0, length: 0, reason: "Cheating", adminSteamId: issuerId, adminName: "Moderator", global: true, createdAt: 1760000000 },
  { id: 2, steamId: "76561198000000003", playerName: "Timed player", expiresAt: 4102444800, length: 3600, reason: "Repeated disruption", adminSteamId: "0", adminName: "Console", global: false, createdAt: 1760000000 },
  { id: 3, steamId: "76561198000000004", playerName: "Former player", expiresAt: 1750000000, length: 3600, reason: "Expired record", adminSteamId: "0", adminName: "Console", global: false, createdAt: 1749990000 },
];

test("public bans access, navigation, and responsive presentation", async (t) => {
  const boundaries = {
    "@/lib/auth/session": "export const getSession=async()=>window.fixtureState==='guest'?null:{steamId:'76561198000000001'};",
    "@/lib/admin/access": "export const getAdminAccess=async()=>{window.fixtureAuthChecks++;return {isAdmin:window.fixtureState==='admin'}};",
    "@/lib/data/bans": `export const getBansPage=async(page,query)=>{window.fixtureRead={page,query};return {available:window.fixtureState!=='unavailable',bans:['empty','unavailable'].includes(window.fixtureState)?[]:${JSON.stringify(records)},total:window.fixtureState==='empty'?0:26,page,pageSize:25};};`,
    "@/lib/player-identities": "export const resolvePlayerIdentities=async seeds=>Object.fromEntries(seeds.map(seed=>[seed.steamId,{...seed,displayName:seed.displayName||'Steam account',avatarUrl:null,presence:'offline',profileThemeKey:null,identityGroups:[]}]));",
    "@/components/ui/portal-shell": "import React from 'react'; export const PortalShell=({children,className,authenticated})=><main className={'tapped-page portal-page '+className} data-authenticated={String(authenticated)}><div className='shell'>{window.fixtureHeader}{children}</div></main>;",
    "next/link": "import React from 'react'; export default function Link({children,scroll,prefetch,...props}){return <a {...props}>{children}</a>}",
    "next/image": "import React from 'react'; export default function Image({priority,fill,unoptimized,...props}){return <img {...props}/>}",
    "next/navigation": "export const useRouter=()=>({replace(){},push(){}}); export const usePathname=()=>'/bans'; export const useSearchParams=()=>new URLSearchParams(); export const redirect=href=>{window.fixtureRedirect=href;throw Error('fixture redirect')};",
  };
  const bundle = await build({
    stdin: { contents: "import React from 'react';import {createRoot} from 'react-dom/client';import BansPage from './app/bans/page';import LegacyWarnings from './app/warnings/page';import {SiteHeader} from './components/site-header';window.fixtureState=new URLSearchParams(location.search).get('state')||'guest';window.fixtureAuthChecks=0;(async()=>{const params={q:'Arena & friend',page:'1'};if(window.fixtureState==='legacy'){try{await LegacyWarnings({searchParams:Promise.resolve(params)})}catch{}return;}window.fixtureHeader=await SiteHeader({authenticated:window.fixtureState!=='guest'});createRoot(document.getElementById('root')).render(await BansPage({searchParams:Promise.resolve(params)}));})();", loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "public-page-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const layout = await readFile(resolve("app/layout.tsx"), "utf8");
  const stylesheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => match[1]);
  const css = (await Promise.all(stylesheets.map(path => readFile(resolve("app", path), "utf8")))).join("\n")
    + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const emblem = await readFile(resolve("public/images/branding/tapped-emblem.svg"));
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (request.url === "/images/branding/tapped-emblem.svg") { response.setHeader("content-type", "image/svg+xml"); response.end(emblem); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html class="global-theme-default" data-theme="default" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    async function withPage(state, width, check) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/?state=${state}`);
        await page.getByRole("heading", { name: "Bans", exact: true }).waitFor();
        await check(page);
        if (process.env.CAPTURE_MODERATION_PREVIEWS === "1" && state === "guest" && [375, 1440].includes(width)) {
          await mkdir(resolve(".cache/moderation-previews"), { recursive: true });
          await page.keyboard.press("Escape");
          await page.evaluate(() => document.activeElement?.blur());
          await page.screenshot({ path: resolve(`.cache/moderation-previews/bans-${width}.png`), fullPage: true });
        }
        assert.deepEqual(errors, []);
        const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== "fixed").slice(0, 12).map(el => `${el.tagName}.${el.className}: ${Math.round(el.getBoundingClientRect().right)}`) }));
        assert.ok(overflow.scrollWidth <= width, JSON.stringify(overflow));
      } catch (error) { throw new Error(`${error.message}\nBrowser errors: ${errors.join("; ")}`); }
      finally { await page.close(); }
    }
    await t.test("guests, members and administrators see the same read-only records", async () => {
      for (const state of ["guest", "member", "admin"]) for (const width of [375, 1101, 1440]) await withPage(state, width, async page => {
        assert.equal(await page.locator("tbody tr").count(), 3);
        assert.equal(await page.locator('section[aria-labelledby="ban-history-title"] form[method="post"],section[aria-labelledby="ban-history-title"] input[name="csrf"]').count(), 0);
        assert.equal(await page.evaluate(() => window.fixtureAuthChecks), state === "guest" ? 0 : 1);
        assert.equal(await page.getByRole("columnheader", { name: "Action", exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: /unban|issue|revoke|ban player/i }).count(), 0);
        assert.equal(await page.getByText("Permanent", { exact: true }).count(), 1);
        assert.equal(await page.getByText("Expired", { exact: true }).count(), 1);
        assert.equal(await page.locator(`tbody a[href="/players/${playerId}"]`).count(), 1);
        assert.equal(await page.locator(`a[href="/players/${issuerId}"]`).count(), 1);
        assert.equal(await page.locator('a[href="/players/0"]').count(), 0);
      });
    });
    await t.test("search, paging and desktop/phone navigation retain their semantics", async () => {
      for (const width of [375, 768, 1024, 1440]) await withPage("guest", width, async page => {
        assert.equal(await page.getByRole("searchbox", { name: "Player name or SteamID", exact: true }).inputValue(), "Arena & friend");
        const form = page.locator('form[action="/bans"]');
        assert.equal((await form.getAttribute("method")).toLowerCase(), "get");
        const next = new URL(await page.getByRole("link", { name: "Next", exact: false }).getAttribute("href"), "https://tapped.ro");
        assert.equal(next.pathname, "/bans");
        assert.equal(next.searchParams.get("q"), "Arena & friend");
        assert.equal(next.searchParams.get("page"), "2");
        if (width <= 1100) await page.getByRole("button", { name: "Open navigation menu" }).click();
        const visibleBans = page.getByRole("link", { name: /Bans/ }).filter({ visible: true });
        await visibleBans.waitFor({ state: "visible" });
        assert.equal(await visibleBans.count(), 1);
        assert.equal(await visibleBans.getAttribute("aria-current"), "page");
        assert.equal(await page.getByRole("link", { name: /Warn/ }).count(), 0);
        await page.getByRole("region", { name: "Public server ban records" }).focus();
        assert.equal(await page.getByRole("region", { name: "Public server ban records" }).evaluate(el => el === document.activeElement), true);
      });
    });
    await t.test("empty and unavailable storage produce different accessible states", async () => {
      await withPage("empty", 375, async page => {
        assert.match(await page.getByRole("status").textContent(), /No bans match/i);
        assert.equal(await page.locator("table").count(), 0);
      });
      await withPage("unavailable", 375, async page => {
        assert.match(await page.getByRole("status").textContent(), /temporarily unavailable/i);
        assert.equal(await page.locator("table").count(), 0);
      });
    });
    await t.test("legacy public warnings URLs redirect to the new bans page", async () => {
      const page = await browser.newPage();
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/?state=legacy`);
        await page.waitForFunction(() => window.fixtureRedirect);
        assert.equal(await page.evaluate(() => window.fixtureRedirect), "/bans");
      } finally { await page.close(); }
    });
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
