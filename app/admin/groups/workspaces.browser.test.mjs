import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const serverGuid = "11111111-1111-1111-1111-111111111111";
const steamId = index => `7656119800000${String(index).padStart(4, "0")}`;
const tag = (id, name) => ({ id, key: `${name.toLowerCase()}.tag`, text: `[${name}]`, colorToken: "#B4A0FF", nameColorToken: "", messageColorToken: "", tagStyle: "glow pulse", nameStyle: "", messageStyle: "", badgeKey: "", enabled: true });
const group = (id, displayName, sourceType) => ({ id, key: displayName.toLowerCase(), displayName, sourceType, externalKey: sourceType === "custom" ? null : displayName, description: `${displayName} group description.`, badgeLabel: displayName.toUpperCase(), badgeIconKey: sourceType === "vipcore" ? "crown" : "shield", badgeColor: "#aeb9ff", badgeSoftColor: "#161d32", profilePriority: id, enabled: true, externalDefinition: null, memberCount: 1, tags: [tag(id, displayName)], privileges: [], rewards: [], memberships: [{ steamId: steamId(id), startsAt: "2026-01-01T00:00:00.000Z", expiresAt: "2030-01-01T00:00:00.000Z", grantReason: "Staff grant", membershipUuid: `11111111-1111-1111-1111-${String(id).padStart(12, "0")}`, arenaGroupId: id, scopeId: 1, scopeType: "global", scopeKey: "global", scopeName: "All ARENA servers", rowVersion: 1 }] });
const groups = [group(1, "Overseer", "admins_core"), group(2, "Guardian", "admins_core"), group(3, "GOLD", "vipcore"), group(4, "DIAMOND", "vipcore"), group(5, "Beta", "custom"), group(6, "Community", "custom"), group(7, "Founder", "admins_core"), { ...group(8, "Retired", "custom"), enabled: false, memberCount: 0, memberships: [] }];
const identities = Object.fromEntries(groups.map(entry => [steamId(entry.id), { steamId: steamId(entry.id), displayName: `${entry.displayName} member`, avatarUrl: null, presence: "online", profileThemeKey: ["default", "shadow", "tap_god"][entry.id % 3], identityGroups: [entry] }]));
const adminPlayers = groups.filter(entry => entry.sourceType === "admins_core").map(entry => ({ steamId: steamId(entry.id), name: `${entry.displayName} member`, activeGroupCount: 1, records: [{ recordKey: `portal:${entry.id}`, source: "portal", steamId: steamId(entry.id), name: `${entry.displayName} member`, group: entry.displayName, groupId: entry.id, adminId: null, storedGroup: null, membershipUuid: entry.memberships[0].membershipUuid, scopeId: 1, scopeType: "global", scopeKey: "global", scopeName: "All ARENA servers", rowVersion: 1, serverGuids: [serverGuid], startsAt: entry.memberships[0].startsAt, expiresAt: entry.memberships[0].expiresAt, updatedAt: entry.memberships[0].startsAt, status: "active", permanent: false, immunity: 20, enabled: true }] }));
const vipPlayers = groups.filter(entry => entry.sourceType === "vipcore").map(entry => ({ steamId: steamId(entry.id), name: `${entry.displayName} member`, activeTierCount: 1, needsConsolidation: false, records: [{ recordKey: `portal:${entry.id}`, source: "portal", steamId: steamId(entry.id), name: `${entry.displayName} member`, group: entry.displayName, groupId: entry.id, arenaGroupId: entry.id, membershipUuid: entry.memberships[0].membershipUuid, scopeId: 1, accountId: null, serverId: 0, startsAt: entry.memberships[0].startsAt, expiresAt: entry.memberships[0].expiresAt, updatedAt: entry.memberships[0].startsAt, status: "active", permanent: false, inConfiguredScope: true, suppressedByPortal: false, consolidationEligible: false, consolidationBlockedReason: null }] }));
const snapshot = { richChatTagsAvailable: true, groups, tags: [tag(5, "Beta"), tag(6, "Community")], privileges: [{ id: 1, key: "admins.commands.gag", scope: "game", displayName: "Gag players", description: "Restrict text chat", sensitive: false, enabled: true, sources: [] }], directTagGrants: [], directPrivilegeGrants: [], catalogueStatus: { adminsCoreDefinitions: 2, vipCoreDefinitions: 2, discoveredPrivileges: 1, lastSyncedAt: "2026-10-18T00:00:00.000Z" } };
const runtime = groups.filter(entry => entry.sourceType !== "custom").map(entry => entry.sourceType === "admins_core" ? { sourceType: "admins_core", rowId: entry.id, name: entry.displayName, permissions: ["admins.notify"], serverGuids: [serverGuid], immunity: 20 } : { sourceType: "vipcore", serverId: 0, name: entry.displayName, weight: entry.id, values: { "vip.health": { Health: 110 } }, enabled: true });
const fixture = { snapshot, identities, adminPlayers, vipPlayers, runtime };

