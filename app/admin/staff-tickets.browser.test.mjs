import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const ownerId = "76561198000000001";
const staffId = "76561198000000002";
const otherStaffId = "76561198000000003";
const createdAt = "2026-10-02T18:20:00.000Z";
const attachment = (id, fileName) => ({ id, fileName, contentType: "image/png", createdAt });
const identities = Object.fromEntries([
  [ownerId, "Redex", "tap_god"],
  [staffId, "Blue staff", "beta_tester"],
  [otherStaffId, "Default staff", null],
].map(([steamId, displayName, profileThemeKey]) => [steamId, {
  steamId, displayName, profileThemeKey, avatarUrl: `https://avatars.steamstatic.com/${steamId}.png`, presence: "offline", identityGroups: [],
}]));
const ticket = {
  id: 10, steamId: ownerId, category: "other", subject: "Ticket with screenshots", body: "Original report body.",
  status: "open", priority: "high", createdAt, updatedAt: createdAt,
  messages: [
    { id: 1, authorId: ownerId, authorType: "player", body: "Screenshots attached to the original ticket.", createdAt,
      attachments: [attachment(1, "original-one.png"), attachment(2, "original-two.png")] },
    { id: 2, authorId: staffId, authorType: "staff", body: "Blue staff response.", createdAt,
      attachments: [attachment(3, "staff-evidence.png")] },
    { id: 3, authorId: otherStaffId, authorType: "staff", body: "Default staff response.", createdAt, attachments: [] },
    { id: 4, authorId: ownerId, authorType: "player", body: "Player follow-up.", createdAt, attachments: [] },
  ],
};

