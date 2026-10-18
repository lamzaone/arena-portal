import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const owner = "76561198000000001";
const staff = "76561198000000002";
const createdAt = "2026-10-18T12:00:00.000Z";
const ban = { id: 17, reason: "Active ban reason", adminSteamId: staff, adminName: "Staff", createdAt: 1700000000, expiresAt: 0, length: 0 };
const profile = { sourceConnected: true, bans: [ban, { ...ban, id: 18, reason: "Expired punishment reason", expiresAt: 1 }], sanctions: [{ ...ban, id: 19, kind: "Mute", reason: "Active voice restriction" }] };
const opening = { body: "Please review this case and the evidence.", createdAt, updatedAt: createdAt, messages: [] };
const tickets = [{ ...opening, id: 1, category: "account", subject: "Open account ticket", status: "open" }, { ...opening, id: 2, category: "bug", subject: "Completed bug ticket", status: "solved" }];
const appeals = [{ ...opening, id: 1, banId: 17, ban, status: "submitted" }, { ...opening, id: 2, banId: 17, ban, status: "closed-banned" }];

test("player support pages keep active punishments first and case history last across themes and viewports", async (t) => {
  const boundaries = {
    "@/lib/auth/session": `export const getSession=async()=>({steamId:'${owner}',profileThemeKey:globalThis.fixtureTheme});`,
    "@/lib/data/portal-repository": `export const getPlayerDashboard=async()=>(${JSON.stringify(profile)}); export const getTickets=async()=>(${JSON.stringify(tickets)}); export const getAppeals=async()=>(${JSON.stringify(appeals)}); export const portalStorageConfigured=()=>true; export const getAppealEligibility=async()=>({eligible:true,openAppealId:1});`,
    "@/lib/data/identity-group-listings": "export const getIdentityGroupListing=async()=>null;",
    "@/lib/player-identities": `export const resolvePlayerIdentities=async()=>({'${owner}':{steamId:'${owner}',displayName:'Player',avatarUrl:null,profileThemeKey:globalThis.fixtureTheme,presence:'offline',identityGroups:[]},'${staff}':{steamId:'${staff}',displayName:'Staff',avatarUrl:null,profileThemeKey:null,presence:'offline',identityGroups:[]}});`,
    "@/components/ui/portal-shell": "import React from 'react'; export const PortalShell=({children,className})=><main className={className}>{children}</main>;",
    "next/link": "import React from 'react'; export default function Link({children,...props}){return <a {...props}>{children}</a>}",
    "next/navigation": "export const useRouter=()=>({refresh(){},push(){}}); export const usePathname=()=>'/tickets'; export const useSearchParams=()=>new URLSearchParams();",
  };
  const bundles = {};
  for (const kind of ["tickets", "appeals"]) {
    const bundle = await build({
      stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Page from './app/${kind}/page';(async()=>{createRoot(document.getElementById('root')).render(await Page({searchParams:Promise.resolve({})}));})();`, loader: "tsx", resolveDir: process.cwd() },
      bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
      plugins: [{ name: "server-boundaries", setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
      } }],
    });
    bundles[kind] = { javascript: bundle.outputFiles.find((file) => file.path.endsWith(".js")).text, css: bundle.outputFiles.filter((file) => file.path.endsWith(".css")).map((file) => file.text).join("\n") };
  }
  const layout = await readFile(resolve("app/layout.tsx"), "utf8");
  const stylesheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map((match) => match[1]);
  const globalCss = (await Promise.all(stylesheets.map((path) => readFile(resolve("app", path), "utf8")))).join("\n");
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const kind = url.searchParams.get("kind") === "appeals" ? "appeals" : "tickets";
    if (url.pathname === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(bundles[kind].javascript); }
    else if (url.pathname === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(globalCss + bundles[kind].css); }
    else {
      const theme = ["tap_god", "beta_tester"].includes(url.searchParams.get("theme")) ? url.searchParams.get("theme") : "default";
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><html data-theme="${theme}" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css?kind=${kind}"></head><body><div id="root" style="max-width:1200px;margin:auto;padding:14px"></div><script>globalThis.fixtureTheme='${theme}';</script><script src="/fixture.js?kind=${kind}"></script></body></html>`);
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const kind of ["tickets", "appeals"]) await t.test(kind, async () => {
      for (const theme of ["default", "tap_god", "beta_tester"]) for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
          await page.goto(`http://127.0.0.1:${server.address().port}/?kind=${kind}&theme=${theme}`);
          const overview = page.getByRole("region", { name: "Active punishments", exact: true });
          await overview.waitFor();
          assert.equal(await overview.getAttribute("data-theme"), theme);
          assert.match(await overview.textContent(), /Active ban reason/);
          assert.match(await overview.textContent(), /Active voice restriction/);
          assert.doesNotMatch(await overview.textContent(), /Expired punishment reason/);
          const first = await overview.boundingBox();
          const current = await page.getByRole("heading", { name: kind === "tickets" ? "Open tickets" : "Open appeals", exact: true }).boundingBox();
          const history = await page.getByRole("heading", { name: kind === "tickets" ? "Ticket history" : "Closed appeals", exact: true }).boundingBox();
          assert.ok(first.y + first.height <= current.y, "active punishments should precede the conversations");
          assert.ok(current.y < history.y, "closed case history should follow open conversations");
          assert.equal(await page.locator(`form[action="/api/${kind}"] input[value="reply"]`).count(), 1);
          if (kind === "tickets") assert.equal(await page.locator('form[action="/api/tickets"] input[value="create"]').count(), 1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${kind} ${theme} at ${width}px`);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      }
    });
  } finally { await browser?.close(); await new Promise((done) => server.close(done)); }
});
