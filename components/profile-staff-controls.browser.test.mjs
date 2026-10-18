import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("profile Warn uses protected persistent warnings and respects current access", async (t) => {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ProfileStaffControls} from './components/profile-staff-controls';const qs=new URLSearchParams(location.search);const state=qs.get('state')||'staff';const access={isAdmin:state!=='member',isAssignedToServer:state!=='other-server',immunity:10,permissions:new Set(state==='no-warn'?['admins.commands.ban']:['admins.commands.warn']),canManageAdmins:false,canManageVips:false,canManageGroups:false};createRoot(document.getElementById('root')).render(<div data-ready><ProfileStaffControls steamId="76561198000000002" displayName="Arena player" access={access} csrf="fixture-csrf" online={false} writesReady={state!=='readonly'} notice={qs.get('notice')||undefined} error={qs.get('error')||undefined}/></div>);document.addEventListener('submit',event=>{event.preventDefault();window.fixtureSubmission={action:event.submitter.formAction,fields:Object.fromEntries(new FormData(event.target,event.submitter))}});`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "fixture-link", setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, ({ path }) => ({ path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}", loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const layout = await readFile(resolve("app/layout.tsx"), "utf8");
  const css = (await Promise.all([...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => readFile(resolve("app", match[1]), "utf8")))).join("\n") + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else {
      const theme = new URL(request.url, "http://localhost").searchParams.get("theme") || "default";
      response.setHeader("content-type", "text/html"); response.end(`<!doctype html><html data-theme="${theme}" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root" style="max-width:1100px;margin:auto;padding:12px"></div><script src="/fixture.js"></script></body></html>`);
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
        await page.locator("[data-ready]").waitFor({ state: "attached" });
        await check(page);
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      } finally { await page.close(); }
    }
    await t.test("Warn is hidden without warn permission, staff status or this server's assignment", async () => {
      for (const state of ["no-warn", "member", "other-server"]) await withPage(`state=${state}`, 390, async page => {
        assert.equal(await page.getByRole("button", { name: "Warn", exact: true }).count(), 0);
      });
    });
    await t.test("Warn confirms and submits the player, expiry, CSRF and unique request ID", async () => {
      for (const theme of ["default", "tap_god", "beta_tester"]) for (const width of [390, 1440]) await withPage(`theme=${theme}`, width, async page => {
        await page.getByRole("button", { name: "Warn", exact: true }).waitFor();
        await page.getByLabel("Reason", { exact: true }).fill("Repeated disruption");
        await page.getByLabel("Duration (minutes)", { exact: true }).fill("120");
        await page.getByRole("button", { name: "Warn", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Confirm action" });
        await dialog.waitFor();
        assert.equal(await page.evaluate(() => window.fixtureSubmission), undefined);
        await dialog.getByRole("button", { name: "Warn", exact: true }).click();
        await page.waitForFunction(() => Boolean(window.fixtureSubmission));
        const submitted = await page.evaluate(() => window.fixtureSubmission);
        assert.equal(new URL(submitted.action).pathname, "/api/admin/warnings");
        assert.equal(submitted.fields.action, "issue");
        assert.equal(submitted.fields.steamId, "76561198000000002");
        assert.equal(submitted.fields.playerName, "Arena player");
        assert.equal(submitted.fields.csrf, "fixture-csrf");
        assert.equal(submitted.fields.durationMinutes, "120");
        assert.match(submitted.fields.id, /^[0-9a-f-]{36}$/i);
      });
    });
    await t.test("writes-disabled and warning feedback remain clear on the profile", async () => {
      await withPage("state=readonly", 390, async page => assert.equal(await page.getByRole("button", { name: "Warn", exact: true }).isDisabled(), true));
      await withPage("notice=" + encodeURIComponent("Warning issued. The player must acknowledge it in game."), 390, async page => assert.match(await page.getByRole("status").textContent(), /Warning issued/));
      await withPage("error=" + encodeURIComponent("Invalid warning details."), 390, async page => assert.match(await page.getByRole("alert").textContent(), /at least 1 minute/i));
    });
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
