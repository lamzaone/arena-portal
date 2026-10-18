import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";

const steamId = "76561198000000001";
const staffResponse = "Thanks <script>window.fixtureResponseInjected = true</script> for your application.\nPlease contact a staff member for the next step.";
const application = { id: "e4b62322-7677-4315-a19b-92b8f10236ed", steamId, nickname: "Helpful community player", age: 24, discordProfile: "https://discord.com/users/12345678901234567", discordLinked: true, steamGroupMember: true, playtimeSeconds: 21600, reason: "I want to make every round fair and help new players feel welcome.\nI have time to answer questions and calmly resolve disagreements.", status: "submitted", createdAt: 1792300000000, reviewedBy: null, reviewedAt: null, adminResponse: staffResponse };
const applications = [
  application,
  { ...application, id: "00000000-0000-4000-8000-000000000001", steamId: "76561198000000002", status: "accepted", nickname: "Accepted applicant", playtimeSeconds: 144000, reviewedBy: steamId, reviewedAt: 1792301000000 },
  { ...application, id: "00000000-0000-4000-8000-000000000002", steamId: "76561198000000003", status: "declined", nickname: "Declined applicant", playtimeSeconds: 180000, reviewedBy: steamId, reviewedAt: 1792301000000 },
  ...Array.from({ length: 28 }, (_, index) => ({ ...application, id: `00000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}`, nickname: `Queue applicant ${String(index + 1).padStart(2, "0")}`, status: "reviewing", playtimeSeconds: 144000, adminResponse: "" })),
  { ...application, id: "00000000-0000-4000-8000-000000000031", nickname: "Far page applicant", status: "submitted", playtimeSeconds: 144000, adminResponse: "" },
];
const member = (id, name, theme) => ({ steamId: id, name, avatarUrl: null, presence: "online", profileThemeKey: theme, discordProfileUrl: "https://discord.com/users/12345678901234567", statistics: { bansIssued: 42, communications: { gags: 15, mutes: 8, silences: 6 }, kicksIssued: 23, warningsIssued: 17, playtimeSeconds: 1297800, reputation: 28, commendations: 51, commendationCounts: { helpful: 11, teacher: 7, funny: 13, pro_player: 9, goat: 11 } } });
const directory = { available: true, memberCount: 3, onlineCount: 3, groups: [{ key: "founder", name: "Founder", description: "The community starts here.", icon: "crown", color: "#c69246", members: [member(steamId, "Founder name", "tap_god")] }, { key: "guardian", name: "Guardian", description: "Here to help our players.", icon: "shield", color: "#859bdd", members: [member("76561198000000002", "Guardian one", "shadow"), member("76561198000000003", "Guardian two", "beta_tester")] }] };

const crowdedGroups = [
  { key: "secretary", name: "Secretary", description: "Supporting the team.", icon: "medal", color: "#c68ac7", members: [member("76561198000000004", "Community Secretary", "moderator")] },
  { key: "administrators", name: "Administrators", description: "Keeping every round fair.", icon: "badge", color: "#ffb56a", members: [member("76561198000000005", "Admin teammate", "administrator"), member("76561198000000006", "Second administrator", "vip_gold")] },
  { key: "community-support", name: "Community Support and Player Relations", description: "Helping the community.", icon: "headphones", color: "#b192ff", members: [member("76561198000000007", "Long community support name", "shadow"), member("76561198000000008", "Support teammate", "beta_tester")] },
];

