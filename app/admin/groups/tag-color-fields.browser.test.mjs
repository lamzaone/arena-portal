import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("rich tag controls submit independent effects and colors on desktop and mobile", async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {TagColorFields} from './app/admin/groups/tag-color-fields'; import styles from './app/admin/groups/tag-color-fields.module.css'; createRoot(document.getElementById('root')).render(<form className={styles.form}><TagColorFields text="[BETA]" color="#123456" tagStyle="glow" nameStyle="italic" badgeKey="vip" /><button type="submit">Save</button></form>);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic",
    define: { "process.env.NODE_ENV": '\"development\"' },
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
  const css = await readFile("app/globals.css", "utf8") + bundle.outputFiles.find((file) => file.path.endsWith(".css")).text;
  const server = createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("content-type", "text/javascript"); res.end(js); }
    else if (req.url === "/fixture.css") { res.setHeader("content-type", "text/css"); res.end(css); }
    else { res.setHeader("content-type", "text/html"); res.end('<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"></head><body><main id="root" style="max-width:1200px;margin:auto;padding:12px"></main><script src="/fixture.js"></script></body></html>'); }
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
      await page.getByLabel("Tag text", { exact: true }).waitFor();
      const tagStyles = page.getByRole("group", { name: "Tag styles", exact: true });
      await tagStyles.getByRole("button", { name: "bold", exact: true }).click();
      await tagStyles.getByRole("button", { name: "shimmer", exact: true }).click();
      const messageStyles = page.getByRole("group", { name: "Message styles", exact: true });
      await messageStyles.getByRole("button", { name: "pulse", exact: true }).click();
      const color = page.locator('input[name="colorToken"]');
      await color.fill("#bad");
      assert.equal(await page.locator("form").evaluate((form) => form.checkValidity()), false);
      await color.fill("#abcdef");
      await page.locator('input[name="nameColorToken"]').fill("rgb(0,128,255)");
      await page.getByRole("combobox", { name: /Workshop badge/ }).selectOption("tapped");
      const nameColor = page.getByRole("group", { name: "Name color", exact: true });
      await nameColor.locator("summary").click();
      await nameColor.getByRole("radio", { name: /Inherit/ }).check();
      const data = await page.locator("form").evaluate((form) => Object.fromEntries(new FormData(form)));
      assert.equal(data.colorToken, "#abcdef");
      assert.equal(data.nameColorToken, "");
      assert.equal(data.tagStyle, "bold glow shimmer");
      assert.equal(data.nameStyle, "italic");
      assert.equal(data.messageStyle, "pulse");
      assert.equal(data.badgeKey, "tapped");
      await tagStyles.getByRole("button", { name: "cycle", exact: true }).click();
      assert.equal(await tagStyles.getByRole("button", { name: "shimmer", exact: true }).getAttribute("aria-pressed"), "false");
      await tagStyles.getByRole("button", { name: "Add color", exact: true }).click();
      await tagStyles.getByRole("button", { name: "Add color", exact: true }).click();
      await tagStyles.getByLabel("Tag styles effect color 1", { exact: true }).fill("#ff0000");
      await tagStyles.getByLabel("Tag styles effect color 2", { exact: true }).fill("#0000ff");
      await tagStyles.getByLabel("Tag styles frequency", { exact: true }).selectOption("0.25");
      await tagStyles.getByLabel("Tag styles intensity", { exact: true }).selectOption("3");
      const configured = await page.locator("form").evaluate((form) => Object.fromEntries(new FormData(form)));
      assert.equal(configured.tagStyle, "bold glow cycle c=FF0000,0000FF f=0.25 i=3");
      assert.equal(configured.nameStyle, "italic");
      assert.equal(configured.messageStyle, "pulse");
      await tagStyles.getByRole("button", { name: "Remove tag styles color 1", exact: true }).click();
      assert.equal(await tagStyles.getByLabel("Tag styles effect color 1", { exact: true }).inputValue(), "#0000ff");
      for (let i = 0; i < 5; i++) await tagStyles.getByRole("button", { name: "Add color", exact: true }).click();
      assert.equal(await tagStyles.getByRole("button", { name: "Add color", exact: true }).isDisabled(), true);
      assert.ok((await page.locator('input[name="tagStyle"]').inputValue()).length <= 96);
      await mkdir(".superpowers/chat-effects", { recursive: true });
      await page.screenshot({ path: `.superpowers/chat-effects/editor-${width}.png`, fullPage: true });
      await tagStyles.getByRole("button", { name: "Reset palette", exact: true }).click();
      assert.equal(await page.locator('input[name="tagStyle"]').inputValue(), "bold glow cycle f=0.25 i=3");
      await tagStyles.getByRole("button", { name: "Add color", exact: true }).click();
      await tagStyles.getByRole("button", { name: "cycle", exact: true }).click();
      await tagStyles.getByRole("button", { name: "glow", exact: true }).click();
      assert.equal(await page.locator('input[name="tagStyle"]').inputValue(), "bold c=38BDF8 f=0.25 i=3");
      await page.waitForFunction(() => [...document.querySelectorAll("span")].some((el) => el.textContent === "[BETA]" && getComputedStyle(el).color === "rgb(171, 205, 239)"));
      assert.equal(await page.getByText("[BETA]", { exact: true }).evaluate((el) => getComputedStyle(el).color), "rgb(171, 205, 239)");
      assert.equal(await page.locator("form").evaluate((form) => form.checkValidity()), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.getByText("Good luck, have fun!", { exact: true }).evaluate((el) => getComputedStyle(el).animationName), "none");
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
});
