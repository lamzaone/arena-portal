import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("group symbol picker previews presets and custom uploads without changing another group", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9m8AAAAASUVORK5CYII=", "base64");
  const bundle = await build({
    stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import{GroupBadgeSymbolPicker}from'./components/group-badge-symbol-picker';import{IdentityGroupIcon}from'./components/identity-group-icon';createRoot(document.getElementById('root')).render(<main className='tapped-page portal-page'><form className='staff-management-form' onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);window.payload={icon:f.get('badgeIconKey'),file:f.get('badgeSymbol')?.name}}}><h1>Group badge</h1><GroupBadgeSymbolPicker initialIcon='custom.0123456789abcdef01234567'/><button type='submit'>Save presentation</button></form><div aria-label='Another group symbol'><IdentityGroupIcon icon='crown'/></div></main>);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  });
  const layout = await readFile("app/layout.tsx", "utf8");
  const sheets = [...layout.matchAll(/import "\.\/(.+\.css)";/g)].map(match => match[1]);
  const css = (await Promise.all(sheets.map(path => readFile(resolve("app", path), "utf8")))).join("\n") + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n") + "#root{max-width:740px;margin:20px auto;padding:16px}form{padding:16px}h1{font-size:22px}";
  const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(js); }
    else if (request.url === "/fixture.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else if (request.url.startsWith("/api/group-badges/")) { response.setHeader("content-type", "image/png"); response.end(png); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><html class="global-theme-default" data-theme="default"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch({ headless: true });
  try {
    await mkdir(".cache/group-badge-previews", { recursive: true });
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        const select = page.getByLabel("Badge symbol", { exact: true });
        assert.equal(await select.inputValue(), "custom.0123456789abcdef01234567");
        await page.getByText(/^Browse \d+ symbols$/).click();
        const presets = page.getByRole("group", { name: "Preset badge symbols" });
        await presets.getByRole("button", { name: "Moderator · Gavel", exact: true }).click();
        assert.equal(await select.inputValue(), "gavel");
        await page.locator('input[type="file"]').setInputFiles({ name: "own-symbol.png", mimeType: "image/png", buffer: png });
        await page.locator('img[src^="blob:"]').waitFor();
        await page.getByRole("button", { name: "Save presentation" }).click();
        assert.deepEqual(await page.evaluate(() => window.payload), { icon: "gavel", file: "own-symbol.png" });
        await select.selectOption("shield_user");
        assert.equal(await page.locator('input[type="file"]').evaluate(element => element.files.length), 0, "choosing a preset clears the pending upload");
        assert.equal(await page.locator('[aria-label="Another group symbol"] .lucide-crown').count(), 1);
        await page.locator('input[type="file"]').setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
        assert.match(await page.getByRole("alert").innerText(), /Choose a PNG/);
        assert.equal(await page.locator('input[type="file"]').evaluate(element => element.files.length), 0);
        await page.screenshot({ path: `.cache/group-badge-previews/picker-${width}.png`, fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `picker fits ${width}px: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => ({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,12)))}`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
