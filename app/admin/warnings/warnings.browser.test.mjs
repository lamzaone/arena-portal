import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const steamId = "76561198000000001";
const warning = { id: "fixture-warning", steamId, playerName: "Player with a very long name", reason: "Repeated disruptive behaviour that the staff member documented in a clear warning.", issuerSteamId: "76561198000000002", issuerName: "Staff member", issuedAt: 1760000000000, expiresAt: 4102444800000, acknowledgedAt: 1760000010000, revokedAt: null, revokeReason: null };

test("staff warning access, actions and responsive styling", async (t) => {
  const boundaries = {
    "node:crypto": "export const randomUUID=()=> 'fixture-request-id';",
    "@/lib/auth/session": "export const getSession=async()=>window.fixtureState==='guest'?null:{steamId:'76561198000000002'};export const createAdminActionToken=()=> 'fixture-csrf';",
    "@/lib/admin/access": "export const adminWriteConfigured=()=>window.fixtureState!=='readonly';export const getAdminAccess=async()=>({isAdmin:window.fixtureState!=='member',isAssignedToServer:true,permissions:new Set(['*']),isFounder:false,displayName:'Staff member',groups:['Staff'],immunity:10,canUnban:true});",
    "@/lib/data/warnings": `export const getWarningsPage=async()=>{window.fixtureReads++;return {warnings:[${JSON.stringify(warning)},{...${JSON.stringify(warning)},id:'expired',expiresAt:1750000000000,acknowledgedAt:null},{...${JSON.stringify(warning)},id:'revoked',revokedAt:1760000020000,revokeReason:'Staff correction'}],total:31};};`,
    "@/components/player-search-field": "import React from 'react';export const PlayerSearchField=({label,name,required})=><label>{label}<input name={name} required={required}/></label>;",
    "@/components/ui/portal-shell": "import React from 'react';export const PortalShell=({children,className='',navigation})=><main className={'tapped-page portal-page '+className}><div className='shell'>{navigation?<div className='portal-workspace-layout'>{navigation}<div className='portal-workspace-content'>{children}</div></div>:children}</div></main>;",
    "next/link": "import React from 'react';export default function Link({children,scroll,prefetch,...props}){return <a {...props}>{children}</a>}",
    "next/navigation": "export const useRouter=()=>({replace(){},push(){},refresh(){}});export const usePathname=()=>'/admin/warnings';export const useSearchParams=()=>new URLSearchParams();",
  };
  const bundle = await build({
    stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import WarningsPage from './app/admin/warnings/page';window.fixtureState=new URLSearchParams(location.search).get('state')||'staff';window.fixtureReads=0;(async()=>createRoot(document.getElementById('root')).render(await WarningsPage({searchParams:Promise.resolve({q:'Player'})})))();", loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "warning-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const layout = await readFile(resolve("app/layout.tsx"), "utf8");
  const sheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => match[1]);
  const css = (await Promise.all(sheets.map(path => readFile(resolve("app", path), "utf8")))).join("\n") + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html class="global-theme-default" data-theme="default" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    async function withPage(state, width, check) {
      const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/?state=${state}`);
        await page.locator("main").waitFor();
        await check(page);
        if (process.env.CAPTURE_MODERATION_PREVIEWS === "1" && state === "staff" && [375, 1440].includes(width)) {
          await mkdir(resolve(".cache/moderation-previews"), { recursive: true });
          await page.screenshot({ path: resolve(`.cache/moderation-previews/warnings-${width}.png`), fullPage: true });
        }
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      } finally { await page.close(); }
    }
    await t.test("guests and ordinary members cannot read or manage staff warning records", async () => {
      for (const state of ["guest", "member"]) await withPage(state, 375, async page => {
        assert.equal(await page.locator("table,form[action='/api/admin/warnings']").count(), 0);
        assert.equal(await page.evaluate(() => window.fixtureReads), 0);
        assert.match(await page.locator("main").textContent(), /sign in|staff access/i);
      });
    });
    await t.test("staff can issue and revoke active warnings using protected forms", async () => {
      for (const width of [375, 768, 1024, 1440]) await withPage("staff", width, async page => {
        await page.getByRole("table", { name: "Staff warning records" }).waitFor();
        assert.equal(await page.locator("tbody tr").count(), 3);
        assert.equal(await page.getByRole("button", { name: "Issue warning", exact: true }).count(), 1);
        assert.equal(await page.getByRole("button", { name: "Revoke", exact: true }).count(), 1);
        assert.equal(await page.locator('form[action="/api/admin/warnings"] input[name="csrf"][value="fixture-csrf"]').count(), 2);
        assert.equal(await page.getByRole("link", { name: "Warnings", exact: true }).getAttribute("aria-current"), "page");
        assert.equal(await page.getByText("Staff correction", { exact: false }).count(), 1);
        assert.equal(await page.getByText("Acknowledged", { exact: true }).count(), 2);
        assert.equal(new URL(await page.getByRole("link", { name: /Next/ }).getAttribute("href"), "https://tapped.ro").searchParams.get("q"), "Player");
        for (const label of ["Player name", "Expiry in minutes", "Reason", "Revocation reason"]) {
          const field = page.getByLabel(label, { exact: true });
          assert.equal(await field.count(), 1);
          const box = await field.boundingBox();
          assert.ok(box.height >= 40);
        }
      });
    });
    await t.test("read-only operation keeps history visible and hides mutation forms", async () => {
      await withPage("readonly", 375, async page => {
        await page.getByRole("table", { name: "Staff warning records" }).waitFor();
        assert.equal(await page.locator('form[action="/api/admin/warnings"]').count(), 0);
        assert.equal(await page.locator("tbody tr").count(), 3);
      });
    });
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