test("recruitment forms, staff access, themes and the public staff directory work across screen sizes", async t => {
  const boundaries = {
    "@/lib/auth/session": `export const getSession=async()=>window.fixtureState==='guest'?null:{steamId:['other-player','wrong-owner'].includes(window.fixtureState)?'76561198000000099':'${steamId}'};export const createAdminActionToken=()=> 'staff-csrf';export const createProfileActionToken=()=> 'player-csrf';`,
    "@/lib/admin/access": `export const getAdminAccess=async()=>({isAdmin:['staff','staff-closed'].includes(window.fixtureState),isFounder:false,displayName:'Staff player',groups:['Guardian'],immunity:20,canUnban:true});`,
    "@/lib/player-identities": "export const resolvePlayerIdentities=async()=>({});",
    "@/lib/recruitment/service": `const application=${JSON.stringify(application)},applications=${JSON.stringify(applications)};export const recruitmentMessage=()=>null;export const getRecruitmentPlayer=async()=>({nickname:'Current Steam name',playtimeSeconds:window.fixtureState==='unknown-hours'?null:21600,discordLinked:window.fixtureState!=='unlinked',discordProfile:window.fixtureState==='unlinked'?'':application.discordProfile});export const staffRecruitmentRepository=()=>({getState:async()=>({open:!['closed','staff-closed'].includes(window.fixtureState)}),getOwnLatest:async id=>{window.fixtureOwnReads.push(id);return window.fixtureState==='wrong-owner'?application:id===application.steamId&&['active','own-final'].includes(window.fixtureState)?{...application,status:window.fixtureState==='own-final'?'accepted':'submitted'}:null},getPage:async(requestedPage,filter={})=>{window.fixturePrivateReads++;const filters={name:String(filter.name||'').normalize('NFKC').trim().slice(0,128),status:['submitted','reviewing','accepted','declined'].includes(filter.status)?filter.status:'all'};window.fixturePageRequests.push({page:requestedPage,...filters});const filtered=applications.filter(item=>(!filters.name||item.nickname.toLowerCase().includes(filters.name.toLowerCase()))&&(filters.status==='all'||item.status===filters.status));const total=filtered.length,pageCount=Math.max(1,Math.ceil(total/25)),page=Math.min(pageCount,Math.max(1,Number.isSafeInteger(requestedPage)?requestedPage:1));return{applications:filtered.slice((page-1)*25,page*25),page,pageCount,total,filters}}});`,
    "@/components/ui/portal-shell": "import React from 'react';export const PortalShell=({children,className='',navigation})=><main className={'tapped-page portal-page '+className}><div className='shell'>{navigation?<div className='portal-workspace-layout'>{navigation}<div className='portal-workspace-content'>{children}</div></div>:children}</div></main>;",
    "next/link": "import React from 'react';export default function Link({children,scroll,prefetch,...props}){return <a {...props}>{children}</a>}",
    "next/image": "import React from 'react';export default function Image({priority,...props}){return <img {...props}/>}",
    "next/navigation": "export const useRouter=()=>({replace(){},push(){},refresh(){}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);",
  };
  const bundle = await build({
    stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import{RecruitmentSection}from'./app/staff/recruitment-section';import{StaffShowcase}from'./app/staff/staff-showcase';import{SiteHeader}from'./components/site-header';import{createPortal}from'react-dom';import{GlobalThemeBackground}from'./components/profile-theme-slots';import{resolvePortalThemeSurface}from'./lib/themes/registry';import{getSession}from'@/lib/auth/session';import RecruitmentPage from'./app/admin/recruitment/page';const params=new URLSearchParams(location.search),admin=location.pathname==='/admin/recruitment'||params.get('mode')==='admin',fixtureDirectory=${JSON.stringify(directory)};if(params.get('layout')==='crowded'){fixtureDirectory.groups.push(...${JSON.stringify(crowdedGroups)});fixtureDirectory.memberCount=8;fixtureDirectory.onlineCount=8}if(params.get('odd')==='1'){fixtureDirectory.groups[1].members.push({...fixtureDirectory.groups[1].members[0],steamId:'76561198000000004',name:'Guardian three'});fixtureDirectory.memberCount=4;fixtureDirectory.onlineCount=4}if(params.get('metrics')==='missing')for(const group of fixtureDirectory.groups)for(const member of group.members)member.statistics={bansIssued:null,communications:{gags:null,mutes:null,silences:null},kicksIssued:null,warningsIssued:null,playtimeSeconds:null,reputation:null,commendations:null,commendationCounts:null};window.fixtureState=params.get('state')||(admin?'staff':'member');window.fixturePrivateReads=0;window.fixtureOwnReads=[];window.fixturePageRequests=[];const viewerTheme=params.get('theme')||'default',viewer=resolvePortalThemeSurface(viewerTheme,'global');document.documentElement.className=viewer.surface.className;document.documentElement.dataset.theme=viewer.theme.key;const root=createRoot(document.getElementById('root')); (async()=>{if(admin)root.render(await RecruitmentPage({searchParams:Promise.resolve(Object.fromEntries(params))}));else{const section=await RecruitmentSection({session:await getSession(),parameters:Object.fromEntries(params)});root.render(<>{createPortal(<GlobalThemeBackground themeKey={viewerTheme}/>,document.body)}<main className="tapped-page portal-page public-staff-page"><div className="shell">{await SiteHeader({authenticated:false})}<StaffShowcase directory={fixtureDirectory} recruitment={section}/></div></main></>)}})();`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "recruitment-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const serverFormBundle = await build({
    stdin: { contents: `import React from'react';import{renderToStaticMarkup}from'react-dom/server';import{RecruitmentApplicationForm}from'./app/staff/recruitment-application-form';export const noScriptForm=renderToStaticMarkup(<RecruitmentApplicationForm csrf="ssr-csrf" player={{nickname:'SSR player',playtimeSeconds:21600,discordLinked:true,discordProfile:'${application.discordProfile}'}}/>);`, loader: "tsx", resolveDir: process.cwd() },
    platform: "node", format: "cjs", bundle: true, write: false, outfile: "server-form.cjs", jsx: "automatic", external: ["react", "react-dom/server"],
    plugins: [{ name: "recruitment-server-form-boundary", setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next/link", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const renderedModule = { exports: {} };
  new Function("require", "module", "exports", serverFormBundle.outputFiles.find(file => file.path.endsWith(".cjs")).text)(createRequire(import.meta.url), renderedModule, renderedModule.exports);
  const layout = await readFile("app/layout.tsx", "utf8");
  const sheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => match[1]);
  const css = (await Promise.all(sheets.map(path => readFile(resolve("app", path), "utf8")))).join("\n") + [...bundle.outputFiles, ...serverFormBundle.outputFiles].filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer(async (request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (request.url === "/images/branding/tapped-emblem.svg") { response.setHeader("content-type", "image/svg+xml"); response.end(await readFile("public/images/branding/tapped-emblem.svg")); }
    else if (request.url === "/no-script-recruitment") { response.setHeader("content-type", "text/html"); response.end(`<!doctype html><html class="global-theme-default" data-theme="default" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><main class="tapped-page portal-page public-staff-page"><div class="shell"><h1>Staff recruitment</h1>${renderedModule.exports.noScriptForm}</div></main></body></html>`); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html class="global-theme-default" data-theme="default" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root" class="portal-content"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    async function withPage(state, width, check, mode = "public", theme = "default", reducedMotion = "reduce", query = {}) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion });
      page.setDefaultTimeout(5000);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}${mode === "admin" ? "/admin/recruitment" : "/staff"}?${new URLSearchParams({ state, mode, theme, ...query })}`);
        await page.locator("main").waitFor();
        await check(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${state}/${mode}/${width} overflows: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({tag:element.tagName,class:element.className,scroll:element.scrollWidth,client:element.clientWidth,right:element.getBoundingClientRect().right})).slice(0,20)))}`);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    }
    await t.test("rank headings paint a continuous red divider above every actual theme background", async () => {
      const themes = ["default", "vip_silver", "vip_gold", "vip_diamond", "vip_ultimate", "staff", "moderator", "administrator", "senior_administrator", "owner", "beta_tester", "shadow", "tap_god"];
      const cases = [...themes.map(theme => [1440, theme]), [390, "tap_god"], [768, "tap_god"], [1920, "tap_god"]];
      for (const [width, theme] of cases) await withPage("closed", width, async page => {
        assert.equal(await page.locator('[data-theme-background-surface="global"]').count(), 1, "exercise the production theme backdrop");
        const headings = page.locator('section[data-featured] > div:first-child');
        for (const heading of await headings.all()) {
          const line = await heading.evaluate(element => {
            const style = getComputedStyle(element, "::after");
            return { width: parseFloat(style.width), height: parseFloat(style.height), color: style.backgroundColor, opacity: style.opacity, display: style.display };
          });
          assert.ok(line.width >= 48 && line.height >= 2 && line.opacity === "1" && line.display !== "none", `rank divider needs visible area at ${theme}/${width}: ${JSON.stringify(line)}`);
          const headingBounds = await heading.boundingBox();
          const titleBounds = await heading.locator('h3').boundingBox();
          const countBounds = await heading.locator(':scope > span').last().boundingBox();
          const shot = await heading.screenshot();
          const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          const start = Math.max(0, Math.ceil(titleBounds.x + titleBounds.width - headingBounds.x + 7));
          const end = Math.min(info.width, Math.floor(countBounds.x - headingBounds.x - 7));
          let redPixels = 0;
          for (let y = 0; y < info.height; y++) for (let x = start; x < end; x++) {
            const offset = (y * info.width + x) * info.channels;
            const [red, green, blue] = data.subarray(offset, offset + 3);
            if (red > 110 && red > green * 1.8 && red > blue * 1.4) redPixels++;
          }
          assert.ok(end - start >= 40 && redPixels >= (end - start) * 1.5, `rank divider must paint red across its visible rule at ${theme}/${width}: ${redPixels} pixels across ${end - start}px`);
        }
        if (theme === "tap_god") {
          await mkdir(".cache/recruitment-previews", { recursive: true });
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
          await page.screenshot({ path: `.cache/recruitment-previews/crowded-tap-god-${width}.png`, fullPage: true });
        }
      }, "public", theme, "reduce", { layout: "crowded" });
    });
    await t.test("recruitment is encountered before the staff directory", async () => {
      for (const width of [390, 768, 1440, 1920]) await withPage("member", width, async page => {
        const recruitment = page.locator("#recruitment");
        const sidebar = page.locator("[data-staff-sidebar]");
        const before = await recruitment.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector("[data-staff-sidebar]")) & Node.DOCUMENT_POSITION_FOLLOWING));
        assert.equal(before, true, "recruitment must precede the roster in reading and keyboard order");
        const recruitmentBounds = await recruitment.boundingBox(), sidebarBounds = await sidebar.boundingBox();
        assert.ok(recruitmentBounds.y + recruitmentBounds.height <= sidebarBounds.y + 1, "recruitment must appear above the staff workspace");
      });
    });
    await t.test("single-member compact roles share the ordinary card width instead of stretching", async () => {
      for (const width of [390, 768, 1440, 1920]) await withPage("closed", width, async page => {
        const secretary = page.locator('section[aria-labelledby="staff-group-secretary"] article[data-staff-card="compact"]');
        const ordinary = page.locator('section[aria-labelledby="staff-group-guardian"] article[data-staff-card="compact"]').first();
        const a = await secretary.boundingBox(), b = await ordinary.boundingBox();
        assert.ok(Math.abs(a.width - b.width) <= 1, "singleton and ordinary compact cards must use the same width at " + width + "px; got " + a.width + " and " + b.width);
        assert.ok(Math.abs(a.x - b.x) <= 1, "singleton compact roles align with the first ordinary column");
        if (width === 768) assert.ok(a.width <= 640, "tablet compact cards stay within a readable 640px row");
        const summary = secretary.locator("summary");
        const parts = await Promise.all([summary.locator(':scope > div'), summary.locator('dl[aria-label="Member overview"]'), summary.locator(':scope > span')].map(part => part.boundingBox()));
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
          const p = parts[i], q = parts[j];
          assert.ok(p.x + p.width <= q.x + 1 || q.x + q.width <= p.x + 1 || p.y + p.height <= q.y + 1 || q.y + q.height <= p.y + 1, "compact identity, statistics and Details remain separate");
        }
        await summary.click();
        assert.equal(await secretary.locator('dl[aria-label="Admin actions taken"]').isVisible(), true);
        assert.equal(await secretary.getByRole("link", { name: "View Community Secretary's profile", exact: true }).isVisible(), true);
      }, "public", "tap_god", "reduce", { layout: "crowded" });
    });
    await t.test("compact staff rows hide full statistics until their native disclosure opens", async () => {
      for (const width of [390, 1440]) await withPage("closed", width, async page => {
        const guardians = page.locator('section[aria-labelledby="staff-group-guardian"]');
        const disclosures = guardians.locator("details[data-staff-details]");
        assert.equal(await disclosures.count(), 2, "each compact staff member needs a native details disclosure");
        const details = disclosures.first();
        const summary = details.locator(":scope > summary");
        assert.equal(await summary.getAttribute("aria-label"), "Details for Guardian one");
        assert.equal(await details.getAttribute("open"), null);
        assert.match(await summary.innerText(), /Guardian one/);
        const overview = summary.locator('dl[aria-label="Member overview"]');
        assert.equal(await overview.isVisible(), true);
        assert.deepEqual(await overview.locator("dt").allTextContents(), ["Hours", "Reputation", "Commends"]);
        assert.deepEqual(await overview.locator("dd > strong").allTextContents(), ["360.5", "+28", "51"]);
        assert.equal(await summary.locator("a, button, input").count(), 0, "the native summary must not contain competing interactive controls");
        assert.equal(await details.locator('dl[aria-label="Admin actions taken"]').isVisible(), false);
        const profile = details.getByRole("link", { name: "View Guardian one's profile", exact: true });
        const discord = details.getByRole("link", { name: "Open Guardian one's Discord profile (opens in a new tab)", exact: true });
        assert.equal(await profile.isVisible(), false);
        await summary.focus();
        await page.keyboard.press("Enter");
        assert.notEqual(await details.getAttribute("open"), null);
        assert.equal(await details.locator('dl[aria-label="Admin actions taken"]').isVisible(), true);
        assert.equal(await profile.isVisible(), true);
        assert.equal(await profile.getAttribute("href"), "/players/76561198000000002");
        assert.equal(await discord.isVisible(), true);
        assert.equal(await discord.getAttribute("href"), "https://discord.com/users/12345678901234567");
        assert.equal(await discord.getAttribute("target"), "_blank");
        assert.match(await discord.getAttribute("rel"), /noopener/);
        assert.match(await discord.getAttribute("rel"), /noreferrer/);
        await page.keyboard.press("Space");
        assert.equal(await details.getAttribute("open"), null);
        assert.equal(await profile.isVisible(), false);
      });
    });
    await t.test("sidebar and top role filters stay synchronized while searching and resetting the directory", async () => {
      for (const width of [390, 1440]) await withPage("closed", width, async page => {
        const sidebar = page.getByRole("navigation", { name: "Staff roles", exact: true });
        const filters = page.getByRole("navigation", { name: "Filter staff by admin group", exact: true });
        const cards = page.locator('article[data-ui="player-owned-container"]');
        const search = page.getByRole("searchbox", { name: "Search staff by name, group or Steam ID", exact: true });
        async function selected(name) {
          for (const nav of [sidebar, filters]) {
            assert.equal(await nav.getByRole("button", { name: new RegExp(`^${name}\\b`) }).getAttribute("aria-pressed"), "true");
            assert.equal(await nav.locator('button[aria-pressed="true"]').count(), 1);
          }
        }
        assert.deepEqual(await cards.locator("h4").allTextContents(), ["Founder name", "Guardian one", "Guardian two"]);
        for (const nav of [sidebar, filters]) assert.deepEqual(await nav.locator("button b").allTextContents(), ["3", "1", "2"], "role controls keep the directory's real member counts and order");
        await selected("All staff");
        await sidebar.getByRole("button", { name: /^Guardian\b/ }).focus();
        await page.keyboard.press("Enter");
        await selected("Guardian");
        assert.deepEqual(await cards.locator("h4").allTextContents(), ["Guardian one", "Guardian two"]);
        await search.fill("Guardian one");
        assert.equal(await cards.count(), 1);
        await filters.getByRole("button", { name: /^Founder\b/ }).click();
        await selected("Founder");
        assert.equal(await cards.count(), 0, "role and name filters apply together");
        assert.equal(await page.getByRole("heading", { name: "No staff found.", exact: true }).isVisible(), true);
        await page.getByRole("button", { name: /^Show all staff\b/ }).click();
        assert.equal(await search.inputValue(), "");
        await selected("All staff");
        assert.equal(await cards.count(), 3);
        await filters.getByRole("button", { name: /^Guardian\b/ }).click();
        await selected("Guardian");
        await sidebar.getByRole("button", { name: /^All staff\b/ }).click();
        await selected("All staff");
        await search.fill("76561198000000003");
        assert.deepEqual(await cards.locator("h4").allTextContents(), ["Guardian two"]);
        await search.fill("Ｆｏｕｎｄｅｒ");
        assert.deepEqual(await cards.locator("h4").allTextContents(), ["Founder name"], "staff search normalizes full-width names");
        await search.fill("guardian");
        assert.deepEqual(await cards.locator("h4").allTextContents(), ["Guardian one", "Guardian two"], "staff search also matches role names");
      });
    });
    await t.test("application reviews initially expose only player names and expand controls", async () => {
      for (const [width, theme] of [[390, "default"], [768, "shadow"], [1440, "tap_god"]]) await withPage("staff", width, async page => {
        const rows = page.locator('details[data-ui="recruitment-application"]');
        assert.equal(await rows.count(), 25, "every application must be a collapsed review disclosure");
        for (const [index, row] of (await rows.all()).entries()) {
          assert.equal(await row.getAttribute("open"), null);
          const summary = row.locator(":scope > summary");
          assert.equal(await summary.isVisible(), true);
          assert.equal((await summary.innerText()).trim(), applications[index].nickname, "the collapsed row shows only its player's name");
          assert.equal(await row.locator('[data-status]').isVisible(), false);
          assert.equal(await row.locator('textarea[name="response"]').isVisible(), false);
          assert.equal(await row.locator("dl").isVisible(), false);
          assert.equal(await row.getByText(applications[index].reason, { exact: true }).isVisible(), false);
        }
        await mkdir(".cache/recruitment-previews", { recursive: true });
        await page.screenshot({ path: `.cache/recruitment-previews/admin-collapsed-${width}.png`, fullPage: true });
        await rows.first().locator(":scope > summary").click();
        await rows.first().locator('[data-status]').waitFor({ state: "visible" });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: `.cache/recruitment-previews/admin-expanded-${width}.png`, fullPage: true });
      }, "admin", theme);
    });
    await t.test("expanding an application reveals its private facts, reason and editable plain-text staff response", async () => {
      for (const width of [390, 1440]) await withPage("staff", width, async page => {
        const row = page.locator('details[data-ui="recruitment-application"]').first();
        await row.locator(":scope > summary").click();
        await row.locator('[data-status]').waitFor({ state: "visible" });
        assert.equal(await row.getAttribute("open"), "");
        assert.equal(await row.locator('[data-status="submitted"]').isVisible(), true);
        assert.equal(await row.getByText(steamId, { exact: true }).first().isVisible(), true);
        assert.equal(await row.locator('section[aria-label="Application baseline requirements"] li[data-state="unmet"]').filter({ hasText: "30+ server hours" }).isVisible(), true);
        assert.equal(await row.getByText(application.reason, { exact: true }).isVisible(), true);
        assert.equal(await row.getByRole("link", { name: /Open Discord/ }).isVisible(), true);
        const response = row.locator('textarea[name="response"]');
        assert.equal(await response.isVisible(), true);
        assert.equal(await response.getAttribute("maxlength"), "2000");
        assert.equal(await response.inputValue(), staffResponse);
        assert.equal(await page.evaluate(() => window.fixtureResponseInjected), undefined);
        assert.equal(await row.locator("script").count(), 0);
        assert.equal(await row.locator('select[name="status"]').isVisible(), true);
        await row.locator(":scope > summary").click();
        await response.waitFor({ state: "hidden" });
      }, "admin");
    });
    await t.test("name and status filters search all applications and persist in pagination URLs", async () => {
      await withPage("staff", 390, async page => {
        const filters = page.locator('form[method="get"]');
        await filters.locator('input[name="name"]').fill("Far page applicant");
        await filters.locator('select[name="status"]').selectOption("submitted");
        await filters.locator('button[type="submit"]').click();
        await page.waitForURL(url => url.pathname === "/admin/recruitment" && url.searchParams.get("name") === "Far page applicant");
        await page.locator('details[data-ui="recruitment-application"]').waitFor();
        assert.equal(await page.locator('details[data-ui="recruitment-application"]').count(), 1);
        assert.equal(await page.locator('details[data-ui="recruitment-application"] > summary').innerText(), "Far page applicant");
        assert.equal(await page.locator('form[method="get"] input[name="name"]').inputValue(), "Far page applicant");
        assert.equal(await page.locator('form[method="get"] select[name="status"]').inputValue(), "submitted");
        assert.deepEqual(await page.evaluate(() => window.fixturePageRequests), [{ page: 1, name: "Far page applicant", status: "submitted" }]);
        await page.locator('form[method="get"] input[name="name"]').fill("Queue applicant");
        await page.locator('form[method="get"] select[name="status"]').selectOption("reviewing");
        await page.locator('form[method="get"] button[type="submit"]').click();
        await page.waitForURL(url => url.searchParams.get("name") === "Queue applicant");
        await page.getByRole("navigation", { name: "Recruitment application pages" }).waitFor();
        const next = page.getByRole("link", { name: /Next/ });
        const nextUrl = new URL(await next.getAttribute("href"), page.url());
        assert.equal(nextUrl.searchParams.get("page"), "2");
        assert.equal(nextUrl.searchParams.get("name"), "Queue applicant");
        assert.equal(nextUrl.searchParams.get("status"), "reviewing");
        await next.click();
        await page.waitForURL(url => url.searchParams.get("page") === "2");
        await page.locator('details[data-ui="recruitment-application"]').first().waitFor();
        assert.equal(await page.locator('details[data-ui="recruitment-application"]').count(), 3);
        assert.deepEqual(await page.evaluate(() => window.fixturePageRequests), [{ page: 2, name: "Queue applicant", status: "reviewing" }]);
        const previousUrl = new URL(await page.getByRole("link", { name: /Previous/ }).getAttribute("href"), page.url());
        assert.equal(previousUrl.searchParams.get("page") ?? "1", "1");
        assert.equal(previousUrl.searchParams.get("name"), "Queue applicant");
        assert.equal(previousUrl.searchParams.get("status"), "reviewing");
        const reset = page.getByRole("link", { name: /Clear filters|Reset filters|Reset search/ });
        await reset.click();
        await page.waitForURL(url => url.pathname === "/admin/recruitment" && !url.searchParams.has("name") && !url.searchParams.has("status") && !url.searchParams.has("page"));
        await page.locator('details[data-ui="recruitment-application"]').first().waitFor();
        assert.equal(await page.locator('form[method="get"] input[name="name"]').inputValue(), "");
        assert.equal(await page.locator('form[method="get"] select[name="status"]').inputValue(), "all");
        assert.equal(await page.locator('details[data-ui="recruitment-application"]').count(), 25);
      }, "admin");
    });
    await t.test("reviews submit response, decision and the filtered return context together", async () => {
      await withPage("staff", 390, async page => {
        const row = page.locator('details[data-ui="recruitment-application"]').first();
        await row.locator(":scope > summary").click();
        const form = row.locator('form[action="/api/admin/recruitment"]');
        const response = form.locator('textarea[name="response"]');
        await response.fill("x".repeat(2100));
        assert.equal((await response.inputValue()).length, 2000, "the browser enforces the response limit");
        const responseText = "A careful review. <b>This remains plain text.</b>\nWe have accepted your application.";
        await response.fill(responseText);
        await form.locator('select[name="status"]').selectOption("accepted");
        assert.equal(await form.locator('input[name="returnName"]').inputValue(), "Queue applicant");
        assert.equal(await form.locator('input[name="returnStatus"]').inputValue(), "reviewing");
        assert.equal(await form.locator('input[name="returnPage"]').inputValue(), "2");
        const requestPromise = page.waitForRequest(request => new URL(request.url()).pathname === "/api/admin/recruitment" && request.method() === "POST");
        await page.route("**/api/admin/recruitment", route => route.fulfill({ status: 200, contentType: "text/html", body: "<p>Saved by the recruitment test fixture.</p>" }));
        await form.locator('button[type="submit"]').click();
        const request = await requestPromise;
        const payload = new URLSearchParams(request.postData());
        assert.equal(payload.get("csrf"), "staff-csrf");
        assert.equal(payload.get("action"), "review");
        assert.equal(payload.get("response").replaceAll("\r\n", "\n"), responseText);
        assert.equal(payload.get("status"), "accepted");
        assert.equal(payload.get("returnName"), "Queue applicant");
        assert.equal(payload.get("returnStatus"), "reviewing");
        assert.equal(payload.get("returnPage"), "2");
      }, "admin", "default", "reduce", { name: "Queue applicant", status: "reviewing", page: "2" });
    });
    await t.test("final decisions allow response edits while keeping the accepted or declined status fixed", async () => {
      for (const status of ["accepted", "declined"]) await withPage("staff", 390, async page => {
        const row = page.locator('details[data-ui="recruitment-application"]').first();
        await row.locator(":scope > summary").click();
        assert.equal(await row.locator('select[name="status"]').count(), 0);
        const form = row.locator('form[action="/api/admin/recruitment"]');
        assert.equal(await form.locator('textarea[name="response"]').isEditable(), true);
        assert.equal(await form.locator('input[name="status"]').inputValue(), status);
        await form.locator('textarea[name="response"]').fill("Updated next steps for the applicant.");
        const payload = await form.evaluate(element => Object.fromEntries(new FormData(element)));
        assert.equal(payload.status, status);
        assert.equal(payload.response, "Updated next steps for the applicant.");
        assert.equal(payload.returnStatus, status);
      }, "admin", "default", "reduce", { status });
    });
    await t.test("opening and closing recruitment preserve the filtered review context", async () => {
      for (const [state, expectedOpen] of [["staff", "no"], ["staff-closed", "yes"]]) await withPage(state, 390, async page => {
        const form = page.locator('form:has(input[name="action"][value="set-open"])');
        assert.equal(await form.locator('input[name="returnName"]').inputValue(), "Queue applicant");
        assert.equal(await form.locator('input[name="returnStatus"]').inputValue(), "reviewing");
        assert.equal(await form.locator('input[name="returnPage"]').inputValue(), "2");
        const requestPromise = page.waitForRequest(request => new URL(request.url()).pathname === "/api/admin/recruitment" && request.method() === "POST");
        await page.route("**/api/admin/recruitment", route => route.fulfill({ status: 200, contentType: "text/html", body: "<p>Recruitment state saved by the test fixture.</p>" }));
        await form.locator('button[type="submit"]').click();
        const payload = new URLSearchParams((await requestPromise).postData());
        assert.equal(payload.get("action"), "set-open");
        assert.equal(payload.get("open"), expectedOpen);
        assert.equal(payload.get("returnName"), "Queue applicant");
        assert.equal(payload.get("returnStatus"), "reviewing");
        assert.equal(payload.get("returnPage"), "2");
      }, "admin", "default", "reduce", { name: "Queue applicant", status: "reviewing", page: "2" });
    });
    await t.test("founders stay expanded beside the role sidebar with their equipped theme and complete statistics", async () => {
      for (const [width, theme] of [[390, "default"], [768, "shadow"], [1440, "tap_god"]]) await withPage("closed", width, async page => {
        const founderGroup = page.locator('section[aria-labelledby="staff-group-founder"]');
        const card = founderGroup.locator('article[data-ui="player-owned-container"]');
        const groupBounds = await founderGroup.boundingBox();
        const cardBounds = await card.boundingBox();
        assert.equal(await card.getAttribute("data-staff-card"), "featured");
        assert.equal(await card.locator("details").count(), 0, "the founder's full statistics remain expanded");
        assert.ok(cardBounds.x >= groupBounds.x - 1 && cardBounds.x + cardBounds.width <= groupBounds.x + groupBounds.width + 1, "the featured card stays inside its role");
        assert.ok(cardBounds.width >= groupBounds.width * .95, "the featured member fills the directory width");
        const sidebar = page.getByRole("navigation", { name: "Staff roles", exact: true });
        const sidebarBounds = await sidebar.boundingBox();
        const directoryBounds = await page.locator("#staff-directory").boundingBox();
        if (width >= 1100) {
          assert.ok(sidebarBounds.x + sidebarBounds.width <= directoryBounds.x + 1, "role navigation sits to the left of the directory");
          assert.ok(cardBounds.width > 600, "the founder has room for identity and full statistics on desktop");
        } else {
          assert.ok(sidebarBounds.y < directoryBounds.y, "role navigation stacks above the directory on smaller screens");
        }
        assert.equal(await page.locator('a[href="#recruitment"]').first().isVisible(), true);
        for (const [id, equippedTheme] of [[steamId, "tap_god"], ["76561198000000002", "shadow"], ["76561198000000003", "beta_tester"]]) {
          const player = page.locator(`article[data-player-owner="${id}"]`);
          assert.equal(await player.getAttribute("data-theme"), equippedTheme, "the represented player's equipped theme survives a different page theme");
          assert.equal(await player.getAttribute("data-theme-owner"), "player");
          assert.equal(await player.getAttribute("data-theme-surface"), "player-container");
        }
        assert.equal(await card.getByRole("link", { name: "View Founder name's profile", exact: true }).last().getAttribute("href"), `/players/${steamId}`);
        const actions = card.locator('dl[aria-label="Admin actions taken"]');
        assert.equal(await actions.isVisible(), true);
        assert.deepEqual(await actions.locator("dt").allTextContents(), ["Bans", "Kicks · portal", "Warns"]);
        assert.deepEqual(await actions.locator("dd").allTextContents(), ["42", "23", "17"]);
        assert.deepEqual(await card.locator('dl[aria-label="Communication restrictions issued"] dt').allTextContents(), ["Gags", "Mutes", "Silences"]);
        assert.deepEqual(await card.locator('dl[aria-label="Communication restrictions issued"] dd').allTextContents(), ["15", "8", "6"]);
        const standing = card.locator('dl[aria-label="Player standing"]');
        assert.equal(await standing.isVisible(), true);
        assert.deepEqual(await standing.locator("dt").allTextContents(), ["Hours played", "Reputation"]);
        assert.equal((await standing.locator("dd > strong").allTextContents())[0], "360.5");
        assert.equal((await standing.locator("dd > strong").allTextContents())[1], "+28");
        const commends = card.locator('section[aria-label="Commendation breakdown"]');
        assert.equal(await commends.locator("[data-commendation]").count(), 5);
        for (const [key, label, count] of [["helpful", "Helpful", 11], ["teacher", "Teacher", 7], ["funny", "Funny", 13], ["pro_player", "Pro player", 9], ["goat", "GOAT", 11]]) {
          const kind = commends.locator(`[data-commendation="${key}"]`);
          assert.equal(await kind.locator("dt").innerText(), label);
          assert.equal(await kind.locator("dd").innerText(), String(count));
        }
        assert.match(await commends.innerText(), /51/);
        await mkdir(".cache/recruitment-previews", { recursive: true });
        await card.screenshot({ path: `.cache/recruitment-previews/member-redesign-${width}.png`, style: ".portal-navigation { visibility: hidden !important; }" });
      }, "public", theme);
    });
    await t.test("unavailable staff statistics and commendation categories stay honest instead of becoming zero", async () => {
      await withPage("closed", 390, async page => {
        const card = page.locator('article[data-ui="player-owned-container"]').first();
        const actions = card.locator('dl[aria-label="Admin actions taken"]');
        assert.deepEqual(await actions.locator("dd").allTextContents(), ["—", "—", "—"]);
        const standing = card.locator('dl[aria-label="Player standing"]');
        assert.deepEqual(await standing.locator("dd > strong").allTextContents(), ["—", "—"]);
        const commends = card.locator('section[aria-label="Commendation breakdown"]');
        assert.deepEqual(await commends.locator("[data-commendation] dd").allTextContents(), Array(5).fill("—"));
        assert.equal(await commends.getByText("0", { exact: true }).count(), 0);
        const compact = page.locator('article[data-staff-card="compact"]').first();
        const summary = compact.locator("details[data-staff-details] > summary");
        assert.deepEqual(await summary.locator('dl[aria-label="Member overview"] dd > strong').allTextContents(), ["—", "—", "—"], "compact hours, reputation and commend totals all stay unavailable");
        await summary.click();
        assert.deepEqual(await compact.locator('dl[aria-label="Admin actions taken"] dd').allTextContents(), ["—", "—", "—"]);
        assert.deepEqual(await compact.locator('dl[aria-label="Communication restrictions issued"] dd').allTextContents(), ["—", "—", "—"]);
        assert.deepEqual(await compact.locator('[data-commendation] dd').allTextContents(), Array(5).fill("—"));
      }, "public", "default", "reduce", { metrics: "missing" });
    });
    await t.test("compact staff rows preserve member order and stay inside their role at every breakpoint", async () => {
      for (const width of [390, 1440, 1700]) await withPage("closed", width, async page => {
        const group = page.locator('section[aria-labelledby="staff-group-guardian"]');
        const cards = group.locator('article[data-ui="player-owned-container"]');
        assert.equal(await cards.count(), 3);
        assert.deepEqual(await cards.locator("h4").allTextContents(), ["Guardian one", "Guardian two", "Guardian three"]);
        assert.equal(await cards.locator('details[data-staff-details]:not([open])').count(), 3);
        const first = await cards.nth(0).boundingBox();
        const second = await cards.nth(1).boundingBox();
        const last = await cards.nth(2).boundingBox();
        const groupBounds = await group.boundingBox();
        assert.ok(Math.abs(last.width - first.width) <= 1, "the final staff row keeps the same width");
        for (const card of await cards.all()) {
          const bounds = await card.boundingBox();
          assert.equal(await card.getAttribute("data-staff-card"), "compact");
          assert.ok(bounds.x >= groupBounds.x - 1 && bounds.x + bounds.width <= groupBounds.x + groupBounds.width + 1, "compact rows stay inside their role");
          assert.ok(bounds.height < 260, "collapsed staff rows remain quick to scan");
        }
        await mkdir(".cache/recruitment-previews", { recursive: true });
        await group.screenshot({ path: `.cache/recruitment-previews/compact-rows-${width}.png` });
        const bounds = [first, second, last];
        for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
          const a = bounds[i], b = bounds[j];
          assert.ok(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1, `staff cards do not overlap at ${width}px`);
        }
        if (width === 390) assert.ok(second.y >= first.y + first.height - 1, "phone layouts stack compact staff into separate rows");
        if (width === 1700) assert.ok(Math.abs(first.y - second.y) <= 1 && last.y >= first.y + first.height - 1, "wide screens use two compact columns");
      }, "public", "default", "reduce", { odd: "1" });
    });
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
      for (const [width, theme] of [[390, "default"], [768, "shadow"], [1440, "tap_god"]]) await withPage("member", width, async page => {
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
        const shell = await page.locator('.shell').boundingBox();
        const recruitment = await page.locator('#recruitment').boundingBox();
        assert.ok(Math.abs(shell.width - recruitment.width) < 1, `recruitment must fill the public shell at ${width}`);
        const navigation = await page.locator('.portal-navigation').boundingBox();
        assert.ok(Math.abs(navigation.width - recruitment.width) < 1, `public navigation and recruitment must align at ${width}`);
        await mkdir(".cache/recruitment-previews", { recursive: true });
        await page.locator("#recruitment").screenshot({ path: `.cache/recruitment-previews/criteria-${width}.png`, style: ".portal-navigation { visibility: hidden !important; }" });
        const cards = await page.locator('article[data-ui="player-owned-container"]').all();
        const directory = await page.locator("#staff-directory").boundingBox();
        for (const card of cards) {
          const size = await card.boundingBox();
          assert.ok(size.x >= directory.x - 1 && size.x + size.width <= directory.x + directory.width + 1, `staff cards stay inside the public directory at ${width}px`);
        }
        const portrait = await cards[0].locator('a').first().boundingBox();
        assert.ok(portrait.width >= (width <= 640 ? 71 : 91), `staff portraits should be larger at ${width}px; got ${portrait.width}px`);
        await page.getByText('Apply to join staff', { exact: true }).click();
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await mkdir(".cache/recruitment-previews", { recursive: true });
        await page.screenshot({ path: `.cache/recruitment-previews/public-${width}.png`, fullPage: true });
        await cards[0].screenshot({ path: `.cache/recruitment-previews/member-${width}.png` });
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
    await t.test("baseline requirements update live, mark unmet rules red, and never block a valid application", async () => {
      await withPage("member", 390, async page => {
        await page.getByText("Apply to join staff", { exact: true }).click();
        const age = page.locator('[data-requirement="age"]');
        const playtime = page.locator('[data-requirement="playtime"]');
        const discord = page.locator('[data-requirement="discord_link"]');
        const steamGroup = page.locator('[data-requirement="steam_group"]');
        assert.equal(await age.getAttribute("data-state"), "pending");
        assert.equal(await steamGroup.getAttribute("data-state"), "pending");
        assert.equal(await playtime.getAttribute("data-state"), "unmet");
        assert.equal(await discord.getAttribute("data-state"), "met");
        await page.getByLabel("Age", { exact: true }).fill("17");
        assert.equal(await age.getAttribute("data-state"), "unmet");
        assert.equal(await age.getByText("Not met", { exact: true }).isVisible(), true);
        assert.equal(await age.getByText("Not met", { exact: true }).evaluate(element => { const rgb = getComputedStyle(element).color.match(/[\d.]+/g).map(Number); return rgb[0] > rgb[1] * 1.2 && rgb[0] > rgb[2] * 1.1; }), true, "unmet age is visibly red");
        await page.getByLabel("Age", { exact: true }).fill("18");
        assert.equal(await age.getAttribute("data-state"), "met");
        await page.getByRole("radio", { name: "No", exact: true }).check();
        assert.equal(await steamGroup.getAttribute("data-state"), "unmet");
        await page.getByRole("radio", { name: "Yes", exact: true }).check();
        assert.equal(await steamGroup.getAttribute("data-state"), "met");
        await page.getByLabel("Age", { exact: true }).fill("17");
        await page.getByRole("radio", { name: "No", exact: true }).check();
        await page.locator('textarea[name="reason"]').fill("I would like to help players have fair, welcoming games in the arena.");
        assert.equal(await page.locator('form[action="/api/recruitment"]').evaluate(form => form.checkValidity()), true);
        assert.equal(await page.locator('form[action="/api/recruitment"] button[type="submit"]').isEnabled(), true);
        assert.equal(await page.getByText(/This may lower your chance of acceptance\. You can still submit your application\./).isVisible(), true);
        assert.equal(await playtime.getAttribute("data-state"), "unmet", "server playtime stays immutable while editable criteria change");
      });
      await withPage("unknown-hours", 390, async page => {
        await page.getByText("Apply to join staff", { exact: true }).click();
        const playtime = page.locator('[data-requirement="playtime"]');
        assert.equal(await playtime.getAttribute("data-state"), "unverified");
        assert.equal(await playtime.getByText("Unverified", { exact: true }).isVisible(), true);
        await page.getByLabel("Age", { exact: true }).fill("24");
        await page.getByRole("radio", { name: "Yes", exact: true }).check();
        await page.locator('textarea[name="reason"]').fill("I would like to help players have fair, welcoming games in the arena.");
        assert.equal(await page.locator('form[action="/api/recruitment"]').evaluate(form => form.checkValidity()), true);
        assert.equal(await page.locator('form[action="/api/recruitment"] button[type="submit"]').isEnabled(), true);
      });
    });
    await t.test("the server-rendered form remains usable with JavaScript disabled", async () => {
      const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 1000 } });
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/no-script-recruitment`);
        assert.equal(await page.getByText(/The checklist cannot update without JavaScript/).isVisible(), true);
        const form = page.locator('form[action="/api/recruitment"][method="post"]');
        assert.equal(await form.locator('[data-requirement="age"]').getAttribute("data-state"), "pending");
        assert.equal(await form.locator('[data-requirement="steam_group"]').getAttribute("data-state"), "pending");
        assert.equal(await form.locator('[data-requirement="playtime"]').getAttribute("data-state"), "unmet");
        assert.equal(await form.locator('[data-requirement="discord_link"]').getAttribute("data-state"), "met");
        assert.equal(await form.locator('input[name="discordProfile"]').getAttribute("readonly"), "");
        assert.equal(await form.getByRole("checkbox", { name: "Steam and Discord linked", exact: true }).isDisabled(), true);
        await form.getByLabel("Age", { exact: true }).fill("17");
        await form.getByRole("radio", { name: "No", exact: true }).check();
        await form.locator('textarea[name="reason"]').fill("I would like to help players have fair, welcoming games in the arena.");
        assert.equal(await form.locator('button[type="submit"]').isEnabled(), true);
        const requestPromise = page.waitForRequest(request => new URL(request.url()).pathname === "/api/recruitment" && request.method() === "POST");
        await page.route("**/api/recruitment", route => route.fulfill({ status: 200, contentType: "text/html", body: "<p>Application accepted by the test fixture.</p>" }));
        await form.locator('button[type="submit"]').click();
        const payload = new URLSearchParams((await requestPromise).postData());
        assert.equal(payload.get("csrf"), "ssr-csrf");
        assert.equal(payload.get("age"), "17");
        assert.equal(payload.get("steamGroupMember"), "no");
        assert.equal(payload.get("nickname"), "SSR player");
      } finally { await page.close(); }
    });
    await t.test("only the applicant can read their latest staff response, rendered as escaped plain text", async () => {
      for (const state of ["active", "own-final"]) await withPage(state, 390, async page => {
        const response = page.locator("[data-application-response]");
        assert.equal(await response.count(), 1);
        assert.equal(await response.isVisible(), true);
        assert.match(await response.innerText(), /Staff response/);
        assert.match(await response.innerText(), /Thanks <script>window\.fixtureResponseInjected = true<\/script> for your application\./);
        assert.equal(await response.locator("script, b, img").count(), 0);
        assert.equal(await page.evaluate(() => window.fixtureResponseInjected), undefined);
        assert.deepEqual(await page.evaluate(() => window.fixtureOwnReads), [steamId]);
        assert.equal(await page.evaluate(() => window.fixturePrivateReads), 0);
      });
      for (const state of ["guest", "member", "other-player", "wrong-owner"]) await withPage(state, 390, async page => {
        assert.equal(await page.locator("[data-application-response]").count(), 0);
        assert.equal(await page.getByText(staffResponse, { exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => window.fixturePrivateReads), 0);
        assert.deepEqual(await page.evaluate(() => window.fixtureOwnReads), state === "guest" ? [] : [["other-player", "wrong-owner"].includes(state) ? "76561198000000099" : steamId]);
      });
    });
    await t.test("card tilt can be paused and respects the system motion preference", async () => {
      await withPage("closed", 1440, async page => {
        const card = page.locator('article[data-ui="player-owned-container"]').first();
        await card.scrollIntoViewIfNeeded();
        const bounds = await card.boundingBox();
        await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .3);
        await page.waitForFunction(() => document.querySelector('article[data-ui="player-owned-container"]').style.getPropertyValue('--tilt-y') !== '');
        await page.evaluate(() => { document.documentElement.dataset.visualMotion = 'paused'; });
        await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .4);
        await page.waitForFunction(() => document.querySelector('article[data-ui="player-owned-container"]').style.getPropertyValue('--tilt-y') === '');
        await page.evaluate(() => { delete document.documentElement.dataset.visualMotion; });
        await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .3);
        await page.waitForFunction(() => document.querySelector('article[data-ui="player-owned-container"]').style.getPropertyValue('--tilt-y') !== '');
        await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('article[data-ui="player-owned-container"]').style.getPropertyValue('--tilt-y') === '');
        assert.equal(await page.getByRole('button', { name: 'Resume motion', exact: true }).getAttribute('aria-pressed'), 'true');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.getByRole('button', { name: 'Reduced motion', exact: true }).isDisabled(), true);
      }, "public", "default", "no-preference");
    });
    await t.test("private applications are read only after staff authorization", async () => {
      for (const state of ["guest", "member"]) await withPage(state, 375, async page => {
        assert.equal(await page.evaluate(() => window.fixturePrivateReads), 0);
        assert.equal(await page.locator('form[action="/api/admin/recruitment"]').count(), 0);
      }, "admin");
      for (const width of [375, 1440]) await withPage("staff", width, async page => {
        assert.equal(await page.evaluate(() => window.fixturePrivateReads), 1);
        assert.equal(await page.getByRole("button", { name: "Close recruitment", exact: true }).count(), 1);
        assert.equal(await page.locator('details[data-ui="recruitment-application"]').count(), 25);
        assert.equal(await page.locator('details[data-ui="recruitment-application"] form button:visible').count(), 0);
        const first = page.locator('details[data-ui="recruitment-application"]').first();
        await first.locator(":scope > summary").click();
        await first.locator('[data-status]').waitFor({ state: "visible" });
        assert.equal(await first.locator('form[action="/api/admin/recruitment"] button[type="submit"]').count(), 1);
        assert.equal(await first.locator('section[aria-label="Application baseline requirements"] li[data-state="unmet"]').filter({ hasText: "30+ server hours" }).isVisible(), true);
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
