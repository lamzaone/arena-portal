import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";

test("full player profiles paint administrative, combat and community content above every theme backdrop", async t => {
  const boundarySources = {
    session: "export async function getSession(){return window.fixtureViewer}",
    access: "export async function getAdminAccess(){return window.fixtureAccess}",
    identities: "export async function resolvePlayerIdentities(seeds){return Object.fromEntries(seeds.map(seed=>[seed.steamId,{steamId:seed.steamId,displayName:'Staff viewer',avatarUrl:null,presence:'unknown',profileThemeKey:seed.profileThemeKey??null,identityGroups:[]}]))}",
    warnings: "export async function getPlayerWarningsPage(){return {warnings:[],total:0,page:1,pageSize:10}}",
    navigation: "export const usePathname=()=>'/players/76561198000000002';export const useRouter=()=>({refresh(){}});export const useSearchParams=()=>new URLSearchParams(location.search)",
    link: "import React from 'react';export default function Link({children,prefetch,scroll,...props}){return <a {...props}>{children}</a>}",
    image: "import React from 'react';export default function Image({priority,fill,quality,...props}){return <img {...props}/>}",
  };
  const bundle = await build({
    stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `import React from 'react';import{createRoot}from'react-dom/client';import{createPortal}from'react-dom';
      import{PlayerProfilePage}from'./components/player-profile-page';import{ProfileStaffControls}from'./components/profile-staff-controls';
      import{GlobalThemeBackground,GlobalThemeDocumentEffects}from'./components/profile-theme-slots';import{resolvePortalThemeSurface}from'./lib/themes/registry';
      import{PanelEffects}from'./components/ui/panel-effects';import{PortalVisualEffects}from'./components/ui/portal-visual-effects';
      const query=new URLSearchParams(location.search),themeKey=query.get('theme'),viewerTheme=query.get('viewer')||'shadow',own=query.has('own'),steamId=own?'76561198000000001':'76561198000000002';
      const viewer=resolvePortalThemeSurface(viewerTheme,'global');document.documentElement.className=viewer.surface.className;document.documentElement.dataset.theme=viewer.theme.key;document.documentElement.dataset.themeSurface='global';
      window.fixtureViewer={steamId:'76561198000000001',profileThemeKey:viewerTheme};window.fixtureAccess={isAdmin:true,isAssignedToServer:true,immunity:100,permissions:new Set(['*']),canManageAdmins:true,canManageVips:true,canManageGroups:true};
      const hitStats={totalHits:1000,healthDamage:100000,armorDamage:42000,head:420,chest:220,stomach:100,leftArm:70,rightArm:60,leftLeg:60,rightLeg:50,neck:20};
      const profile={steamId,displayName:'Profile visual fixture',points:3600,leaderboardPosition:12,leaderboardTotal:100,playtimeSeconds:360000,kills:1800,deaths:1200,headshots:900,totalKills:2200,totalHeadshots:1100,noscopes:35,hitStats,vipGroups:[],adminGroups:[],isBanned:false,...(own?{sourceConnected:true,hasGameRecord:true,rank:12,gamesPlayed:200,gameWins:120,gameLosses:80,bans:[],sanctions:[],kickHistoryAvailable:true,skinSummary:{skins:0,knives:0,gloves:0,agents:0,musicKits:0}}:{})};
      const community={available:true,reputation:8,commendationTotal:12,commendations:{helpful:4,teacher:2,funny:2,pro_player:3,goat:1},commentsEnabled:true,myReputation:0,myCommendations:[],comments:{records:[{id:'e91a2f90-e577-44b1-bc67-000000000001',authorSteamId:'76561198000000003',body:'A visible comment in the author’s own theme.',createdAt:1792321200000,canDelete:true}],page:1,pageSize:10,total:1}};
      const authorTheme=query.get('author')||'vip_gold';const identities={'76561198000000003':{steamId:'76561198000000003',displayName:'Themed comment author',avatarUrl:null,presence:'unknown',profileThemeKey:authorTheme,identityGroups:[]}};
      const inventory={visibility:'private',canView:false,items:[],total:0,page:1,pageSize:12};
      const status={state:'online',players:1,maxPlayers:32,bots:0,map:'de_mirage',checkedAt:'2026-10-18T10:00:00.000Z',lastSeenAt:'2026-10-18T10:00:00.000Z',roster:[{steamId,name:profile.displayName}]};
      createRoot(document.getElementById('root')).render(<>{createPortal(<GlobalThemeBackground themeKey={viewerTheme}/>,document.body)}<GlobalThemeDocumentEffects themeKey={viewerTheme}/><PanelEffects/><PortalVisualEffects/><div className='portal-content'>
      <PlayerProfilePage steamId={steamId} profile={profile} identity={{groups:[],tags:[],privileges:[],directPrivileges:[]}} isOwnProfile={own} isAuthenticated profileThemeKey={themeKey} profileInventory={inventory} initialServerStatus={status}
      settingsOpen={own&&query.has('settings')} profileSettings={{csrf:'fixture-csrf',initialSettings:{inventoryVisibility:'private',activeThemeId:null,activeThemeItemId:null,ownedThemes:[]}}}
      arenaStats={{roundWins:120,roundWinRate:60,assists:70,accuracy:33.4,damage:43000,gamesPlayed:200,highestKillstreak:null}}
      staffControls={<ProfileStaffControls steamId={steamId} displayName={profile.displayName} access={window.fixtureAccess} csrf='fixture-csrf' online writesReady/>}
      community={{initialCommunity:community,initialIdentities:identities,csrf:'fixture-csrf',viewerSteamId:'76561198000000001'}}/></div></>);` },
    bundle: true, write: false, outfile: "profile-fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "profile-server-boundaries", setup(builder) {
      const stubs = {
        "@/lib/auth/session": "session", "@/lib/admin/access": "access", "@/lib/player-identities": "identities", "@/lib/data/warnings": "warnings",
        "next/navigation": "navigation", "next/link": "link", "next/image": "image",
      };
      builder.onResolve({ filter: /^(?:@\/lib\/|next\/)/ }, ({ path }) => stubs[path] ? { path: stubs[path], namespace: "profile-boundary" } : null);
      builder.onLoad({ filter: /.*/, namespace: "profile-boundary" }, ({ path }) => ({ contents: boundarySources[path], loader: "tsx", resolveDir: process.cwd() }));
      // Resolve only asynchronous database/session-owned server boundaries;
      // the actual header/history components still produce their real markup.
      for (const [specifier, symbol, file] of [["@/components/site-header", "SiteHeader", "components/site-header.tsx"], ["@/components/player-warning-history", "PlayerWarningHistory", "components/player-warning-history.tsx"]]) {
        builder.onResolve({ filter: new RegExp(`^${specifier}$`) }, () => ({ path: symbol, namespace: "async-profile-boundary" }));
        builder.onLoad({ filter: new RegExp(`^${symbol}$`), namespace: "async-profile-boundary" }, () => ({ contents: `import React,{useEffect,useState}from'react';import{${symbol} as Actual}from'${resolve(file).replaceAll("\\", "/")}';export function ${symbol}(props){const[node,setNode]=useState(null);useEffect(()=>{let active=true;Actual(props).then(result=>{if(active)setNode(result)});return()=>{active=false}},[]);return node}`, loader: "tsx", resolveDir: process.cwd() }));
      }
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "empty" }));
      builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export {}" }));
    } }],
  });
  const layout = await readFile("app/layout.tsx", "utf8");
  const css = (await Promise.all([...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => readFile(resolve("app", match[1]), "utf8")))).join("\n").replace(/^@import.*$/gm, "") + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(javascript); }
    else if (path === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
    else if (path.startsWith("/images/")) {
      try { response.setHeader("Content-Type", extname(path) === ".svg" ? "image/svg+xml" : "image/png"); response.end(await readFile(resolve("public", path.slice(1)))); }
      catch { response.statusCode = 404; response.end(); }
    } else if (path === "/api/server-status") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ state: "online", roster: [], checkedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), players: 0, maxPlayers: 32, bots: 0, map: "de_mirage" })); }
    else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  const directory = resolve(".cache/player-profile-theme-previews");
  await mkdir(directory, { recursive: true });
  async function paintedText(locator) {
    const png = await locator.screenshot({ animations: "disabled" });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let brightPixels = 0;
    for (let index = 0; index < data.length; index += info.channels) if (data[index] > 110 && data[index + 1] > 110 && data[index + 2] > 110) brightPixels++;
    return { brightPixels, width: info.width, height: info.height };
  }
  try {
    browser = await chromium.launch({ headless: true });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function open(query, width = 1440, reducedMotion = "reduce", paused = false) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion });
      page.setDefaultTimeout(6000);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      if (paused) await page.addInitScript(() => localStorage.setItem("portal:decorative-motion", "paused"));
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${origin}/?${query}`);
      await page.getByRole("heading", { name: query.includes("settings") ? "Settings & customisation" : "Warnings", exact: true }).waitFor();
      await page.waitForTimeout(reducedMotion === "reduce" ? 50 : 600);
      return { page, errors };
    }
    await t.test("no equipped theme paints staff controls and combat content instead of hiding them behind its opaque backdrop", async () => {
      const { page, errors } = await open("viewer=shadow");
      try {
        const heading = page.getByRole("heading", { name: "Staff controls", exact: true });
        const before = await paintedText(heading);
        if (before.brightPixels < 10) {
          const evidence = await heading.evaluate(element => { const shell = element.closest(".shell"); const backdrop = document.querySelector('[data-theme-background-surface="profile"] .portal-atmosphere'); return { headingColor: getComputedStyle(element).color, headingOpacity: getComputedStyle(element).opacity, shellPosition: getComputedStyle(shell).position, shellZIndex: getComputedStyle(shell).zIndex, backdropPosition: getComputedStyle(backdrop).position, backdropZIndex: getComputedStyle(backdrop).zIndex, backdropBackground: getComputedStyle(backdrop).backgroundColor }; });
          await page.screenshot({ path: resolve(directory, "default-obscured-before.png"), fullPage: true });
          await page.addStyleTag({ content: '[data-theme-background-surface="profile"] .portal-atmosphere{display:none}' });
          const uncovered = await paintedText(heading);
          assert.ok(uncovered.brightPixels > 30, "the real staff heading becomes visible when only the backdrop is removed");
          await page.screenshot({ path: resolve(directory, "default-backdrop-removed-control.png"), fullPage: true });
          assert.fail(`The profile backdrop obscures real content: ${JSON.stringify({ before, uncovered, evidence })}`);
        }
        assert.ok(before.brightPixels > 30);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
    for (const theme of ["default", "beta_tester", "shadow", "tap_god", "vip_silver", "vip_gold", "vip_diamond", "vip_ultimate", "staff", "moderator", "administrator", "senior_administrator", "owner"]) await t.test(`${theme} profile keeps its full real content painted on desktop and mobile`, async () => {
      for (const width of [1440, 390]) {
        const { page, errors } = await open(`theme=${theme}&viewer=owner`, width);
        try {
          for (const name of ["Staff controls", "Memberships & groups", "Combat performance", "Arena performance", "A reputation built together.", "Profile comments 1"]) {
            const heading = page.getByRole("heading", { name, exact: true });
            assert.ok((await paintedText(heading)).brightPixels > 30, `${theme} ${width}: ${name} must be painted above the backdrop`);
          }
          await page.getByRole("button", { name: "Warn", exact: true }).scrollIntoViewIfNeeded();
          await page.getByLabel("Reason", { exact: true }).fill("Visible and usable moderation controls");
          assert.ok((await paintedText(page.getByRole("button", { name: "Warn", exact: true }))).brightPixels > 15);
          const author = page.locator('li[data-ui="player-owned-container"][data-player-owner="76561198000000003"]');
          assert.equal(await author.getAttribute("data-theme"), "vip_gold");
          assert.equal(await author.evaluate(element => getComputedStyle(element).getPropertyValue("--theme-accent").trim()), "#ffd34d");
          assert.equal(await page.locator('[data-theme-background-surface="global"]').isVisible(), false);
          assert.equal(await page.locator('[data-theme-background-surface="profile"]').isVisible(), true);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.deepEqual(errors, []);
          await page.screenshot({ path: resolve(directory, `${theme}-${width}.png`), fullPage: true });
        } finally { await page.close(); }
      }
    });
    await t.test("default own profiles, reduced motion and persisted global pause retain painted controls and details", async () => {
      for (const [motion, paused] of [["no-preference", false], ["no-preference", true], ["reduce", false]]) {
        const { page, errors } = await open("own=1&viewer=vip_gold", 390, motion, paused);
        try {
          for (const name of ["Staff controls", "Combat performance", "A reputation built together."]) assert.ok((await paintedText(page.getByRole("heading", { name, exact: true }))).brightPixels > 30);
          await page.getByRole("tab", { name: /Inventory/ }).click();
          assert.ok((await paintedText(page.getByRole("heading", { name: "Inventory", exact: true }))).brightPixels > 30);
          await page.getByRole("tab", { name: "Overview", exact: true }).click();
          await page.waitForTimeout(500);
          assert.ok((await paintedText(page.getByRole("heading", { name: "Combat performance", exact: true }))).brightPixels > 30);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      }
    });
    await t.test("default author messages remain visible within equipped profiles and profile settings retain their own palette", async () => {
      for (const theme of ["default", "beta_tester", "vip_gold", "shadow", "tap_god"]) {
        const { page, errors } = await open(`theme=${theme}&author=default&viewer=owner`, 390);
        try {
          const message = page.locator('li[data-ui="player-owned-container"][data-player-owner="76561198000000003"]');
          assert.equal(await message.getAttribute("data-theme"), "default");
          assert.equal(await message.evaluate(element => getComputedStyle(element).getPropertyValue("--theme-accent").trim()), "#dc143c");
          assert.ok((await paintedText(message.getByText("A visible comment in the author’s own theme.", { exact: true }))).brightPixels > 30);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
        const settings = await open(`theme=${theme}&own=1&settings=1&viewer=owner`, 390);
        try {
          for (const name of ["Staff controls", "Settings & customisation", "Let the community leave a message."]) assert.ok((await paintedText(settings.page.getByRole("heading", { name, exact: true }))).brightPixels > 30);
          assert.ok((await paintedText(settings.page.getByText("Choose who can browse your tradeable items.", { exact: true }))).brightPixels > 30);
          assert.deepEqual(settings.errors, []);
        } finally { await settings.page.close(); }
      }
    });
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
