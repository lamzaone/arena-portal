import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const saved = "glow pulse cycle glow.c=112233 glow.i=2 glow.r=3 pulse.f=0.25 pulse.i=3 cycle.c=FF0000,00FF00,0000FF cycle.f=1 cycle.m=steps";
test("effect panels show saved values, isolate edits, and retain settings across toggles and reloads", async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {TagColorFields} from './app/admin/groups/tag-color-fields'; import styles from './app/admin/groups/tag-color-fields.module.css'; const root=createRoot(document.getElementById('root')); window.renderSaved=(tagStyle)=>root.render(<form className={styles.form} onSubmit={event=>{event.preventDefault();window.submitted=Object.fromEntries(new FormData(event.currentTarget));window.renderSaved(window.submitted.tagStyle)}}><TagColorFields text="[BETA]" color="#ABCDEF" tagStyle={tagStyle} nameStyle="italic" badgeKey="vip" /><button type="submit">Save</button></form>); window.renderSaved(${JSON.stringify(saved)});`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", define: { "process.env.NODE_ENV": '\"development\"' },
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
  const css = (await Promise.all(["app/globals.css", "app/themes/default.css", "app/themes/shared.css"].map((path) => readFile(path, "utf8")))).join("\n") + bundle.outputFiles.find((file) => file.path.endsWith(".css")).text;
  const server = createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("content-type", "text/javascript"); res.end(js); }
    else if (req.url === "/fixture.css") { res.setHeader("content-type", "text/css"); res.end(css); }
    else { res.setHeader("content-type", "text/html"); res.end('<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"></head><body data-theme="default" data-theme-surface="global" class="global-theme-default"><main id="root" style="max-width:1200px;margin:auto;padding:12px"></main><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [1280, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const tag = page.getByRole("group", { name: "Tag styles", exact: true });
      const glow = tag.getByRole("region", { name: "Tag styles Glow effect", exact: true });
      const pulse = tag.getByRole("region", { name: "Tag styles Pulse effect", exact: true });
      const cycle = tag.getByRole("region", { name: "Tag styles Cycle effect", exact: true });
      const gradient = tag.getByRole("region", { name: "Tag styles Gradient effect", exact: true });
      await glow.getByLabel("Tag styles Glow color", { exact: true }).waitFor();
      assert.equal(await glow.getByLabel("Tag styles Glow color", { exact: true }).inputValue(), "#112233");
      assert.equal(await glow.getByLabel("Tag styles Glow size", { exact: true }).inputValue(), "3");
      assert.equal(await glow.getByLabel("Tag styles Glow intensity", { exact: true }).inputValue(), "2");
      assert.equal(await glow.getByLabel(/frequency/).count(), 0);
      assert.equal(await pulse.locator('input[type="color"]').count(), 0);
      assert.equal(await cycle.getByLabel(/intensity/).count(), 0);
      assert.equal(await cycle.getByLabel("Tag styles Cycle frequency", { exact: true }).inputValue(), "1");
      assert.equal(await cycle.getByLabel("Tag styles Cycle transition", { exact: true }).inputValue(), "steps");
      assert.equal(await pulse.getByLabel("Tag styles Pulse frequency", { exact: true }).inputValue(), "0.25");
      await pulse.getByLabel("Tag styles Pulse frequency", { exact: true }).selectOption("2");
      assert.match(await page.getByRole("status").innerText(), /Unsaved changes/);
      assert.equal(await cycle.getByLabel("Tag styles Cycle frequency", { exact: true }).inputValue(), "1");
      await glow.getByRole("button", { name: "Glow", exact: true }).click();
      await glow.getByRole("button", { name: "Glow", exact: true }).click();
      assert.equal(await glow.getByLabel("Tag styles Glow color", { exact: true }).inputValue(), "#112233");
      assert.equal(await glow.getByLabel("Tag styles Glow size", { exact: true }).inputValue(), "3");
      await gradient.getByRole("button", { name: "Gradient", exact: true }).click();
      assert.equal(await gradient.getByLabel(/frequency/).count(), 0);
      assert.equal(await gradient.getByLabel("Tag styles Gradient color 1", { exact: true }).inputValue(), "#38bdf8");
      await gradient.getByLabel("Tag styles Gradient direction", { exact: true }).selectOption("reverse");
      await gradient.getByLabel("Tag styles Gradient color 1 HEX", { exact: true }).fill("#BAD");
      assert.equal(await page.locator("form").evaluate((form) => form.checkValidity()), false);
      await gradient.getByLabel("Tag styles Gradient color 1 HEX", { exact: true }).fill("#ABC123");
      await gradient.getByRole("button", { name: "Add color", exact: true }).click();
      await gradient.getByRole("button", { name: "Move Tag styles Gradient color 4 earlier", exact: true }).click();
      await gradient.getByRole("button", { name: "Remove Tag styles Gradient color 2", exact: true }).click();
      await cycle.getByRole("button", { name: "Cycle", exact: true }).click();
      assert.equal(await cycle.getByLabel("Tag styles Cycle transition", { exact: true }).inputValue(), "steps");
      const data = await page.locator("form").evaluate((form) => Object.fromEntries(new FormData(form)));
      assert.match(data.tagStyle, /glow\.c=112233/);
      assert.match(data.tagStyle, /pulse\.f=2/);
      assert.match(data.tagStyle, /cycle\.f=1/);
      assert.match(data.tagStyle, /gradient\.d=reverse/);
      assert.equal(data.nameStyle, "italic");
      assert.equal(data.messageStyle, "");
      await page.getByRole("button", { name: "Save tag settings", exact: true }).click();
      await page.waitForFunction(() => window.submitted !== undefined);
      assert.equal((await page.evaluate(() => window.submitted)).tagStyle, data.tagStyle);
      await page.waitForFunction((value) => document.querySelector('input[name="tagStyle"]').value === value, data.tagStyle);
      assert.match(await page.getByRole("status").innerText(), /Showing current settings/);
      assert.equal(await pulse.getByLabel("Tag styles Pulse frequency", { exact: true }).inputValue(), "2");
      assert.equal(await glow.getByLabel("Tag styles Glow color", { exact: true }).inputValue(), "#112233");
      await page.evaluate(() => window.renderSaved("glow glow.c=ABCDEF glow.i=1 glow.r=2"));
      await page.waitForFunction(() => document.querySelector('input[name="tagStyle"]').value.includes("glow.r=2"));
      assert.equal(await glow.getByLabel("Tag styles Glow size", { exact: true }).inputValue(), "2");
      assert.equal(await glow.getByLabel("Tag styles Glow color", { exact: true }).inputValue(), "#abcdef");
      assert.equal(await page.locator("form").evaluate((form) => form.checkValidity()), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await mkdir(".superpowers/chat-effects-independent", { recursive: true });
      await page.screenshot({ path: `.superpowers/chat-effects-independent/editor-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
});
