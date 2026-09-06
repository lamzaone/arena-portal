import assert from "node:assert/strict";
import test from "node:test";
import { thumbnailBrowserOptions, thumbnailPersistentBrowserOptions } from "./thumbnail-browser.ts";

test("Windows uses full Chromium with access to the hardware GPU", () => {
  const options = thumbnailBrowserOptions({}, "win32");
  assert.equal(options.channel, "chromium");
  assert.ok(options.args?.includes("--enable-gpu"));
  assert.equal(options.headless, true);
});

test("hosting keeps its packaged headless shell unless GPU rendering is requested", () => {
  const options = thumbnailBrowserOptions({}, "linux");
  assert.equal(options.channel, undefined);
  assert.equal(options.args?.includes("--enable-gpu"), false);
  assert.equal(thumbnailBrowserOptions({ WEAPON_THUMBNAIL_GPU: "true" }, "linux").channel, "chromium");
});

test("GPU opt-out and a host-provided browser path are respected", () => {
  const software = thumbnailBrowserOptions({ WEAPON_THUMBNAIL_GPU: "false" }, "win32");
  assert.equal(software.channel, undefined);
  assert.equal(software.args?.includes("--enable-gpu"), false);
  assert.ok(software.args?.includes("--enable-unsafe-swiftshader"));
  const custom = thumbnailBrowserOptions({ WEAPON_THUMBNAIL_BROWSER_PATH: "/opt/chromium", WEAPON_THUMBNAIL_GPU: "true" }, "linux");
  assert.equal(custom.executablePath, "/opt/chromium");
  assert.equal(custom.channel, undefined);
  assert.ok(custom.args?.includes("--enable-gpu"));
});

test("persistent caches use Simple without overriding Playwright screenshot behavior", () => {
  const options = thumbnailPersistentBrowserOptions({}, "win32");
  assert.ok(options.args?.includes("--disk-cache-size=1073741824"));
  assert.ok(options.args?.includes("--enable-features=CDPScreenshotNewSurface,DiskCacheBackendExperiment:backend/simple"));
  assert.ok(options.args?.includes("--enable-gpu"));
  const legacy = thumbnailPersistentBrowserOptions({ PLAYWRIGHT_LEGACY_SCREENSHOT: "1" }, "linux");
  assert.ok(legacy.args?.includes("--enable-features=DiskCacheBackendExperiment:backend/simple"));
  assert.equal(legacy.channel, undefined);
});
