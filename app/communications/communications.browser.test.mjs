import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const base = { steamId: "76561198000000001", playerName: "Arena player", expiresAt: 0, length: 0, reason: "Disruption", adminSteamId: "76561198000000002", adminName: "Moderator", global: true, createdAt: 1760000000 };
const sanctions = [{ ...base, id: 4, kind: "Gag" }, { ...base, id: 3, kind: "Mute" }, { ...base, id: 2, kind: "Gag", reason: "Text spam" }, { ...base, id: 1, kind: "Mute", reason: "Voice spam", adminSteamId: "0", adminName: "Console", expiresAt: 1750000000 }];

test("Communications records are restricted to staff and remain searchable across themes", async (t) => {
  const boundaries = {
    "server-only": "export {};",
    "@/lib/auth/session": "export const getSession=async()=>window.fixtureState==='guest'?null:{steamId:'76561198000000002'};export const createAdminActionToken=()=> 'fixture-csrf';",
    "@/lib/admin/access": "export const getAdminAccess=async()=>({isAdmin:window.fixtureState!=='member',isFounder:false,canUnban:true,displayName:'Moderator',groups:['Staff'],immunity:10});export const adminWriteConfigured=()=>true;",
    "@/lib/seo/site": "export const buildPageMetadata=()=>({});",
    "@/lib/data/communications": "export const getCommunicationsPage=async()=>{window.fixtureReads++;return {available:true,records:[],total:0,page:1,pageSize:25}};export const pairCommunicationRecords=()=>[];",
    "@/lib/data/portal-repository": `export const getStaffModeration=async(page,query)=>{window.fixtureReads++;window.fixtureRead={page,query};return {bans:[{...${JSON.stringify(base)},id:9,reason:'Ban details must stay on Bans'}],sanctions:${JSON.stringify(sanctions)},banTotal:1,sanctionTotal:28,pageSize:25}};export const getStaffAppeals=async()=>null;export const getStaffTickets=async()=>null;`,
    "@/lib/player-identities": "export const resolvePlayerIdentities=async seeds=>Object.fromEntries(seeds.map(seed=>[seed.steamId,{...seed,displayName:seed.displayName||'Moderator',avatarUrl:null,presence:'offline',profileThemeKey:null,identityGroups:[]}]));",
    "@/components/player-search-field": "import React from 'react';export const PlayerSearchField=({label,name,defaultQuery})=><label>{label}<input name={name} defaultValue={defaultQuery}/></label>;",
    "@/components/ui/portal-shell": "import React from 'react';export const PortalShell=({children,className='',navigation})=><main className={'tapped-page portal-page '+className}><div className='shell'>{navigation?<div className='portal-workspace-layout'>{navigation}<div className='portal-workspace-content'>{children}</div></div>:children}</div></main>;",
    "next/link": "import React from 'react';export default function Link({children,scroll,prefetch,...props}){return <a {...props}>{children}</a>}",
    "next/navigation": "export const usePathname=()=>'/admin/communications';export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({replace(href){window.fixtureNav=href},push(href){window.fixtureNav=href},refresh(){}});export const redirect=href=>{window.fixtureRedirect=href;throw Error('fixture redirect')};",
  };
  const bundle = await build({
    stdin: { contents: "import React from 'react';import {createRoot} from 'react-dom/client';import Legacy from './app/communications/page';import Staff from './app/admin/communications/page';const qs=new URLSearchParams(location.search);window.fixtureState=qs.get('state')||'staff';window.fixtureReads=0;(async()=>{const props={searchParams:Promise.resolve({page:'2',q:'Arena & Friend'})};if(qs.has('legacy')){try{const content=await Legacy(props);createRoot(document.getElementById('root')).render(content)}catch(error){if(!window.fixtureRedirect)throw error;document.getElementById('root').textContent='Redirecting'}}else{const route=Staff(props);createRoot(document.getElementById('root')).render(await route.type(route.props))}})();", loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "fixture-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const layout = await readFile(resolve("app/layout.tsx"), "utf8");
  const css = (await Promise.all([...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => readFile(resolve("app", match[1]), "utf8")))).join("\n") + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else {
      const theme = new URL(request.url, "http://localhost").searchParams.get("theme") || "default";
      response.setHeader("content-type", "text/html"); response.end(`<!doctype html><html data-theme="${theme}" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
    }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    async function withPage(query, width, check) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/?${query}`);
        await check(page);
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      } finally { await page.close(); }
    }
    await t.test("guests and ordinary members cannot fetch staff records", async () => {
      for (const state of ["guest", "member"]) await withPage(`state=${state}`, 390, async page => {
        await page.locator("main").waitFor();
        assert.equal(await page.locator("table").count(), 0);
        assert.equal(await page.evaluate(() => window.fixtureReads), 0);
        assert.match(await page.locator("main").textContent(), /sign in|staff access/i);
      });
    });
    await t.test("the old public URL redirects without fetching any moderation data", async () => {
      for (const state of ["guest", "member", "staff"]) await withPage(`legacy=1&state=${state}`, 390, async page => {
        await page.waitForFunction(() => Boolean(window.fixtureRedirect));
        const url = new URL(await page.evaluate(() => window.fixtureRedirect), "http://localhost");
        assert.equal(url.pathname, "/admin/communications");
        assert.equal(url.searchParams.get("q"), "Arena & Friend");
        assert.equal(url.searchParams.get("page"), "2");
        assert.equal(await page.evaluate(() => window.fixtureReads), 0);
        assert.equal(await page.locator("table").count(), 0);
      });
    });
    await t.test("staff history keeps search, pagination and separate gag/mute/silence records", async () => {
      for (const theme of ["default", "tap_god", "beta_tester"]) for (const width of [390, 1440]) await withPage(`theme=${theme}`, width, async page => {
        await page.getByRole("table", { name: "Communication sanction records" }).waitFor();
        assert.equal(await page.locator("tbody tr").count(), 3);
        assert.equal(await page.getByText("Ban details must stay on Bans", { exact: true }).count(), 0);
        for (const kind of ["Gag", "Mute", "Silence"]) assert.equal(await page.getByText(kind, { exact: true }).count(), 1);
        assert.equal(await page.getByRole("link", { name: "Communications", exact: true }).getAttribute("aria-current"), "page");
        const previous = new URL(await page.getByRole("link", { name: /Previous/ }).getAttribute("href"), "http://localhost");
        assert.equal(previous.pathname, "/admin/communications"); assert.equal(previous.searchParams.get("q"), "Arena & Friend");
        await page.getByLabel("Find a player", { exact: true }).fill("New & Player");
        await page.locator('form[action="/admin/communications"]').evaluate(form => form.requestSubmit());
        await page.waitForFunction(() => Boolean(window.fixtureNav));
        const destination = new URL(await page.evaluate(() => window.fixtureNav), "http://localhost");
        assert.equal(destination.pathname, "/admin/communications"); assert.equal(destination.searchParams.get("q"), "New & Player");
      });
    });
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