test("group workspaces and profile staff controls preserve source, scope, permission and theme boundaries", async t => {
  const boundaries = {
    "node:crypto": "let id=0;export const randomUUID=()=>`11111111-1111-1111-1111-${String(++id).padStart(12,'0')}`;",
    "@/lib/auth/session": `export const getSession=async()=>window.fixtureRole==='guest'?null:{steamId:'${steamId(9)}'};export const createAdminActionToken=()=> 'fixture-csrf';`,
    "@/lib/admin/access": `export const getAdminAccess=async()=>window.fixtureAccess;`,
    "@/lib/admin/server-scope": `export const configuredGameServerGuid=()=> '${serverGuid}';`,
    "@/lib/data/identity-groups": "export const identityGroupStorageConfigured=()=>true;export const getIdentityAdminSnapshot=async()=>{window.fixtureReads++;return structuredClone(window.fixture.snapshot)};export const getIdentityVipGroupDefinitions=async()=>[{name:'GOLD'},{name:'DIAMOND'}];",
    "@/lib/data/external-group-management": "export const getRuntimeExternalGroups=async()=>window.fixture.runtime;",
    "@/lib/data/portal-repository": "export const gameStorageConfigured=()=>true;export const getExternalIdentityGroupMembershipIndex=async()=>new Map();export const getStaffVips=async()=>[];",
    "@/lib/data/staff-admin-memberships": "export const getStaffAdminMembershipSnapshot=async()=>({players:window.fixture.adminPlayers,records:window.fixture.adminPlayers.flatMap(player=>player.records)});",
    "@/lib/data/staff-vip-memberships": `export const getStaffVipMembershipSnapshot=async()=>({players:window.fixture.vipPlayers,records:window.fixture.vipPlayers.flatMap(player=>player.records),conversionStorageAvailable:true});export const getStaffVipServerScopes=async()=>[{id:0,label:'All ARENA servers',hasDefinitions:true,scopeId:1,scopeKey:'global',scopeType:'global',adminServerGuid:null},{id:1,label:'Arena server',hasDefinitions:true,scopeId:2,scopeKey:'arena',scopeType:'server',adminServerGuid:'${serverGuid}'}];`,
    "@/lib/data/staff-membership-inventory": "export const getStaffMembershipInventorySummaries=async()=>({});",
    "@/lib/player-identities": "export const resolvePlayerIdentities=async()=>window.fixture.identities;",
    "./perks/custom-perk-workspace": "import React from'react';export const CustomPerkWorkspace=()=> <section id='vip-perks' aria-label='Custom perk fixture'/>;",
    "@/components/economy/catalogue-search-field": "import React from'react';export const CatalogueSearchField=({label,name,required})=><label>{label}<input name={name} required={required}/></label>;",
    "@/components/ui/portal-shell": "import React from'react';export const PortalShell=({children,className='',navigation})=><main className={'tapped-page portal-page '+className}><div className='shell'>{navigation?<div className='portal-workspace-layout'>{navigation}<div className='portal-workspace-content'>{children}</div></div>:children}</div></main>;",
    "next/link": "import React from'react';export default function Link({children,scroll,prefetch,...props}){return <a {...props}>{children}</a>}",
    "next/image": "import React from'react';export default function Image({priority,...props}){return <img {...props}/>}",
    "next/navigation": "export const useRouter=()=>({replace(){},push(){},refresh(){}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);",
  };
  const bundle = await build({
    stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import GroupsPage from'./app/admin/groups/page';import{ProfileStaffControls}from'./components/profile-staff-controls';const params=new URLSearchParams(location.search);window.fixture=${JSON.stringify(fixture)};window.fixtureReads=0;window.fixtureRole=params.get('role')||'founder';window.fixtureAccess={steamId:'${steamId(9)}',displayName:'Reviewing staff',groups:['Founder'],isAdmin:!['guest','player'].includes(window.fixtureRole),isFounder:window.fixtureRole==='founder',immunity:100,canManageGroups:window.fixtureRole==='founder',canManageAdmins:window.fixtureRole==='founder',canManageVips:window.fixtureRole==='founder',canUnban:window.fixtureRole==='founder',permissions:new Set(window.fixtureRole==='founder'?['*']:window.fixtureRole==='limited'?['admins.commands.gag']:[])};const root=createRoot(document.getElementById('root'));(async()=>{if(params.get('mode')==='profile')root.render(<main className='tapped-page portal-page player-profile-page'><div className='shell'><ProfileStaffControls steamId='${steamId(1)}' displayName='Profile player' access={window.fixtureAccess} csrf='fixture-csrf' online={params.get('online')!=='no'} writesReady={params.get('writes')!=='no'}/></div></main>);else root.render(await GroupsPage({searchParams:Promise.resolve(Object.fromEntries(params))}))})();`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "group-workspace-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const layout = await readFile("app/layout.tsx", "utf8");
  const sheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => match[1]);
  // The portal's shell and module queries share the public staff-content
  // container. esbuild localizes its name; restore that shared contract in
  // this isolated fixture, whose CSS does not pass through Next's processor.
  const bundleCss = bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n").replace(/\b[a-z][a-z0-9_]*_staff-content\b/g, "staff-content");
  const css = (await Promise.all(sheets.map(path => readFile(resolve("app", path), "utf8")))).join("\n") + bundleCss;
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (request.url.startsWith("/api/players")) { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ players: [], results: [] })); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html class="global-theme-default" data-theme="default" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    await mkdir(".cache/group-workspace-previews", { recursive: true });
    async function withPage(query, width, theme, check) {
      const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(6000);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/?${new URLSearchParams(query)}`);
        await page.locator("main").waitFor();
        if (theme !== "default") await page.evaluate(theme => { document.documentElement.className = `global-theme-${theme.replaceAll("_", "-")}`; document.documentElement.dataset.theme = theme; }, theme);
        await check(page);
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${JSON.stringify(query)}/${width}/${theme} overflows: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).map(element => ({tag:element.tagName,class:element.className,right:element.getBoundingClientRect().right})).slice(0,8)))}`);
      } finally { await page.close(); }
    }
    await t.test("guest and player pages do not read private group snapshots", async () => {
      for (const role of ["guest", "player"]) await withPage({ role }, 390, "default", async page => {
        assert.equal(await page.evaluate(() => window.fixtureReads), 0);
        assert.equal(await page.locator('[data-ui="assignments-workspace"]').count(), 0);
      });
    });
    await t.test("each type isolates its definitions and the selected group's roster", async () => {
      for (const [tab, firstId, secondId] of [["admin", 1, 2], ["vip", 3, 4], ["custom", 5, 6]]) {
        for (const [width, theme] of [[390, "default"], [1024, "shadow"], [1440, "tap_god"]]) await withPage({ tab, group: String(firstId) }, width, theme, async page => {
          const selector = page.getByRole("complementary", { name: "Group selector", exact: true });
          const choices = selector.locator('[data-group-id]');
          assert.equal(await choices.count(), tab === "admin" ? 3 : 2);
          const firstChoice = await choices.nth(0).boundingBox();
          const secondChoice = await choices.nth(1).boundingBox();
          assert.equal(Math.round(firstChoice.y), Math.round(secondChoice.y), "group choices should share one horizontal row");
          const selectorBounds = await selector.boundingBox();
          const panelBounds = await page.locator('.staff-group-card:visible').boundingBox();
          assert.ok(panelBounds.y >= selectorBounds.y + selectorBounds.height - 1, "group editor belongs below the selector");
          assert.ok(panelBounds.width >= selectorBounds.width * 0.98, "group editor should use the full available width");
          assert.equal(await page.locator('.staff-group-card:visible').count(), 1);
          assert.equal(await page.locator('[data-ui="assignments-workspace"]:visible').count(), 1);
          const workspace = page.locator(`#assignments-${firstId}`);
          assert.equal(await workspace.getByRole("group", { name: "Assignment type", exact: true }).count(), 0);
          assert.equal(await workspace.getByText(`${groups[firstId - 1].displayName} member`, { exact: true }).count() >= 1, true);
          assert.equal(await workspace.getByText(`${groups[secondId - 1].displayName} member`, { exact: true }).count(), 0);
          const quickAdd = workspace.locator('[data-ui="assignment-quick-add"]');
          await quickAdd.locator("summary").click();
          assert.equal(await quickAdd.locator("form").count(), 1);
          const select = quickAdd.locator(tab === "vip" ? 'select[name="group"]' : 'select[name="groupId"]');
          assert.equal(await select.inputValue(), tab === "vip" ? groups[firstId - 1].displayName : String(firstId));
          if (tab === "vip") {
            await workspace.getByText("Edit VIP access", { exact: true }).click();
            assert.deepEqual(await workspace.locator('select[name="newGroup"] option').allTextContents(), ["DIAMOND", "GOLD"]);
          }
          await selector.getByRole("button", { name: new RegExp(groups[secondId - 1].displayName) }).click();
          assert.equal(await page.locator(`#assignments-${secondId}`).isVisible(), true);
          assert.equal(await page.locator(`#assignments-${firstId}`).isVisible(), false);
          assert.equal(new URL(page.url()).searchParams.get("group"), String(secondId));
          const create = page.locator('details#create-group');
          assert.equal(await create.getAttribute("open"), null);
          assert.equal(await create.locator(':scope > summary').innerText(), `Create ${tab === "vip" ? "VIP" : tab === "admin" ? "Admin" : "Custom"} group`);
          assert.ok((await create.boundingBox()).y < (await selector.boundingBox()).y, "Create group belongs above the group selector");
          await create.locator(':scope > summary').click();
          const createForm = create.locator('form').first();
          await createForm.locator(tab === "custom" ? 'input[name="groupKey"]' : 'input[name="name"]').waitFor({ state: "visible" });
          if (tab !== "custom") assert.equal(await createForm.evaluate(form => form.getBoundingClientRect().width >= form.parentElement.getBoundingClientRect().width * 0.9), true, `${tab} creation should fill the available row`);
          assert.equal(await createForm.getByRole('checkbox', { name: 'Create and assign the group tag now', exact: true }).isChecked(), true);
          assert.equal(await createForm.locator('details[open]').count(), 0);
          assert.equal(await createForm.locator('input[name="tagText"]').isVisible(), true);
          await create.locator(':scope > summary').click();
          await createForm.locator(tab === "custom" ? 'input[name="groupKey"]' : 'input[name="name"]').waitFor({ state: "hidden" });
          await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
          await page.screenshot({ path: `.cache/group-workspace-previews/${tab}-${width}.png`, fullPage: true });
        });
      }
    });
    await t.test("custom tag records start collapsed while an opened editor exposes its settings", async () => {
      for (const [width, theme] of [[390, "default"], [1024, "shadow"], [1440, "tap_god"]]) await withPage({ tab: "custom-access" }, width, theme, async page => {
        assert.equal(await page.locator('[data-ui="assignments-workspace"]').count(), 0);
        const create = page.locator('#tag-definitions > details').filter({ has: page.getByText('Create & assign a custom tag', { exact: true }) });
        assert.equal(await create.getAttribute('open'), null);
        await create.locator(':scope > summary').click();
        const createForm = create.locator('form');
        await createForm.locator('input[name="tagKey"]').waitFor({ state: 'visible' });
        assert.equal(await createForm.locator('select[name="tagTarget"]').count(), 1);
        assert.equal(await createForm.locator('details[open]').count(), 0);
        await create.locator(':scope > summary').click();
        await createForm.locator('input[name="tagKey"]').waitFor({ state: 'hidden' });
        const definitions = page.locator('#tag-definitions > .staff-group-list > details');
        assert.equal(await definitions.count(), 2);
        assert.equal(await definitions.locator(':scope[open]').count(), 0);
        await definitions.first().locator(':scope > summary').click();
        const editor = page.getByRole("form", { name: "Edit tag beta.tag", exact: true });
        await editor.locator('input[name="tagText"]').waitFor({ state: "visible" });
        assert.equal(await editor.locator("details[open]").count(), 0);
        const glow = editor.getByRole("region", { name: "Tag styles Glow effect", exact: true });
        assert.equal(await glow.getByRole("switch", { name: "Tag styles Glow enabled", exact: true }).getAttribute("aria-checked"), "true");
        await editor.screenshot({ path: `.cache/group-workspace-previews/tag-editor-${width}.png` });
        await glow.locator("summary").click();
        await glow.getByLabel("Tag styles Glow size", { exact: true }).waitFor({ state: "visible" });
        assert.equal(await glow.getByLabel("Tag styles Glow size", { exact: true }).isVisible(), true);
        await definitions.first().locator(':scope > summary').click();
        await editor.locator('input[name="tagText"]').waitFor({ state: 'hidden' });
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
        await page.screenshot({ path: `.cache/group-workspace-previews/custom-access-${width}.png`, fullPage: true });
      });
    });
    await t.test("group selection keeps search, sorting, and archived custom groups available", async () => {
      await withPage({ tab: "custom", group: "5" }, 1440, "tap_god", async page => {
        const selector = page.getByRole("complementary", { name: "Group selector", exact: true });
        assert.equal(await selector.locator('[data-group-id="8"]').count(), 0);
        await selector.getByRole("checkbox", { name: "Show disabled groups", exact: true }).check();
        assert.equal(await selector.locator('[data-group-id="8"]').count(), 1);
        await selector.getByRole("searchbox", { name: "Find a group", exact: true }).fill("Community");
        await page.locator('#group-6').waitFor({ state: "visible" });
        assert.equal(await selector.locator('[data-group-id]').count(), 1);
        await selector.getByRole("searchbox", { name: "Find a group", exact: true }).fill("");
        await page.waitForFunction(() => document.querySelectorAll('[data-group-id]').length === 3);
        await selector.getByRole("button", { name: /^Group name, sorted ascending/ }).click();
        assert.equal(await selector.locator('[data-group-id]').first().getAttribute("data-group-id"), "8");
        await selector.getByRole("button", { name: /^Member count,/ }).click();
        assert.notEqual(await selector.locator('[data-group-id]').first().getAttribute("data-group-id"), "8");
      });
    });
    await t.test("group navigation exposes the active workspace and the mobile rail reaches all groups", async () => {
      await withPage({ tab: "admin", group: "1" }, 390, "default", async page => {
        const navigation = page.getByRole("navigation", { name: "Group management sections", exact: true });
        const current = navigation.locator('[aria-current="page"]');
        assert.match(await current.innerText(), /^Admin/);
        assert.equal(new URL(await current.getAttribute("href"), page.url()).searchParams.get("group"), "1");
        const selector = page.getByRole("complementary", { name: "Group selector", exact: true });
        const previous = selector.getByRole("button", { name: "Scroll groups left", exact: true });
        const next = selector.getByRole("button", { name: "Scroll groups right", exact: true });
        assert.equal(await previous.isDisabled(), true);
        assert.equal(await next.isEnabled(), true);
        await next.click();
        await page.waitForFunction(() => document.querySelector('#connected-groups-workspace-rail').scrollLeft > 100 && !document.querySelector('button[aria-label="Scroll groups left"]').disabled);
        assert.equal(await previous.isEnabled(), true);
        await previous.click();
        await page.waitForFunction(() => document.querySelector('#connected-groups-workspace-rail').scrollLeft < 2);
        await selector.getByRole("link", { name: "Members & access", exact: true }).click();
        assert.equal(new URL(page.url()).hash, "#assignments-1");
        assert.ok((await page.locator('#assignments-1').boundingBox()).y < 400, "member shortcut reaches the selected group's access controls");
      });
      await withPage({ tab: "custom-access" }, 390, "shadow", async page => {
        const tools = page.getByRole("navigation", { name: "Custom access tools", exact: true });
        assert.equal(await tools.getByRole("link").count(), 4);
        for (const link of await tools.getByRole("link").all()) {
          const target = await link.getAttribute("href");
          assert.equal(await page.locator(target).count(), 1, `${target} has a real tool destination`);
        }
        const awards = page.locator('#direct-awards');
        const tagForm = awards.getByRole("form", { name: "Direct chat tag", exact: true });
        assert.equal(await tagForm.isVisible(), false);
        await awards.getByText("Player chat tag", { exact: true }).click();
        await tagForm.locator('select[name="tagId"]').waitFor({ state: "visible" });
        assert.equal(await tagForm.locator('input[name="csrf"]').inputValue(), "fixture-csrf");
        assert.deepEqual(await tagForm.locator('button[name="action"]').evaluateAll(buttons => buttons.map(button => button.value)), ["player-tag-grant", "player-tag-revoke"]);
        await awards.getByText("Player permission", { exact: true }).click();
        await awards.getByRole("form", { name: "Direct privilege", exact: true }).waitFor({ state: "visible" });
      });
    });
    await t.test("group deletion is visible, confirmed, source-specific and protects Founder", async () => {
      for (const [tab, id, action] of [["admin", 1, "external-admin-group-delete"], ["vip", 3, "external-vip-group-delete"], ["custom", 5, "group-archive"]]) await withPage({ tab, group: String(id) }, 390, "tap_god", async page => {
        const card = page.locator(`#group-${id}`);
        const button = card.getByRole("button", { name: `Delete ${tab === "vip" ? "VIP" : tab === "admin" ? "Admin" : "Custom"} group`, exact: true });
        assert.equal(await button.isVisible(), true);
        const form = button.locator("xpath=ancestor::form");
        assert.equal(await form.locator('input[name="csrf"]').inputValue(), "fixture-csrf");
        assert.equal(await form.locator('input[name="groupId"]').inputValue(), String(id));
        await page.evaluate(() => document.addEventListener("submit", event => { event.preventDefault(); window.fixtureDeletion = Object.fromEntries(new FormData(event.target, event.submitter)); }));
        await button.click();
        const dialog = page.getByRole("dialog", { name: "Confirm action" });
        await dialog.waitFor();
        assert.equal(await page.evaluate(() => window.fixtureDeletion), undefined);
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await button.click();
        await dialog.getByRole("button", { name: /^Delete/ }).click();
        await page.waitForFunction(() => Boolean(window.fixtureDeletion));
        assert.equal((await page.evaluate(() => window.fixtureDeletion)).action, action);
      });
      await withPage({ tab: "admin", group: "7" }, 1440, "default", async page => {
        assert.equal(await page.locator('#group-7').getByRole("button", { name: /Delete/ }).count(), 0);
        assert.match(await page.locator('#group-7').textContent(), /Founder.*protected/i);
      });
    });
    await t.test("profile actions follow permissions, online state and write readiness", async () => {
      for (const [width, theme] of [[390, "default"], [1024, "shadow"], [1440, "tap_god"]]) await withPage({ mode: "profile" }, width, theme, async page => {
        for (const action of ["Ban", "Kick", "Gag", "Mute", "Silence"]) assert.equal(await page.getByRole("button", { name: action, exact: true }).count(), 1);
        assert.equal(await page.getByRole("link", { name: "Admin groups", exact: true }).getAttribute("href"), `/admin/groups?tab=admin&player=${steamId(1)}`);
        assert.equal(await page.locator('input[name="csrf"][value="fixture-csrf"]').count(), 1);
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
        await page.screenshot({ path: `.cache/group-workspace-previews/profile-${width}.png`, fullPage: true });
      });
      await withPage({ mode: "profile", online: "no", writes: "no" }, 390, "default", async page => {
        assert.equal(await page.getByRole("button", { name: "Kick", exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Ban", exact: true }).isDisabled(), true);
      });
      await withPage({ mode: "profile", role: "limited" }, 390, "default", async page => {
        assert.equal(await page.getByRole("button", { name: "Gag", exact: true }).count(), 1);
        assert.equal(await page.getByRole("button", { name: "Ban", exact: true }).count(), 0);
        assert.equal(await page.locator('a[href^="/admin/groups"]').count(), 0);
      });
      await withPage({ mode: "profile", role: "player" }, 390, "default", async page => {
        assert.equal(await page.locator('form[action="/api/admin/moderation"]').count(), 0);
      });
    });
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
