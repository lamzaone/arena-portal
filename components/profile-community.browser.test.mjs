import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("profile community actions, privacy and responsive theme presentation", async t => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
      import{ProfileCommunityPanel,ProfileCommentSettings}from'./components/profile-community';
      import{resolvePortalThemeSurface}from'./lib/themes/registry';
      const initial={available:true,reputation:12,commendationTotal:24,commendations:{helpful:8,teacher:3,funny:5,pro_player:6,goat:2},commentsEnabled:true,myReputation:0,myCommendations:[],comments:{records:[{id:'e91a2f90-e577-44b1-bc67-000000000001',authorSteamId:'76561198000000003',body:'Great calls on the last round. GG!',createdAt:1792321200000,canDelete:true}],page:1,pageSize:10,total:11}};
      const identities={'76561198000000003':{steamId:'76561198000000003',displayName:'Community teammate',avatarUrl:null,presence:'unknown',profileThemeKey:'shadow',identityGroups:[]}};
      if(location.search.includes('closed'))initial.commentsEnabled=false;if(location.search.includes('unavailable'))initial.available=false;
      window.fixtureInitial=initial;window.fixtureRefreshes=0;const own=location.search.includes('own');
      const theme=new URLSearchParams(location.search).get('theme')??'default';
      function Fixture(){const[steamId,setSteamId]=useState('76561198000000002');const[ssrCommunity,setSSRCommunity]=useState(initial);const[ssrIdentities,setSSRIdentities]=useState(identities);window.fixtureSwitchTarget=()=>setSteamId(current=>current==='76561198000000002'?'76561198000000004':'76561198000000002');window.fixtureSSRRefresh=(community,authors)=>{setSSRCommunity({...community});setSSRIdentities({...authors})};
      return <main className={'tapped-page player-profile-page '+resolvePortalThemeSurface(theme,'profile').surface.className} data-theme={theme} data-theme-owner='profile' data-theme-surface='profile'><div className='fixture-shell'>
      <ProfileCommunityPanel key={steamId} steamId={steamId} viewerSteamId={location.search.includes('guest')?null:own?steamId:'76561198000000001'} csrf='verified' initialCommunity={ssrCommunity} {...(location.search.includes('no-identities')?{}:{initialIdentities:ssrIdentities})}/>
      {own?<ProfileCommentSettings key={steamId} steamId={steamId} csrf='verified' initialCommunity={ssrCommunity}/>:null}</div></main>};createRoot(document.getElementById('root')).render(<Fixture/>);` },
    bundle: true, write: false, outfile: "community-fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "next-boundaries", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "navigation" ? "export const useRouter=()=>({refresh(){window.fixtureRefreshes++}})" : "import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}", loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  const javascript = result.outputFiles.find(file => file.path.endsWith(".js")).text;
  const css = result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";
  const stylesheetPaths = ["app/globals.css", "app/themes/default.css", "app/themes/shared.css", "app/themes/beta-tester.css", "app/themes/tap-god.css", "app/themes/ranks.css", "app/themes/shadow.css", "app/themes/player-containers.css", "app/themes/refinements.css", "app/panel-system.css", "app/public-panels.css", "app/themes/accessibility.css", "app/motion.css", "app/themes/rank-details.css", "app/ambient-polish.css", "app/themes/collection.css"];
  const globals = (await Promise.all(stylesheetPaths.map(path => readFile(resolve(path), "utf8")))).join("\n").replace(/^@import.*$/gm, "");
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(globals + css + ".fixture-shell{max-width:1200px;margin:auto;padding:28px 20px}.tapped-page{min-height:100vh}body{margin:0}"); }
    else { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/fixture.css'></head><body><div id='root' class='portal-content'></div><script src='/fixture.js'></script></body></html>"); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const screenshots = resolve(".cache/profile-community-previews");
  await mkdir(screenshots, { recursive: true });
  try {
    browser = await chromium.launch({ headless: true });
    async function pageFor(query = "", width = 1440) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      page.setDefaultTimeout(6000);
      await page.goto(origin + "/" + query); await page.getByRole("heading", { name: "A reputation built together." }).waitFor();
      return { page, errors };
    }
    await t.test("commendations submit multiple choices, lock in flight, and update confirmed totals", async () => {
      const { page, errors } = await pageFor(); let calls = 0, posted;
      await page.route("**/api/players/*/community", async route => {
        calls++; posted = route.request().postDataJSON();
        const initial = await page.evaluate(() => window.fixtureInitial);
        await new Promise(done => setTimeout(done, 650));
        await route.fulfill({ json: { ok: true, message: "Your commendations were saved.", community: { ...initial, commendationTotal: 26, commendations: { ...initial.commendations, helpful: 9, goat: 3 }, myCommendations: posted.kinds } } });
      });
      await page.getByRole("button", { name: /^Helpful/ }).click(); await page.getByRole("button", { name: /^GOAT/ }).click();
      await page.getByRole("button", { name: "Save commendations" }).evaluate(button => { button.click(); button.click(); });
      await page.waitForTimeout(550);
      assert.equal(calls, 1); assert.equal(await page.getByRole("button", { name: "Saving…" }).isDisabled(), true);
      await page.getByRole("status").filter({ hasText: "Your commendations were saved." }).waitFor();
      assert.deepEqual(posted.kinds, ["helpful", "goat"]); assert.equal(await page.getByRole("button", { name: /^Helpful/ }).getAttribute("aria-pressed"), "true");
      assert.equal(await page.evaluate(() => window.fixtureRefreshes), 1); assert.deepEqual(errors, []); await page.close();
    });
    await t.test("failed comment retries keep one request ID, show plain text, and delete only after confirmation", async () => {
      const { page, errors } = await pageFor(); const requests = []; let deleting = 0;
      await page.route("**/api/players/*/community", async route => {
        const posted = route.request().postDataJSON(); const initial = await page.evaluate(() => window.fixtureInitial);
        if (posted.action === "comment") {
          requests.push(posted);
          if (requests.length === 1) return route.fulfill({ status: 503, json: { ok: false, message: "Please retry this comment." } });
          return route.fulfill({ json: { ok: true, message: "Your comment was posted.", community: { ...initial, comments: { ...initial.comments, total: 1, records: [{ id: "e91a2f90-e577-44b1-bc67-000000000009", authorSteamId: "76561198000000001", body: posted.body, createdAt: 1792321200000, canDelete: true }] } } } });
        }
        deleting++; return route.fulfill({ json: { ok: true, message: "Comment deleted.", community: { ...initial, comments: { ...initial.comments, records: [], total: 0 } } } });
      });
      await page.getByLabel("Leave a message").fill("<script>window.bad=true</script> GG");
      await page.getByRole("button", { name: "Post comment" }).click(); await page.getByRole("alert").waitFor();
      await page.getByRole("button", { name: "Post comment" }).click(); await page.getByRole("status").filter({ hasText: "Your comment was posted." }).waitFor();
      assert.equal(requests.length, 2); assert.equal(requests[0].requestId, requests[1].requestId);
      assert.equal(await page.evaluate(() => window.bad), undefined);
      await page.getByText("<script>window.bad=true</script> GG", { exact: true }).waitFor();
      await page.getByRole("button", { name: /Delete comment by/ }).click(); assert.equal(deleting, 0);
      await page.getByRole("button", { name: "Delete", exact: true }).click(); await page.getByText("No comments yet.", { exact: true }).waitFor();
      assert.equal(deleting, 1); assert.deepEqual(errors, []); await page.close();
    });
    await t.test("comment pages refresh locally and owner comments toggle uses confirmed server state", async () => {
      const { page, errors } = await pageFor("?own");
      await page.route("**/api/players/*/community*", async route => {
        const initial = await page.evaluate(() => window.fixtureInitial);
        if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, community: { ...initial, comments: { ...initial.comments, page: 2, records: [{ ...initial.comments.records[0], body: "Second page comment." }] } } } });
        return route.fulfill({ json: { ok: true, message: "Profile comments disabled.", community: { ...initial, commentsEnabled: false } } });
      });
      assert.equal(await page.locator("textarea").count(), 0);
      await page.getByRole("button", { name: "Next" }).click(); await page.getByText("Second page comment.", { exact: true }).waitFor();
      await page.getByRole("switch", { name: /Allow profile comments/ }).click(); await page.getByText("Your profile wall is open.", { exact: true }).waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("switch", { name: /Allow profile comments/ }).isChecked(), false);
      assert.deepEqual(errors, []); await page.close();
    });
    await t.test("reputation updates from confirmation and selecting a saved vote removes it", async () => {
      const { page, errors } = await pageFor(); const votes = [];
      await page.route("**/api/players/*/community", async route => {
        const posted = route.request().postDataJSON(); votes.push(posted.value); const initial = await page.evaluate(() => window.fixtureInitial);
        await route.fulfill({ json: { ok: true, message: "Your reputation vote was saved.", community: { ...initial, reputation: 12 + posted.value, myReputation: posted.value } } });
      });
      await page.getByRole("button", { name: "Give +1 reputation" }).click();
      await page.waitForFunction(() => document.querySelector('button[aria-label="Give +1 reputation"]').getAttribute('aria-pressed') === 'true');
      await page.getByRole("button", { name: "Give +1 reputation" }).click();
      await page.waitForFunction(() => document.querySelector('button[aria-label="Give +1 reputation"]').getAttribute('aria-pressed') === 'false');
      assert.deepEqual(votes, [1, 0]); assert.equal(await page.evaluate(() => window.fixtureRefreshes), 2); assert.deepEqual(errors, []); await page.close();
    });
    await t.test("guests, closed comments and unavailable storage never offer invalid interactions", async () => {
      for (const query of ["?guest", "?closed", "?unavailable"]) {
        const { page, errors } = await pageFor(query);
        assert.equal(await page.locator("textarea").count(), 0);
        if (query === "?guest") { assert.equal(await page.getByRole("button", { name: "Give +1 reputation" }).isDisabled(), true); await page.getByText("Sign in with Steam", { exact: true }).waitFor(); }
        if (query === "?closed") await page.getByText("This player has turned off new profile comments.", { exact: true }).waitFor();
        if (query === "?unavailable") { await page.getByText("Community features are temporarily unavailable.", { exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: "Give +1 reputation" }).count(), 0); }
        assert.deepEqual(errors, []); await page.close();
      }
    });
    await t.test("switching profiles clears a draft and ignores the previous profile's pending response", async () => {
      const { page, errors } = await pageFor(); let releaseRequest;
      const pending = new Promise(done => { releaseRequest = done; });
      await page.route("**/api/players/*/community", async route => {
        await pending; const initial = await page.evaluate(() => window.fixtureInitial);
        await route.fulfill({ json: { ok: true, message: "Old profile action completed.", community: { ...initial, reputation: 99, comments: { ...initial.comments, records: [{ ...initial.comments.records[0], body: "STALE PROFILE RESPONSE" }] } } } });
      });
      await page.getByLabel("Leave a message", { exact: true }).fill("First profile draft");
      await page.evaluate(() => window.fixtureSwitchTarget());
      await page.waitForFunction(() => document.querySelector("textarea").value === "");
      assert.equal(await page.locator("textarea").inputValue(), "");
      await page.getByLabel("Leave a message", { exact: true }).fill("Second profile comment");
      const issued = page.waitForRequest("**/api/players/*/community");
      await page.getByRole("button", { name: "Post comment" }).click();
      await issued; await page.evaluate(() => window.fixtureSwitchTarget());
      await page.waitForFunction(() => document.querySelector("textarea").value === "");
      const completed = page.waitForResponse("**/api/players/*/community");
      releaseRequest(); await completed; await page.waitForTimeout(100);
      assert.equal(await page.getByText("Old profile action completed.", { exact: true }).count(), 0);
      assert.equal(await page.getByText("STALE PROFILE RESPONSE", { exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.fixtureRefreshes), 0);
      assert.deepEqual(errors, []); await page.close();
    });
    await t.test("comments own their full theme boundary and an omitted optional identity map stays stable", async () => {
      const { page, errors } = await pageFor("?theme=vip_gold");
      const comment = page.locator('li[data-ui="player-owned-container"][data-player-container-kind="message"]');
      assert.equal(await comment.getAttribute("data-theme"), "shadow");
      assert.equal(await comment.getAttribute("data-player-owner"), "76561198000000003");
      assert.equal(await comment.evaluate(element => getComputedStyle(element).getPropertyValue("--theme-accent").trim()), "#9298a3");
      assert.deepEqual(errors, []); await page.close();
      const missing = await pageFor("?no-identities");
      await missing.page.getByRole("button", { name: /^Helpful/ }).click();
      assert.equal(await missing.page.getByRole("button", { name: /^Helpful/ }).getAttribute("aria-pressed"), "true");
      assert.deepEqual(missing.errors, []); await missing.page.close();
    });
    await t.test("SSR aggregate refreshes preserve the fetched comment page, author themes and confirmed deletions", async () => {
      const { page, errors } = await pageFor();
      const initial = await page.evaluate(() => window.fixtureInitial);
      const author = { steamId: "76561198000000005", displayName: "Page two teammate", avatarUrl: null, presence: "unknown", profileThemeKey: "vip_diamond", identityGroups: [] };
      const first = { ...initial.comments.records[0], id: "e91a2f90-e577-44b1-bc67-000000000002", authorSteamId: author.steamId, body: "First page two comment." };
      const second = { ...first, id: "e91a2f90-e577-44b1-bc67-000000000003", body: "Last page two comment." };
      let snapshot = { ...initial, comments: { ...initial.comments, page: 2, total: 12, records: [first, second] } };
      const staleSSR = { ...initial, reputation: 13, myReputation: 1, comments: { ...initial.comments, total: 12, records: [first, second] } };
      await page.route("**/api/players/*/community*", async route => {
        if (route.request().method() === "POST") {
          const action = route.request().postDataJSON();
          if (action.action === "reputation") snapshot = { ...snapshot, reputation: 13, myReputation: 1 };
          if (action.action === "delete_comment") snapshot = action.commentId === first.id
            ? { ...snapshot, comments: { ...snapshot.comments, total: 11, records: [second] } }
            : { ...snapshot, comments: { ...snapshot.comments, page: 1, total: 10, records: initial.comments.records } };
        }
        await route.fulfill({ json: { ok: true, message: "Confirmed.", community: snapshot, identities: { [author.steamId]: author } } });
      });
      async function refreshSSR() {
        await page.evaluate(({ community }) => window.fixtureSSRRefresh(community, {}), { community: staleSSR });
        await page.waitForTimeout(50);
      }
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByText("First page two comment.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Give +1 reputation" }).click();
      await page.waitForFunction(() => document.querySelector('button[aria-label="Give +1 reputation"]').getAttribute('aria-pressed') === 'true');
      await refreshSSR();
      assert.equal(await page.getByText("Page 2 of 2", { exact: true }).count(), 1);
      assert.equal(await page.getByText("Page two teammate", { exact: true }).count(), 2);
      assert.equal(await page.locator('li[data-theme="vip_diamond"]').count(), 2);
      const firstRow = page.locator("li").filter({ hasText: "First page two comment." });
      await firstRow.getByRole("button", { name: /Delete comment by/ }).click();
      await firstRow.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByText("First page two comment.", { exact: true }).waitFor({ state: "hidden" });
      await refreshSSR();
      assert.equal(await page.getByText("Page 2 of 2", { exact: true }).count(), 1);
      assert.equal(await page.getByText("First page two comment.", { exact: true }).count(), 0);
      const lastRow = page.locator("li").filter({ hasText: "Last page two comment." });
      await lastRow.getByRole("button", { name: /Delete comment by/ }).click();
      await lastRow.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByText("Last page two comment.", { exact: true }).waitFor({ state: "hidden" });
      await refreshSSR();
      assert.equal(await page.getByText("Page 2 of 2", { exact: true }).count(), 0);
      assert.equal(await page.getByText("First page two comment.", { exact: true }).count(), 0);
      assert.equal(await page.getByText("Last page two comment.", { exact: true }).count(), 0);
      assert.deepEqual(errors, []); await page.close();
    });
    for (const theme of ["default", "beta_tester", "tap_god", "shadow", "vip_silver", "vip_gold", "vip_diamond", "vip_ultimate", "staff", "moderator", "administrator", "senior_administrator", "owner"]) {
      const query = `?theme=${theme}`;
      for (const width of [1440, 390]) await t.test(`${theme} at ${width}px keeps every element inside the page`, async () => {
        const { page, errors } = await pageFor(query, width);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: resolve(screenshots, `${theme}-${width}.png`), fullPage: true });
        assert.deepEqual(errors, []); await page.close();
      });
    }
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