test("staff ticket presentation and screenshot viewer", async (t) => {
  const boundaries = {
    "@/lib/auth/session": `export const getSession=async()=>({steamId:'${staffId}',profileThemeKey:'tap_god'}); export const createAdminActionToken=()=> 'fixture-csrf';`,
    "@/lib/admin/access": "export const adminWriteConfigured=()=>true; export const getAdminAccess=async()=>({isAdmin:true,isFounder:false,canUnban:true,groups:['Staff'],displayName:'Blue staff',immunity:10});",
    "@/lib/data/portal-repository": `export const getStaffTickets=async()=>({tickets:[${JSON.stringify(ticket)}],total:1,pageSize:25,priorityAvailable:true}); export const getStaffAppeals=async()=>null; export const getStaffModeration=async()=>null;`,
    "@/lib/player-identities": `export const resolvePlayerIdentities=async()=>(${JSON.stringify(identities)});`,
    "@/components/ui/portal-shell": "import React from 'react'; export const PortalShell=({children,className})=><main className={className}>{children}</main>;",
    "next/link": "import React from 'react'; export default function Link({children,...props}){return <a {...props}>{children}</a>}",
    "next/navigation": "export const useRouter=()=>({refresh(){},push(){}}); export const usePathname=()=>'/admin/tickets'; export const useSearchParams=()=>new URLSearchParams();",
  };
  const bundle = await build({
    stdin: { contents: "import React from 'react'; import {createRoot} from 'react-dom/client'; import {StaffManagementPage} from './app/admin/staff-management-page'; (async()=>{createRoot(document.getElementById('root')).render(await StaffManagementPage({section:'tickets',searchParams:Promise.resolve({})}));})();", loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "server-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const javascript = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
  // Match the real layout's stylesheet order, including the final ownership boundary.
  const layout = await readFile(resolve("app/layout.tsx"), "utf8");
  const stylesheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map((match) => match[1]);
  const css = (await Promise.all(stylesheets.map((path) => readFile(resolve("app", path), "utf8")))).join("\n")
    + bundle.outputFiles.filter((file) => file.path.endsWith(".css")).map((file) => file.text).join("\n");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=", "base64");
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (request.url.startsWith("/api/image?") || request.url.startsWith("/api/case-attachments/")) { response.setHeader("content-type", "image/png"); response.end(png); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html class="global-theme-tap-god" data-theme="tap_god" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root" style="max-width:1300px;margin:auto;padding:12px"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    async function withPage(width, check) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.locator(".staff-case").waitFor();
        await check(page);
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      } finally { await page.close(); }
    }
    await t.test("reply name and role sit beside the avatar at desktop and phone widths", async () => {
      for (const width of [1440, 390]) await withPage(width, async (page) => {
        await page.locator(".staff-case-details > summary").click();
        for (const header of await page.locator(".case-message-header").all()) {
          await header.scrollIntoViewIfNeeded();
          const avatar = await header.locator(".player-identity-avatar").boundingBox();
          const name = await header.locator(".player-identity-name").boundingBox();
          const role = await header.locator(".player-identity-secondary").boundingBox();
          assert.ok(name.x >= avatar.x + avatar.width, "name should be to the right of the player picture");
          assert.ok(role.x >= avatar.x + avatar.width, "reply role should be to the right of the player picture");
          assert.ok(name.y < avatar.y + avatar.height, JSON.stringify({ avatar, name, role, image: await header.locator(".player-identity-avatar").evaluate((el) => ({ width: getComputedStyle(el).width, height: getComputedStyle(el).height, display: getComputedStyle(el).display, visibility: getComputedStyle(el).visibility, transform: getComputedStyle(el).transform })) }));
        }
      });
    });
    await t.test("case filters and persisted staff priority remain usable at desktop and phone widths", async () => {
      for (const width of [1440, 390]) await withPage(width, async (page) => {
        const filter = page.getByLabel("Case status");
        await filter.waitFor();
        assert.deepEqual(await filter.locator("option").allTextContents(), ["All cases", "Open", "Closed", "No staff reply", "Replied · still open", "Solved", "Unsolved"]);
        assert.equal(await page.getByLabel("Search cases", { exact: true }).count(), 1);
        assert.equal(await page.locator('[data-priority="high"]').textContent(), "high priority");
        await page.locator(".staff-case-details > summary").click();
        const priority = page.getByLabel("Staff priority");
        assert.equal(await priority.inputValue(), "high");
        const form = priority.locator("xpath=ancestor::form");
        assert.equal(await form.getAttribute("action"), "/api/admin/cases");
        assert.equal(await form.locator('input[name="csrf"]').inputValue(), "fixture-csrf");
        assert.equal(await form.locator('input[name="caseId"]').inputValue(), "10");
        assert.equal(await form.locator('input[name="action"]').inputValue(), "ticket-priority");
        assert.equal(await form.getByRole("button", { name: "Save priority", exact: true }).isEnabled(), true);
      });
    });
    await t.test("original post owns its avatar and screenshots, without a generated reply", async () => {
      for (const width of [1440, 390]) await withPage(width, async (page) => {
        const opening = page.locator(".staff-case-heading");
        assert.equal(await opening.locator(".player-identity-avatar").count(), 1);
        assert.equal(await page.locator(".staff-case > .case-message-attachments button").count(), 2);
        await page.locator(".staff-case-details > summary").click();
        assert.equal(await page.locator(".case-message").count(), 3);
        assert.equal(await page.getByText("Screenshots attached to the original ticket.", { exact: true }).count(), 0);
        assert.match(await page.locator(".staff-case-details > summary").textContent(), /3 replies/);
        assert.equal(await page.locator(`.case-message[data-player-owner="${staffId}"] .case-message-attachments button`).count(), 1);
      });
    });
    await t.test("each reply keeps its equipped theme beneath a TAP GOD page and ticket", async () => {
      for (const width of [1440, 390]) await withPage(width, async (page) => {
        await page.locator(".staff-case-details > summary").click();
        const blue = page.locator(`.case-message[data-player-owner="${staffId}"]`);
        assert.equal(await blue.getAttribute("data-theme"), "beta_tester");
        assert.match(await blue.evaluate((el) => getComputedStyle(el).backgroundImage), /56, 189, 248/);
        assert.equal(await blue.evaluate((el) => getComputedStyle(el).borderLeftColor), "rgb(250, 204, 21)");
        const normal = page.locator(`.case-message[data-player-owner="${otherStaffId}"]`);
        assert.equal(await normal.getAttribute("data-theme"), "default");
        assert.match(await normal.evaluate((el) => getComputedStyle(el).backgroundImage), /48, 48, 50/);
        assert.equal(await normal.evaluate((el) => getComputedStyle(el).borderLeftColor), "rgb(239, 86, 111)");
        const owner = page.locator(`.case-message[data-player-owner="${ownerId}"]`).last();
        assert.equal(await owner.getAttribute("data-theme"), "tap_god");
        assert.match(await owner.evaluate((el) => getComputedStyle(el).backgroundImage), /255, 23, 68/);
      });
    });
    await t.test("screenshots open in place with blur, wraparound arrows, Escape, X, and restored focus", async () => {
      for (const width of [1440, 390]) await withPage(width, async (page) => {
        const opener = page.getByRole("button", { name: "View screenshot: original-two.png", exact: true });
        await opener.click();
        const dialog = page.getByRole("dialog", { name: "Ticket screenshots" });
        await dialog.waitFor();
        assert.match(await dialog.getByRole("img").getAttribute("src"), /\/2$/);
        assert.match(await dialog.evaluate((el) => getComputedStyle(el, "::backdrop").backdropFilter), /blur\(/);
        await dialog.getByRole("button", { name: "Next screenshot", exact: true }).click();
        assert.match(await dialog.getByRole("img").getAttribute("src"), /\/3$/);
        await page.keyboard.press("ArrowRight");
        assert.match(await dialog.getByRole("img").getAttribute("src"), /\/1$/);
        await page.keyboard.press("ArrowLeft");
        assert.match(await dialog.getByRole("img").getAttribute("src"), /\/3$/);
        await dialog.getByRole("button", { name: "Previous screenshot", exact: true }).click();
        assert.match(await dialog.getByRole("img").getAttribute("src"), /\/2$/);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await opener.evaluate((el) => el === document.activeElement), true);
        await opener.click();
        await dialog.getByRole("button", { name: "Close screenshots", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await opener.evaluate((el) => el === document.activeElement), true);
        assert.match(page.url(), /127\.0\.0\.1/);
        assert.equal(page.context().pages().length, 1);
      });
    });
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
});
