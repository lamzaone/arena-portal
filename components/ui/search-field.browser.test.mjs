import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("search responses preserve newer typing, clear, filters and history", async (t) => {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {MarketplaceBrowser} from './components/economy/marketplace-browser';
      import {SearchNavigationForm, SearchSubmitButton} from './components/ui/search-field';
      import {ServerSearchField} from './components/ui/server-search-field';
      import {PlayerSearchField} from './components/player-search-field';
      const root=createRoot(document.getElementById('root'));
      window.requests=[];
      window.render=(q='',type='',rarity='')=>root.render(location.pathname==='/market'
        ? <MarketplaceBrowser catalogue={[]} wallet={{}} csrf="test" filters={{query:q,itemType:type,rarity}} pagination={{page:1,pageSize:24,total:0}} />
        : <SearchNavigationForm action={location.pathname} resetFields={['page']}><input type="hidden" name="page" value="4"/>{location.pathname==='/players' ? <PlayerSearchField id="player-search" name="q" label="Search players" mode="query" defaultQuery={q} autoSubmitOnSelect/> : <ServerSearchField id="records-search" name="q" label="Search records" defaultValue={q}/>}<SearchSubmitButton/></SearchNavigationForm>);
      window.commit=(href)=>{history.replaceState({},'',href);const p=new URL(href,location.origin).searchParams;window.render(p.get('q')||'',p.get('type')||'',p.get('rarity')||'');};
      window.render();`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": '{}' },
    plugins: [{ name: "boundaries", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
      builder.onResolve({ filter: /marketplace-item-preview$/ }, () => ({ path: "preview", namespace: "fixture" }));
      builder.onResolve({ filter: /\/item-grid$/ }, () => ({ path: "grid", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "navigation"
        ? "const router={replace(href){window.requests.push(href)},push(href){window.requests.push(href)},refresh(){}};export const useRouter=()=>router;export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);"
        : path === "grid" ? "export const useItemGridLayout=()=>({gridProps:{},pageSize:24,columns:4,measured:true});export const PaginatedItemGrid=()=>null;"
        : "export const MarketplaceItemPreview=()=>null;", loader: "js" }));
    } }],
  });
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
  const server = createServer((req, res) => {
    res.setHeader('content-type', req.url === '/fixture.js' ? 'text/javascript' : req.url === '/fixture.css' ? 'text/css' : 'text/html');
    res.end(req.url === '/fixture.js' ? js : req.url === '/fixture.css' ? css : '<html><head><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch();
  try {
    for (const path of ['/market', '/records', '/players']) await t.test(path, async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      page.on('pageerror', error => console.error(error.message));
      try {
        await page.route('**/api/players/search?*', route => route.fulfill({ json: { players: [] } }));
        await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
        const input = page.locator('input[type=search]');
        await input.fill('AK');
        await page.waitForFunction(() => window.requests.length === 1);
        await input.pressSequentially('-47 Redline');
        await page.evaluate(() => window.commit(window.requests[0]));
        await page.waitForTimeout(50);
        assert.equal(await input.inputValue(), 'AK-47 Redline', 'an older result must not truncate the draft');
        assert.equal(await input.evaluate(el => el === document.activeElement), true);
        await page.waitForFunction(() => window.requests.some(href => new URL(href, location.origin).searchParams.get('q') === 'AK-47 Redline'));
        await page.evaluate(() => window.commit(window.requests.at(-1)));
        await page.getByRole('button', { name: /Clear .*search|Clear search/ }).click();
        await page.waitForFunction(() => !new URL(window.requests.at(-1), location.origin).searchParams.has('q'));
        assert.equal(await input.inputValue(), '');
        await page.evaluate(() => window.commit(window.requests.at(-1)));
        await input.fill('Enter submits immediately');
        await input.press('Enter');
        assert.match(await page.evaluate(() => window.requests.at(-1)), /q=Enter\+submits\+immediately/);
        assert.equal(await page.evaluate(() => new URL(window.requests.at(-1), location.origin).searchParams.has('page')), false);
        await page.evaluate(() => { history.replaceState({}, '', location.pathname+'?q=history'); window.dispatchEvent(new PopStateEvent('popstate')); window.render('history'); });
        await page.waitForFunction(() => document.querySelector('input[type=search]').value === 'history');
        await page.waitForTimeout(350);
        assert.equal(await input.inputValue(), 'history');
        await input.fill('Still pending');
        await page.waitForFunction(() => new URL(window.requests.at(-1), location.origin).searchParams.get('q') === 'Still pending');
        await page.getByRole('button', { name: /Clear .*search|Clear search/ }).click();
        await page.evaluate(() => window.commit(window.requests.at(-1)));
        await page.waitForTimeout(50);
        assert.equal(await input.inputValue(), '', 'clearing must survive an in-flight response');
        await page.waitForFunction(() => !new URL(window.requests.at(-1), location.origin).searchParams.has('q'));
        await page.evaluate(() => window.commit(window.requests.at(-1)));
        if (path === '/market') {
          await input.fill('New filter query');
          await page.locator('#market-type').selectOption('weapons');
          await page.waitForFunction(() => new URL(window.requests.at(-1), location.origin).searchParams.get('type') === 'weapons');
          await input.pressSequentially(' continued');
          await page.locator('#market-rarity').selectOption('5');
          await page.waitForFunction(() => new URL(window.requests.at(-1), location.origin).searchParams.get('rarity') === '5');
          await page.evaluate(() => window.commit(window.requests.at(-2)));
          await page.waitForTimeout(50);
          assert.equal(await input.inputValue(), 'New filter query continued');
          assert.equal(await page.locator('#market-rarity').inputValue(), '5');
          await page.evaluate(() => window.commit(window.requests.at(-1)));
          await page.waitForTimeout(50);
          assert.equal(await input.inputValue(), 'New filter query continued');
        }
      } finally { await page.close(); }
    });
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
