import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const steamId = "76561198000000001";
const application = { id: "e4b62322-7677-4315-a19b-92b8f10236ed", steamId, nickname: "Helpful community player", age: 24, discordProfile: "https://discord.com/users/12345678901234567", discordLinked: true, steamGroupMember: true, playtimeSeconds: 21600, reason: "I want to make every round fair and help new players feel welcome.\nI have time to answer questions and calmly resolve disagreements.", status: "submitted", createdAt: 1792300000000, reviewedBy: null, reviewedAt: null };
const member = (id, name, theme) => ({ steamId: id, name, avatarUrl: null, presence: "online", profileThemeKey: theme, discordProfileUrl: "https://discord.com/users/12345678901234567" });
const directory = { available: true, memberCount: 3, onlineCount: 3, groups: [{ key: "founder", name: "Founder", description: "The community starts here.", icon: "crown", color: "#c69246", members: [member(steamId, "Founder name", "tap_god")] }, { key: "guardian", name: "Guardian", description: "Here to help our players.", icon: "shield", color: "#859bdd", members: [member("76561198000000002", "Guardian one", "shadow"), member("76561198000000003", "Guardian two", "beta_tester")] }] };

test("recruitment forms, staff access, themes and compact public cards work across screen sizes", async t => {
  const boundaries = {
    "@/lib/auth/session": `export const getSession=async()=>window.fixtureState==='guest'?null:{steamId:'${steamId}'};export const createAdminActionToken=()=> 'staff-csrf';export const createProfileActionToken=()=> 'player-csrf';`,
    "@/lib/admin/access": `export const getAdminAccess=async()=>({isAdmin:window.fixtureState==='staff',isFounder:false,displayName:'Staff player',groups:['Guardian'],immunity:20,canUnban:true});`,
    "@/lib/recruitment/service": `const application=${JSON.stringify(application)};export const recruitmentMessage=()=>null;export const getRecruitmentPlayer=async()=>({nickname:'Current Steam name',playtimeSeconds:21600,discordLinked:window.fixtureState!=='unlinked',discordProfile:window.fixtureState==='unlinked'?'':application.discordProfile});export const staffRecruitmentRepository=()=>({getState:async()=>({open:window.fixtureState!=='closed'}),getOwnLatest:async()=>window.fixtureState==='active'?application:null,getPage:async()=>{window.fixturePrivateReads++;return{applications:[application,{...application,id:'accepted-application',status:'accepted',nickname:'Accepted applicant',playtimeSeconds:144000}],page:1,pageCount:2,total:26}}});`,
    "@/components/ui/portal-shell": "import React from 'react';export const PortalShell=({children,className='',navigation})=><main className={'tapped-page portal-page '+className}><div className='shell'>{navigation?<div className='portal-workspace-layout'>{navigation}<div className='portal-workspace-content'>{children}</div></div>:children}</div></main>;",
    "next/link": "import React from 'react';export default function Link({children,scroll,prefetch,...props}){return <a {...props}>{children}</a>}",
    "next/image": "import React from 'react';export default function Image({priority,...props}){return <img {...props}/>}",
    "next/navigation": "export const useRouter=()=>({replace(){},push(){},refresh(){}});export const usePathname=()=>'/staff';export const useSearchParams=()=>new URLSearchParams();",
  };
  const bundle = await build({
    stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import{RecruitmentSection}from'./app/staff/recruitment-section';import{StaffShowcase}from'./app/staff/staff-showcase';import RecruitmentPage from'./app/admin/recruitment/page';const params=new URLSearchParams(location.search);window.fixtureState=params.get('state')||'member';window.fixturePrivateReads=0;const root=createRoot(document.getElementById('root'));(async()=>{if(params.get('mode')==='admin')root.render(await RecruitmentPage({searchParams:Promise.resolve({})}));else{const section=await RecruitmentSection({session:window.fixtureState==='guest'?null:{steamId:'${steamId}'},parameters:{}});root.render(<main className="tapped-page portal-page staff-page"><div className="shell">{section}<StaffShowcase directory={${JSON.stringify(directory)}}/></div></main>)}})();`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "recruitment-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const layout = await readFile("app/layout.tsx", "utf8");
  const sheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => match[1]);
  const css = (await Promise.all(sheets.map(path => readFile(resolve("app", path), "utf8")))).join("\n") + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer(async (request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (request.url === "/images/branding/tapped-emblem.svg") { response.setHeader("content-type", "image/svg+xml"); response.end(await readFile("public/images/branding/tapped-emblem.svg")); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html class="global-theme-default" data-theme="default" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    async function withPage(state, width, check, mode = "public", theme = "default") {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(5000);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/?state=${state}&mode=${mode}`);
        await page.locator("main").waitFor();
        if (theme !== "default") await page.evaluate(theme => { document.documentElement.className = `global-theme-${theme.replaceAll("_", "-")}`; document.documentElement.dataset.theme = theme; }, theme);
        await check(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${state}/${mode}/${width} overflows: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({tag:element.tagName,class:element.className,scroll:element.scrollWidth,client:element.clientWidth,right:element.getBoundingClientRect().right})).slice(0,20)))}`);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    }
    await t.test("closed and guest states expose no application form", async () => {
      await withPage("closed", 375, async page => {
        assert.equal(await page.getByText("Recruitment closed", { exact: true }).count(), 1);
        assert.equal(await page.locator('form[action="/api/recruitment"]').count(), 0);
      });
      await withPage("guest", 375, async page => {
        assert.equal(await page.getByRole("link", { name: "Sign in with Steam to apply" }).count(), 1);
        assert.equal(await page.locator('form[action="/api/recruitment"]').count(), 0);
      });
    });
    await t.test("verified applicants get editable names, protected identity fields and a nonblocking low-hour warning", async () => {
      for (const [width, theme] of [[375, "default"], [768, "shadow"], [1440, "tap_god"]]) await withPage("member", width, async page => {
        await page.getByText("Apply to join staff", { exact: true }).click();
        await page.getByLabel("Steam nickname", { exact: false }).fill("Edited Steam name");
        assert.equal(await page.locator('input[name="discordProfile"]').getAttribute("readonly"), "");
        assert.equal(await page.getByLabel("Steam and Discord linked", { exact: true }).isChecked(), true);
        assert.equal(await page.getByLabel("Steam and Discord linked", { exact: true }).isDisabled(), true);
        assert.match(await page.locator("#recruitment-playtime-help").innerText(), /Below 30 hours.*still apply/);
        await page.getByLabel("Age", { exact: true }).fill("24");
        await page.getByRole("radio", { name: "No", exact: true }).check();
        await page.locator('textarea[name="reason"]').fill("I would like to keep the community welcoming and the games fair.");
        assert.equal(await page.locator('form[action="/api/recruitment"]').evaluate(form => form.checkValidity()), true);
        assert.equal(await page.locator('input[name="csrf"][value="player-csrf"]').count(), 1);
        assert.equal(await page.locator('[data-ui="player-owned-container"]').count(), 3);
        assert.equal(await page.locator('a').filter({ hasText: "View profile" }).count(), 3);
        await mkdir(".cache/recruitment-previews", { recursive: true });
        await page.screenshot({ path: `.cache/recruitment-previews/public-${width}.png`, fullPage: true });
      }, "public", theme);
    });
    await t.test("unlinked applicants can supply Discord and active applicants cannot apply twice", async () => {
      await withPage("unlinked", 375, async page => {
        await page.getByText("Apply to join staff", { exact: true }).click();
        assert.equal(await page.locator('input[name="discordProfile"]').getAttribute("readonly"), null);
        assert.equal(await page.getByLabel("Steam and Discord linked", { exact: true }).isChecked(), false);
      });
      await withPage("active", 375, async page => {
        assert.equal(await page.locator('form[action="/api/recruitment"]').count(), 0);
        assert.equal(await page.getByText("Your application is in.", { exact: true }).count(), 1);
      });
    });
    await t.test("private applications are read only after staff authorization", async () => {
      for (const state of ["guest", "member"]) await withPage(state, 375, async page => {
        assert.equal(await page.evaluate(() => window.fixturePrivateReads), 0);
        assert.equal(await page.locator('form[action="/api/admin/recruitment"]').count(), 0);
      }, "admin");
      for (const width of [375, 1440]) await withPage("staff", width, async page => {
        assert.equal(await page.evaluate(() => window.fixturePrivateReads), 1);
        assert.equal(await page.getByRole("button", { name: "Close recruitment", exact: true }).count(), 1);
        assert.equal(await page.getByRole("button", { name: "Save status", exact: true }).count(), 1);
        assert.equal(await page.getByText("Below 30 hours", { exact: true }).count(), 1);
        assert.equal(await page.getByRole("link", { name: "Recruitment", exact: true }).getAttribute("aria-current"), "page");
        assert.equal(await page.getByRole("link", { name: /Next/ }).getAttribute("href"), "/admin/recruitment?page=2");
        await page.screenshot({ path: `.cache/recruitment-previews/admin-${width}.png`, fullPage: true });
      }, "admin");
    });
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
