import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("single and bulk opening reels load missing and broken weapon artwork once per catalogue identity", async () => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {InventorySingleCrateOpening,InventoryBulkCrateOpeningResults} from './components/economy/inventory-crate-opening';
      import {toEconomyItem} from './components/economy/economy-view-model';
      const crate=toEconomyItem({id:'owned-case',catalogueId:10,itemType:'crate',displayName:'CS:GO Weapon Crate'});
      const reward=toEconomyItem({id:'reward',catalogueId:1,itemType:'skin',displayName:'AK-47 | Case Hardened',imageUrl:null,rarityRank:4});
      const knife=toEconomyItem({id:'knife',catalogueId:2,itemType:'knife',displayName:'Bayonet | Doppler',imageUrl:'https://community.steamstatic.com/economy/image/broken',rarityRank:6});
      const drops=[{item:reward,lootEntryId:1,weight:1},{item:knife,lootEntryId:2,weight:1}];
      const root=createRoot(document.getElementById('root'));
      window.show=(bulk,phase)=>{const opening={phase,crate,drops,run:1,reward,rewardLootEntryId:1};
        const controller={single:{crate,opening,dropState:{status:'ready',drops,totalWeight:2}},prepareSingle(){},setSingleDropState(){},completeSingleReveal(){},playTick(){},completeBulkReveal(){},dismissBulk(){},
          bulk:{crates:[crate],completedCount:1,status:'running',rows:[{crate,status:'revealing',opening,reward}],groups:[],error:null}};
        root.render(bulk?<InventoryBulkCrateOpeningResults controller={controller}/>:<InventorySingleCrateOpening crate={crate} controller={controller}/>);
      }; window.show(false,'verifying');` },
    bundle: true, write: false, outfile: "app.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "router", setup(build) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "test" }));
      build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const useRouter=()=>({refresh(){}}); export const usePathname=()=>'/inventory'; export const useSearchParams=()=>new URLSearchParams();" }));
    } }],
  });
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/app.js" ? "text/javascript" : "text/html");
    res.end(req.url === "/app.js" ? bundle.outputFiles.find(file => file.path.endsWith(".js")).text : '<div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const requests = [];
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/economy/market/preview?**", route => {
      const url = new URL(route.request().url()); requests.push(url);
      return route.fulfill({ json: { imageUrl: `https://community.steamstatic.com/economy/image/art-${url.searchParams.get("catalogueId")}` } });
    });
    await page.route("https://community.steamstatic.com/**", route => route.request().url().endsWith("/broken")
      ? route.fulfill({ status: 404 })
      : route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="gold"/></svg>' }));
    await page.route("**/api/images/**", route => route.fulfill({ status: 404 }));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for (const [bulk, phase] of [[false, "verifying"], [false, "revealing"], [true, "revealing"]]) {
      await page.evaluate(([bulk, phase]) => window.show(bulk, phase), [bulk, phase]);
      await page.waitForFunction(() => {
        const cards = [...document.querySelectorAll('.crate-opening-reel-item')];
        return cards.length > 0 && cards.every(card => { const img = card.querySelector('img'); return img?.complete && img.naturalWidth > 0; });
      }, null, { timeout: 5000 });
      if (phase === "revealing") assert.match(await page.locator(".crate-opening-reel-item.winner img").getAttribute("src"), /art-1$/);
    }
    assert.equal(requests.filter(url => url.searchParams.get("catalogueId") === "1").length, 1);
    assert.equal(requests.filter(url => url.searchParams.get("catalogueId") === "2").length, 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
