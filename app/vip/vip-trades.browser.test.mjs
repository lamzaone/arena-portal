import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("membership comparison and separated trade queues stay clear across screen sizes and themes", async t => {
  const data = `
    export const tiers=['STANDARD','SILVER','GOLD','DIAMOND','ULTIMATE'].map((name,index)=>({name,weight:(index+1)*20,benefits:[{name:'Extra health',detail:(100+index*10)+' HP'},{name:'Armor',detail:'100 armor'},...(index>1?[{name:'Double jump',detail:'2 jumps'}]:[]),...(index>2?[{name:'Chat tag',detail:'Custom VIP tag'}]:[]),...(index>3?[{name:'Rainbow model',detail:'Animated model color'}]:[])]}));
    export const groups=tiers.map((tier,index)=>({id:index+1,key:tier.name.toLowerCase(),displayName:tier.name,sourceType:'vipcore',externalKey:tier.name,description:'A membership with extras configured for the arena.',badgeLabel:tier.name,badgeIconKey:'crown',badgeColor:['#a0a9b9','#c5d2df','#f3be51','#81caff','#d4a3ff'][index],badgeSoftColor:['#cdd3de','#e2ecf4','#ffe19a','#c1e6ff','#e5caff'][index],profilePriority:10,enabled:true}));
    export const listings=groups.flatMap((group,index)=>[43200,129600].map((minutes,offer)=>({id:(index+1)*10+offer,groupId:group.id,catalogueId:group.id,listingName:group.displayName+' membership',description:null,durationMinutes:minutes,euroPriceCents:(index+1)*300*(offer?2.8:1),tokenPrice:(index+1)*1000*(offer?3:1),vipPageEnabled:true,marketEnabled:true,enabled:true,sortOrder:index,createdAt:'2026-10-18T00:00:00Z',updatedAt:'2026-10-18T00:00:00Z',arenaScopeUuid:'arena',vipScope:{serverId:1,scopeUuid:'arena',label:'ARENA',description:'The arena server',hasDefinitions:true},group})));
    export const membership={...groups[1],hasPortalMembership:true,membershipExpiresAt:'2026-12-01T00:00:00Z',membershipPermanent:false};
  `;
  const boundaries = {
    "fixture-data": data,
    "server-only": "export {};",
    "@/lib/auth/session": "export const getSession=async()=>location.search.includes('guest')?null:{steamId:'76561198000000001'};export const createEconomyActionToken=()=> 'fixture-csrf';",
    "@/lib/data/identity-groups": "import{groups,membership}from'fixture-data';export const getEffectiveIdentity=async()=>({groups:location.search.includes('conflict')?[membership,{...membership,...groups[2]}]:[membership]});export const getIdentityGroupBadgeCatalogue=async()=>groups;",
    "@/lib/data/identity-group-listings": "import{listings}from'fixture-data';export const getVipPageIdentityGroupListings=async()=>location.search.includes('empty')?[]:listings;export const getVipTierConversionRateListings=async()=>listings.filter(item=>item.durationMinutes===43200);export const identityGroupListingStorageConfigured=()=>true;export const isMissingIdentityGroupListingSchemaError=()=>false;",
    "@/lib/data/portal-repository": "export const getPlayerDashboard=async()=>({vipGroups:[],adminGroups:[]});export const getVipRoster=async()=>({vips:[],total:0,page:1,pageSize:25});export const getPlayerIdentityGroupBadges=async()=>new Map();",
    "@/lib/data/vip-tier-catalogue": "import{tiers}from'fixture-data';export const getVipTiers=async()=>tiers;",
    "@/lib/data/vip-perks": "export const vipPerkStorageConfigured=()=>true;export const getEffectiveVipPerkPage=async()=>({entries:[],total:0,page:1,pageSize:25});export const getVipPerkStorefront=async()=>({balance:'10000',owned:[{steamId:'76561198000000001',perk:{key:'vip.armor'},expiresAt:null,sources:['staff']}],offers:['Extra health','Armor','Double jump','Chat tag','Rainbow model','Kill screen'].flatMap((name,index)=>[1440,10080].map((duration,offer)=>({id:index*2+offer+1,perkId:index+1,perkKey:index===1?'vip.armor':'perk'+index,perkName:name,perkDescription:'Choose the extra you enjoy, with a duration that suits your playtime.',perkCategory:index%2?'cosmetic':'gameplay',tokenPrice:1000*(offer+1),durationMinutes:duration,enabled:true,runtimeVerified:true})))});",
    "@/lib/data/vip-perk-storage-errors": "export const isMissingVipPerkStorageSchemaError=()=>false;",
    "@/lib/player-identities": "export const resolvePlayerIdentities=async()=>({});",
    "@/lib/steam/profiles": "export const getSteamProfiles=async()=>new Map();",
    "@/lib/seo/site": "export const buildPageMetadata=()=>({});",
    "@/components/ui/portal-shell": "import React from'react';export const PortalShell=({children,className=''})=><main className={'tapped-page portal-page '+className}><div className='shell'><header className='site-header'><a className='brand' href='/'>TAPPED.RO</a><nav><a href='/vip'>VIP</a><a href='/trades'>Trades</a></nav></header>{children}</div></main>;",
    "@/components/player-identity": "import React from'react';export const PlayerIdentity=({player})=><a className='player-identity' href={'/players/'+player.steamId}><span className='player-identity-name'>{player.displayName}</span></a>;",
    "./marketplace-item-preview": "import React from'react';export const MarketplaceItemPreview=({item})=><div className='economy-item-preview'>{item.displayName}</div>;",
    "next/link": "import React from'react';export default function Link({children,scroll,prefetch,...props}){return <a {...props}>{children}</a>}",
    "next/image": "import React from'react';export default function Image({priority,fill,...props}){return <img {...props} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:undefined}/>}",
    "next/navigation": "export const useRouter=()=>({replace(){},push(){},refresh(){}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);",
  };
  const bundle = await build({
    stdin: { contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import VipPage from'./app/vip/page';import VipPerksPage from'./app/vip/perks/page';import{TradeActivity}from'./components/economy/trade-activity';import{PanelEffects}from'./components/ui/panel-effects';
      const makeTrade=(id,status,direction)=>({id:String(id),status,direction,counterpartySteamId:'76561198000000002',offeredTokens:'12500',requestedTokens:'8000',offeredItems:[],requestedItems:[],createdAt:'2026-10-18T00:00:00Z'});
      function Trades(){const[trades,setTrades]=useState([...Array.from({length:6},(_,i)=>makeTrade(i+1,'pending','incoming')),...Array.from({length:2},(_,i)=>makeTrade(i+7,'pending','outgoing')),...Array.from({length:8},(_,i)=>makeTrade(i+20,['completed','rejected','cancelled','expired'][i%4],i%2?'outgoing':'incoming'))]);const finish=(id,status)=>{window.lastTradeAction={id,status};setTrades(current=>current.map(trade=>trade.id===id?{...trade,status}:trade))};return <main className='tapped-page portal-page'><div className='shell'><h1>Trades</h1><TradeActivity trades={location.search.includes('empty')?[]:trades} counterpartyIdentities={{'76561198000000002':{steamId:'76561198000000002',displayName:'Arena trader with a longer name',avatarUrl:null,presence:'unknown',profileThemeKey:'tap_god',identityGroups:[]}}} pending={false} pendingAction={null} onRespond={(id,decision)=>finish(id,decision==='accept'?'completed':'rejected')} onCancel={id=>finish(id,'cancelled')}/></div></main>}
      (async()=>{const page=location.pathname==='/trades'?<Trades/>:location.pathname==='/vip/perks'?await VipPerksPage({searchParams:Promise.resolve({})}):await VipPage({searchParams:Promise.resolve({})});createRoot(document.getElementById('root')).render(<><PanelEffects/>{page}</>);})();`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "membership-trade-fixture", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const layout = await readFile("app/layout.tsx", "utf8");
  const sheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => match[1]);
  const css = (await Promise.all(sheets.map(path => readFile(resolve("app", path), "utf8")))).join("\n") + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (url.pathname === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (url.pathname.startsWith("/images/")) { try { response.end(await readFile(resolve("public", url.pathname.slice(1)))); } catch { response.writeHead(404); response.end(); } }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html class="global-theme-default" data-theme="default" data-theme-surface="global"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root" class="portal-content"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ headless: true });
  const previews = ".cache/vip-trades-previews";
  await mkdir(previews, { recursive: true });
  try {
    async function withPage(path, width, check, { theme = "default", motion = "reduce" } = {}) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: motion });
      page.setDefaultTimeout(8_000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
        await page.locator("main h1").waitFor();
        await page.evaluate(theme => { document.documentElement.className = `global-theme-${theme.replaceAll("_", "-")}`; document.documentElement.dataset.theme = theme; }, theme);
        await check(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path}/${width} overflows`);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    }

    for (const [width, theme] of [[390, "default"], [768, "beta_tester"], [1440, "tap_god"]]) {
      await t.test(`VIP shows ordered tiers, comparison, and honest acquisition steps at ${width}px in ${theme}`, async () => {
        await withPage("/vip", width, async page => {
          assert.equal(await page.locator("h1").count(), 1);
          const shortcuts = page.locator('a[href^="#vip-membership-"]');
          assert.deepEqual(await shortcuts.evaluateAll(nodes => nodes.map(node => node.querySelector(":scope > strong").textContent)), ["STANDARD", "SILVER", "GOLD", "DIAMOND", "ULTIMATE"]);
          assert.equal(await page.locator('[data-current="true"]').count(), 1);
          assert.equal(await page.getByRole("list", { name: "How to get a membership" }).getByRole("listitem").count(), 3);
          assert.match(await page.getByRole("list", { name: "How to get a membership" }).innerText(), /staff delivers the membership item/);
          assert.equal(await page.getByRole("link", { name: /Manage membership items/ }).getAttribute("href"), "/inventory");
          await page.locator("details > summary").filter({ hasText: "Compare every benefit" }).click();
          const comparison = page.getByRole("region", { name: "Membership benefits comparison" });
          assert.equal(await comparison.isVisible(), true);
          assert.equal(await comparison.getByRole("rowheader", { name: "Double jump", exact: true }).count(), 1);
          const doubleJump = comparison.locator("tbody tr").filter({ hasText: "Double jump" });
          assert.equal(await doubleJump.getByText("2 jumps", { exact: true }).count(), 3);
          assert.equal(await doubleJump.getByText("Not included", { exact: true }).count(), 2);
          await page.screenshot({ path: `${previews}/vip-${theme}-${width}.png`, fullPage: true });
          await shortcuts.last().click();
          assert.match(page.url(), /#vip-membership-5$/);
          assert.equal(await page.locator('#vip-membership-5 [data-part="action"]').first().getAttribute("href"), "/tickets?listing=50");
          assert.match(await page.locator('[data-ui="vip-current-status"]').innerText(), /Active until/);
        }, { theme });
      });

      await t.test(`pending trades are separate and actions move confirmed offers to history at ${width}px in ${theme}`, async () => {
        await withPage("/trades", width, async page => {
          const pending = page.getByRole("region", { name: "Pending trades", exact: true });
          const finished = page.getByRole("region", { name: "Finished trades", exact: true });
          assert.equal(await pending.locator('article[data-trade-status="pending"]').count(), 6);
          assert.equal(await pending.locator('article:not([data-trade-status="pending"])').count(), 0);
          assert.equal(await finished.locator('article[data-trade-status="pending"]').count(), 0);
          assert.equal(await finished.locator("article").count(), 6);
          assert.equal(await finished.getByRole("button", { name: /Accept offer|Decline|Cancel offer/ }).count(), 0);
          await pending.getByRole("button", { name: "Show more incoming (2)" }).click();
          assert.equal(await pending.locator("article").count(), 8);
          await finished.getByRole("button", { name: "Show more finished trades (2)" }).click();
          assert.equal(await finished.locator("article").count(), 8);
          await page.screenshot({ path: `${previews}/trades-${theme}-${width}.png`, fullPage: true });
          const incoming = pending.getByRole("article", { name: "Incoming offer #1", exact: true });
          await incoming.getByRole("button", { name: "Accept offer", exact: true }).click();
          assert.deepEqual(await page.evaluate(() => window.lastTradeAction), { id: "1", status: "completed" });
          assert.equal(await pending.getByRole("article", { name: "Incoming offer #1", exact: true }).count(), 0);
          assert.equal(await finished.getByRole("article", { name: "Incoming offer #1", exact: true }).count(), 1);
          await pending.getByRole("article", { name: "Outgoing offer #7", exact: true }).getByRole("button", { name: "Cancel offer", exact: true }).click();
          assert.deepEqual(await page.evaluate(() => window.lastTradeAction), { id: "7", status: "cancelled" });
          assert.equal(await finished.getByRole("article", { name: "Outgoing offer #7", exact: true }).count(), 1);
        }, { theme });
      });

      await t.test(`individual perks explain activation and preserve purchase feedback at ${width}px in ${theme}`, async () => {
        await withPage("/vip/perks", width, async page => {
          assert.equal(await page.getByRole("link", { name: /Looking for a full membership/ }).getAttribute("href"), "/vip");
          assert.equal(await page.getByText("Just the extras you want", { exact: true }).isVisible(), true);
          assert.equal(await page.getByRole("button", { name: "Owned permanently", exact: true }).count(), 2);
          const perk = page.getByRole("article").filter({ hasText: "Extra health" });
          let requests = 0;
          await page.route("**/api/economy/vip-perks/purchase", route => { requests++; assert.equal(route.request().postDataJSON().offerId, 1); return route.fulfill({ json: { ok: true, balance: "9000", expiresAt: "2026-10-20T00:00:00Z", message: "Extra health activated." } }); });
          await perk.getByRole("button", { name: "Buy perk", exact: true }).first().click();
          await page.getByText("Extra health activated.", { exact: true }).waitFor();
          assert.equal(requests, 1);
          assert.equal(await page.getByText("9,000 Tokens", { exact: true }).isVisible(), true);
          assert.equal(await perk.getByText("Currently active", { exact: true }).isVisible(), true);
          await page.screenshot({ path: `${previews}/perks-${theme}-${width}.png`, fullPage: true });
        }, { theme });
      });
    }

    await t.test("guest and conflicting VIP accounts retain their guarded access states", async () => {
      await withPage("/vip?guest", 390, async page => {
        assert.equal(await page.locator('[data-ui="vip-current-status"]').getByText("Steam login required", { exact: true }).isVisible(), true);
        assert.equal(await page.locator('[data-ui="vip-tier-card"]').getByRole("link", { name: "Login to request", exact: true }).count(), 10);
        assert.equal(await page.locator('[data-current="true"]').count(), 0);
      });
      await withPage("/vip?conflict", 390, async page => {
        assert.equal(await page.locator('[data-ui="vip-current-status"]').getByText("Needs consolidation", { exact: true }).isVisible(), true);
        assert.equal(await page.locator('[data-current="true"]').count(), 0);
        assert.equal(await page.locator('[data-ui="vip-tier-card"] [data-part="action"]:enabled').count(), 0);
      });
    });

    await t.test("empty catalogues and trade histories have clear states without dead tier links", async () => {
      await withPage("/vip?empty", 390, async page => {
        assert.equal(await page.getByRole("heading", { name: "No membership offers yet.", exact: true }).isVisible(), true);
        assert.equal(await page.locator('a[href="#vip-guide-title"]').count(), 0);
      });
      await withPage("/trades?empty", 390, async page => {
        assert.equal(await page.getByText("No trade offers yet", { exact: true }).isVisible(), true);
      });
    });
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
