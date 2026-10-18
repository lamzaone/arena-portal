import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("homepage and Features stay usable on mobile and desktop, with honest live data and accessible motion", async t => {
  const boundaries = {
    "server-only": "export {};",
    "@/lib/auth/session": "export const getSession=async()=>new URLSearchParams(location.search).get('member')?{steamId:'76561198000000001'}:null;",
    "@/components/ui/portal-shell": "import React from 'react';export const PortalShell=({children,className=''})=><main className={'tapped-page portal-page '+className}><div className='shell'><header className='site-header'><a className='brand' href='/'>TAPPED.RO</a><nav aria-label='Primary navigation'><a href='/features'>Features</a></nav></header>{children}</div></main>;",
    "next/link": "import React from 'react';export default function Link({children,scroll,prefetch,...props}){return <a {...props}>{children}</a>}",
    "next/image": "import React from 'react';export default function Image({priority,...props}){return <img {...props}/>} ",
    "next/navigation": "export const useRouter=()=>({replace(){},push(){},refresh(){}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);",
  };
  const bundle = await build({
    stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import HomePage from'./app/page';import FeaturesPage from'./app/features/page';import{PanelEffects}from'./components/ui/panel-effects';(async()=>{const page=location.pathname==='/features'?await FeaturesPage():await HomePage();createRoot(document.getElementById('root')).render(<><PanelEffects/>{page}</>);})();`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_SERVER_NAME": '"ARENA.TAPPED.RO"', "process.env.NEXT_PUBLIC_SERVER_CONNECT_URL": '"steam://connect/arena.tapped.ro"' },
    plugins: [{ name: "home-feature-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const layout = await readFile("app/layout.tsx", "utf8");
  const sheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => match[1]);
  const css = (await Promise.all(sheets.map(path => readFile(resolve("app", path), "utf8")))).join("\n") + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (url.pathname === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (url.pathname === "/images/branding/tapped-emblem.svg") { response.setHeader("content-type", "image/svg+xml"); response.end(await readFile("public/images/branding/tapped-emblem.svg")); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html class="global-theme-default" data-theme="default" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root" class="portal-content"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ headless: true });
  const previews = ".cache/home-features-previews";
  await mkdir(previews, { recursive: true });
  try {
    async function withPage(path, width, check, { theme = "default", motion = "reduce", discordAvailable = true } = {}) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: motion });
      page.setDefaultTimeout(8_000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      await page.route("**/api/community/discord", route => route.fulfill({ json: discordAvailable
        ? { state: "available", name: "TAPPED.RO", members: 312, online: 28, checkedAt: new Date().toISOString() }
        : { state: "unavailable", name: "TAPPED.RO", members: null, online: null, checkedAt: new Date().toISOString() } }));
      await page.route("**/api/server-status", route => route.fulfill({ json: { state: "online", players: 1, maxPlayers: 32, map: "am_fixture_arena", bots: 0, roster: [{ steamId: "76561198000000001", name: "Arena fixture player", connectedSeconds: 90, score: 8 }], timeLeftSeconds: 600, checkedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() } }));
      await page.route("**/api/server-link/players", route => route.fulfill({ json: { players: [{ steamId: "76561198000000001", displayName: "Arena fixture player", avatarUrl: null, presence: "offline", identityGroups: [], profileThemeKey: "tap_god" }] } }));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
        await page.locator("main h1").waitFor();
        if (theme !== "default") await page.evaluate(theme => { document.documentElement.className = `global-theme-${theme.replaceAll("_", "-")}`; document.documentElement.dataset.theme = theme; }, theme);
        await check(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path}/${width} overflows`);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    }

    for (const width of [390, 1440]) await t.test(`homepage shows real-source aggregate stats and useful paths at ${width}px`, async () => {
      await withPage("/", width, async page => {
        await page.getByText("312", { exact: true }).waitFor();
        await page.getByText("28", { exact: true }).waitFor();
        await page.getByRole("heading", { name: "am_fixture_arena", exact: true }).waitFor();
        assert.equal(await page.getByRole("link", { name: /Explore features/ }).getAttribute("href"), "/features");
        assert.equal(await page.getByRole("link", { name: /Join our Discord/ }).getAttribute("href"), "https://discord.gg/eEkXZpSzrD");
        assert.equal(await page.locator('a[href="/features#duels"]').count(), 1);
        assert.equal(await page.getByRole("button", { name: "Pause motion" }).isVisible(), false);
        assert.equal(await page.locator("h1").count(), 1);
        assert.equal(await page.getByText(/monthly rewards/i).count(), 0);
        assert.equal(await page.locator('[data-ui="player-owned-container"]').getAttribute("data-theme"), "tap_god");
        await page.screenshot({ path: `${previews}/home-${width}.png`, fullPage: true });
      }, { theme: width === 390 ? "default" : "tap_god" });
    });

    await t.test("Discord failures keep the join action and hide unavailable counts", async () => {
      await withPage("/", 390, async page => {
        await page.getByText("Discord stats are temporarily unavailable.", { exact: true }).waitFor();
        assert.equal(await page.getByRole("link", { name: /Join our Discord/ }).isVisible(), true);
        const stats = page.getByRole("definition").filter({ hasText: "312" });
        assert.equal(await stats.count(), 0);
      }, { discordAvailable: false });
    });

    await t.test("motion can be paused and resumed without moving controls", async () => {
      await withPage("/", 1440, async page => {
        const button = page.getByRole("button", { name: "Pause motion" });
        const scene = page.locator('[data-paused]').first();
        const crest = scene.locator('div[class*="crest"]');
        assert.equal(await crest.evaluate(element => getComputedStyle(element).animationPlayState), "running");
        await button.click();
        assert.equal(await page.getByRole("button", { name: "Enable motion" }).getAttribute("aria-pressed"), "true");
        assert.equal(await crest.evaluate(element => getComputedStyle(element).animationPlayState), "paused");
        assert.equal(await page.locator('[data-paused="true"]').getAttribute("data-depth-card"), null);
        await page.getByRole("button", { name: "Enable motion" }).click();
        assert.equal(await page.getByRole("button", { name: "Pause motion" }).getAttribute("aria-pressed"), "false");
      }, { motion: "no-preference" });
    });

    for (const width of [390, 1440]) await t.test(`Features explains systems and expands all arena formats at ${width}px`, async () => {
      await withPage("/features", width, async page => {
        assert.equal(await page.locator("h1").count(), 1);
        const navigation = page.getByRole("navigation", { name: "Feature sections" });
        assert.equal(await navigation.locator('a[href^="#"]').count(), 5);
        await page.screenshot({ path: `${previews}/features-intro-${width}.png` });
        await page.getByText("Explore all 14 supported arena formats", { exact: true }).click();
        assert.equal(await page.locator("details[open] article").count(), 14);
        assert.equal(await page.locator('details[open]').getByRole("heading", { name: "Deagle", exact: true }).locator("..").locator("..").getByText("Armor enabled", { exact: true }).count(), 1);
        assert.equal(await page.locator("#arena-rounds-title").count(), 1);
        assert.equal(await page.locator("#duels").count(), 1);
        for (const section of ["#arena", "#duels", "#economy", "#progression", "#community"]) assert.equal(await page.locator(section).count(), 1);
        assert.equal(await page.getByRole("heading", { name: "The Token casino", exact: true }).count(), 1);
        assert.equal(await page.getByRole("link", { name: /Open a support ticket/ }).getAttribute("href"), "/tickets");
        await page.screenshot({ path: `${previews}/features-${width}.png`, fullPage: true });
      }, { theme: width === 390 ? "beta_tester" : "default" });
    });
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
