import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("the entire theme collection preserves readable UI, ownership, motion controls and progressive effects", async t => {
  const bundle = await build({
    stdin: { contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{createPortal}from'react-dom';import{portalThemes}from'./lib/themes/registry';import{GlobalThemeBackground,ProfileThemeBackground}from'./components/profile-theme-slots';import{PortalVisualEffects}from'./components/ui/portal-visual-effects';import{PanelEffects}from'./components/ui/panel-effects';import{ThemedPlayerContainer}from'./components/ui/themed-player-container';
      const query=new URLSearchParams(location.search),key=query.get('theme')||'default',profile=query.get('profile'),theme=portalThemes[key];window.themeKeys=Object.keys(portalThemes);document.documentElement.className=theme.surfaces.global.className;document.documentElement.dataset.theme=key;document.documentElement.dataset.themeSurface='global';
      function Demo(){const[tab,setTab]=useState('Overview');return <>{createPortal(<GlobalThemeBackground themeKey={key}/>,document.body)}<PortalVisualEffects/><PanelEffects/><div className='portal-content'><main className={'portal-page tapped-page player-profile-page '+(profile?portalThemes[profile].surfaces.profile.className:'')} data-theme={profile||key} data-theme-surface={profile?'profile':'global'} data-theme-owner={profile?'profile':undefined}>
      {profile?<ProfileThemeBackground themeKey={profile}/>:null}<div className='shell'><div className='portal-navigation'><header className='site-header'><a className='brand' href='/'><img src='/images/branding/tapped-emblem.svg' width='40' height='36' alt=''/><span>TAPPED.RO</span></a><nav aria-label='Primary navigation'><a href='#cards'>Community</a><a href='#settings'>Your space</a></nav><button className='button button-primary'>Join the arena</button></header></div>
      <header data-ui='page-heading'><div><p className='eyebrow'>THE TAPPED COLLECTION / {key.replaceAll('_',' ')}</p><h1>Your game.<br/>Your signature.</h1><p>Precision, presence, and a little personality. Every part of your player hub, in your colors.</p></div></header>
      <div className='theme-demo-tabs' role='tablist'>{['Overview','Activity','Settings'].map(value=><button role='tab' aria-selected={tab===value} key={value} onClick={()=>setTab(value)}>{value}</button>)}</div>
      <div className='theme-demo-grid' id='cards'><section className='panel' data-ui='panel'><p className='eyebrow'>YOUR MOMENT</p><h2>Every round counts.</h2><div data-depth-art className='theme-demo-emblem'><img src='/images/branding/tapped-emblem.svg' alt='' width='150' height='135'/></div><p>Your progress, your people, and your collection. Built around the way you play.</p><button className='button button-primary'>Open your profile</button></section><section className='panel' data-ui='panel' id='settings'><p className='eyebrow'>MAKE IT YOURS</p><h2>A place in the arena.</h2><label>Display name<input defaultValue='Arena player'/></label><label>Your preferences<select defaultValue='Arena'><option>Arena</option><option>Duels</option></select></label><div className='theme-demo-actions'><button className='button button-primary'>Save changes</button><button className='button button-secondary'>Cancel</button></div><details><summary>Explore the details</summary><p>Theme colors remain readable with focus, motion paused, and at phone widths.</p></details></section></div>
      <div className='theme-demo-stats'><article className='panel'><span>Hours played</span><strong>128.5</strong></article><article className='panel'><span>Reputation</span><strong>+42</strong></article><article className='panel'><span>Commendations</span><strong>73</strong></article></div>
      <ThemedPlayerContainer as='article' profileThemeKey='shadow' className='theme-demo-comment'><strong>Another player's own theme.</strong><p>Their identity stays intact inside your profile.</p><a href='#cards'>View profile</a><div className='panel' data-nested-panel><img data-depth-art src='/images/branding/tapped-emblem.svg' width='24' height='24' alt=''/><span>Their surface keeps its own material.</span></div></ThemedPlayerContainer></div></main></div></>};createRoot(document.getElementById('root')).render(<Demo/>);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "theme-boundaries", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const usePathname=()=>location.pathname", loader: "js" }));
    } }],
  });
  const layout = await readFile("app/layout.tsx", "utf8");
  const sheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => match[1]);
  const css = (await Promise.all(sheets.map(path => readFile(resolve("app", path), "utf8")))).join("\n") + `
    .theme-demo-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.theme-demo-grid .panel{padding:28px}.theme-demo-grid h2{font-size:27px;margin:8px 0 16px}.theme-demo-grid p{max-width:48ch;font-size:14px;color:var(--theme-text-muted)}.theme-demo-grid label{display:grid;gap:6px;margin:16px 0;font-size:12px}.theme-demo-grid input,.theme-demo-grid select{min-height:42px;padding:10px;border:1px solid var(--theme-border);background:var(--theme-control-bg);color:var(--theme-text)}.theme-demo-actions{display:flex;gap:10px;margin-block:22px}.theme-demo-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:20px}.theme-demo-stats article{padding:20px}.theme-demo-stats span{display:block;font-size:12px;color:var(--theme-text-muted)}.theme-demo-stats strong{display:block;font:32px var(--font-display);margin-top:12px}.theme-demo-comment{padding:20px;margin-top:20px}.theme-demo-comment p{font-size:13px}.theme-demo-emblem{float:right;margin:0 0 16px 20px}.theme-demo-grid details{padding-top:16px;border-top:1px solid var(--theme-border)}.theme-demo-tabs{display:flex;gap:8px;margin-block:24px}.theme-demo-tabs button{padding:12px 22px;border:1px solid var(--theme-border);background:var(--theme-surface);color:var(--theme-text-muted);border-radius:var(--theme-radius)}.theme-demo-tabs button[aria-selected=true]{border-color:var(--theme-accent);color:var(--theme-text);box-shadow:inset 0 -2px var(--theme-accent)}.site-header nav{display:flex;gap:22px;margin-left:auto;font-size:13px}.theme-demo-grid .button{font-size:12px}.theme-demo-grid .theme-demo-emblem img{object-fit:contain} [data-ui=page-heading] h1{font-size:50px;max-width:600px}@media(max-width:640px){.theme-demo-grid{grid-template-columns:1fr}.theme-demo-grid .panel{padding:22px}.theme-demo-grid h2{font-size:24px}.theme-demo-stats{gap:8px}.theme-demo-stats article{padding:14px 10px}.theme-demo-stats strong{font-size:26px}.theme-demo-stats span{font-size:10px}.site-header nav{display:none}.site-header .button{font-size:11px;padding:8px}.brand{font-size:12px}.brand img{width:28px;height:26px}.theme-demo-emblem{float:none;margin:0 0 12px}[data-ui=page-heading] h1{font-size:36px}.theme-demo-tabs button{padding:10px 16px}}
  `;
  const javascript = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer(async (request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(javascript); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (request.url.startsWith("/images/")) {
      try { const path = resolve("public", request.url.slice(1)); response.setHeader("content-type", extname(path) === ".svg" ? "image/svg+xml" : "image/png"); response.end(await readFile(path)); }
      catch { response.statusCode = 404; response.end(); }
    } else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    await mkdir(".cache/theme-collection-previews", { recursive: true });
    const keys = ["default", "beta_tester", "shadow", "tap_god", "vip_silver", "vip_gold", "vip_diamond", "vip_ultimate", "staff", "moderator", "administrator", "senior_administrator", "owner"];
    const origin = `http://127.0.0.1:${server.address().port}`;
    const measured = {};
    for (const key of keys) await t.test(`${key} keeps its own palette and readable boxed controls at phone and desktop widths`, async () => {
      for (const width of [390, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 1080 }, reducedMotion: "reduce" });
        page.setDefaultTimeout(6000);
        const errors = []; page.on("pageerror", error => errors.push(error.message));
        await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
        try {
          await page.goto(`${origin}/?theme=${key}`);
          await page.getByRole("tab", { name: "Activity", exact: true }).click();
          assert.equal(await page.getByRole("tab", { name: "Activity", exact: true }).getAttribute("aria-selected"), "true");
          await page.getByRole("textbox", { name: "Display name" }).focus();
          assert.notEqual(await page.getByRole("textbox").evaluate(el => getComputedStyle(el).outlineStyle), "none");
          const style = await page.locator('[data-ui="panel"]').first().evaluate(el => { const s = getComputedStyle(el); return { effect: Number(s.getPropertyValue('--theme-effect-level')), depth: Number(s.getPropertyValue('--theme-effect-depth')), radius: s.borderRadius, color: s.color, background: s.backgroundColor }; });
          measured[key] = style;
          assert.ok(style.effect >= 1 && style.effect <= 5);
          assert.ok(parseFloat(style.radius) <= 3, "primary panels use the boxed geometry");
          assert.notEqual(style.color, style.background);
          assert.equal(await page.locator('[data-theme="shadow"][data-theme-surface="player-container"]').count(), 1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${key} ${width} must not overflow`);
          assert.deepEqual(errors, []);
          await page.screenshot({ path: `.cache/theme-collection-previews/${key}-${width}.png`, fullPage: true });
        } finally { await page.close(); }
      }
    });
    await t.test("both rank ladders gain progressively stronger effects", () => {
      for (const ladder of [["vip_silver", "vip_gold", "vip_diamond", "vip_ultimate"], ["staff", "moderator", "administrator", "senior_administrator", "owner"]]) {
        for (let index = 1; index < ladder.length; index++) {
          assert.ok(measured[ladder[index]].effect > measured[ladder[index - 1]].effect);
          assert.ok(measured[ladder[index]].depth > measured[ladder[index - 1]].depth);
        }
      }
    });
    await t.test("pausing backgrounds persists and leaves button actions usable", async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
      try {
        await page.goto(`${origin}/?theme=default`);
        await page.getByRole("button", { name: "Pause visual effects", exact: true }).click();
        assert.equal(await page.locator('html').getAttribute('data-visual-motion'), 'paused');
        assert.equal(await page.locator('.atmosphere-frame').first().evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
        await page.getByRole('tab', { name: 'Activity', exact: true }).click();
        assert.equal(await page.getByRole('tab', { name: 'Activity', exact: true }).getAttribute('aria-selected'), 'true');
        await page.reload();
        await page.getByRole('button', { name: 'Resume visual effects', exact: true }).waitFor();
      } finally { await page.close(); }
    });
    await t.test("a viewed profile owns its backdrop and theme instead of the viewer", async () => {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      try {
        await page.goto(`${origin}/?theme=shadow&profile=vip_gold`);
        assert.equal(await page.locator('[data-theme-background-surface="global"]').isVisible(), false);
        assert.equal(await page.locator('[data-theme-background-surface="profile"]').isVisible(), true);
        assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).getPropertyValue('--theme-effect-level').trim()), '2');
      } finally { await page.close(); }
    });
    await t.test("signature trims render and never cross a nested player theme", async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, reducedMotion: "reduce" });
      try {
        await page.goto(`${origin}/?theme=vip_gold`);
        const gold = await page.locator('[data-ui="panel"]').first().evaluate(el => getComputedStyle(el).boxShadow);
        assert.match(gold, /255, 231, 160/, "the gold material must reach the actual panel");
        await page.evaluate(() => document.querySelector('main').dataset.theme = 'staff');
        assert.equal(await page.locator('[data-ui="panel"]').first().evaluate(el => getComputedStyle(el).borderLeftWidth), '2px');
        assert.equal(await page.locator('[data-nested-panel]').evaluate(el => getComputedStyle(el).borderLeftWidth), '1px', "the nested Shadow panel must not inherit Staff trim");
      } finally { await page.close(); }
    });
    await t.test("outer cards cannot tilt another player's nested artwork", async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, reducedMotion: "no-preference" });
      try {
        await page.goto(`${origin}/?theme=default`);
        await page.locator('.theme-demo-comment > strong').hover();
        assert.equal(await page.locator('[data-nested-panel] img').getAttribute('data-panel-depth'), null);
      } finally { await page.close(); }
    });
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
