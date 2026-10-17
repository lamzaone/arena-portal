import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("staff entry requests a fresh document with the viewer session", async () => {
  const boundaries = {
    "@/lib/auth/session": "export const getSession=async()=>({steamId:'76561198000000001',profileThemeKey:'tap_god'});",
    "@/lib/admin/access": "export const getAdminAccess=async()=>({isAdmin:true});",
    "@/lib/player-identities": "export const resolvePlayerIdentities=async()=>({'76561198000000001':{steamId:'76561198000000001',displayName:'Staff fixture',avatarUrl:null,presence:'offline',profileThemeKey:'tap_god',identityGroups:[]}});",
    "next/navigation": "export const usePathname=()=>'/market';export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){},replace(){},prefetch:async()=>{}});",
  };
  const bundle = await build({
    stdin: { contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {RouterContext} from 'next/dist/shared/lib/router-context.shared-runtime';
      import {SiteHeader} from './components/site-header';
      // Keep the actual Next Link implementation active, including click interception.
      // A client transition cannot stand in for the required document request.
      const router={pathname:'/market',asPath:'/market',query:{},isReady:true,push(){},replace(){},prefetch:async()=>{}};
      (async()=>createRoot(document.getElementById('root')).render(
        <RouterContext.Provider value={router}>{await SiteHeader({authenticated:true})}</RouterContext.Provider>
      ))();`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env": '{}' },
    plugins: [{ name: "data-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in boundaries ? { path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: boundaries[path], loader: "js" }));
    } }],
  });
  const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const visits = [];
  const server = createServer((request, response) => {
    if (request.url === '/fixture.js') {
      response.setHeader('content-type', 'text/javascript'); response.end(javascript); return;
    }
    response.setHeader('content-type', 'text/html');
    if (request.url === '/admin/bans') {
      visits.push({ cookie: request.headers.cookie, destination: request.headers['sec-fetch-dest'] });
      response.end('<html data-theme="tap_god"><body><h1>Staff workspace</h1></body></html>'); return;
    }
    response.end('<html><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const origin = `http://127.0.0.1:${server.address().port}`;
      try {
        await page.context().addCookies([{ name: 'fixture_session', value: 'signed-in-viewer', url: origin, httpOnly: true, sameSite: 'Lax' }]);
        await page.goto(origin + '/market');
        const link = page.getByRole('link', { name: 'Open staff panel', exact: true });
        await link.waitFor();
        assert.equal(await link.getAttribute('href'), '/admin/bans');
        assert.equal(await page.locator('.portal-navigation').getAttribute('data-theme'), 'tap_god');
        const before = visits.length;
        await link.click();
        await page.waitForTimeout(300);
        assert.equal(visits.length, before + 1, 'Staff panel must load a document instead of using the client router');
        assert.equal(visits.at(-1).destination, 'document');
        assert.match(visits.at(-1).cookie, /fixture_session=signed-in-viewer/);
        await page.getByRole('heading', { name: 'Staff workspace' }).waitFor();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'tap_god');
      } finally { await page.close(); }
    }
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
