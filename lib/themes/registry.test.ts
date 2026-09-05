import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/lib/themes/")) {
      return nextResolve(new URL(`./${specifier.slice("@/lib/themes/".length)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { getPortalTheme, getPortalThemeSurface, isOwnedPortalThemeKey, portalThemes, resolvePortalThemeSurface } = await import("./registry.ts");

const profileOnly = ["vip_silver", "vip_gold", "staff", "moderator"];
const allSurfaces = ["vip_diamond", "vip_ultimate", "administrator", "senior_administrator", "owner"];
const surfaces = ["profile", "global", "smallProfile", "playerContainer"] as const;

test("Silver, Gold, Staff and Moderator have profile themes with explicit default fallbacks elsewhere", () => {
  for (const key of profileOnly) {
    assert.equal(isOwnedPortalThemeKey(key), true, `${key} must be equippable`);
    assert.equal(resolvePortalThemeSurface(key, "profile").theme.key, key);
    for (const surface of ["global", "smallProfile", "playerContainer"] as const) {
      assert.equal(getPortalThemeSurface(key, surface), null, `${key} must not provide ${surface}`);
      assert.equal(resolvePortalThemeSurface(key, surface).theme.key, "default");
    }
  }
});

test("higher VIP and staff ranks own their global, profile and public player surfaces", () => {
  for (const key of allSurfaces) {
    assert.equal(isOwnedPortalThemeKey(key), true);
    for (const surface of surfaces) {
      assert.equal(resolvePortalThemeSurface(key, surface).theme.key, key);
      assert.ok(getPortalThemeSurface(key, surface)?.className);
    }
  }
});

test("Standard and unregistered keys cannot become owned themes", () => {
  for (const key of ["vip_standard", "standard", "constructor", "__proto__", "unknown", "default", ""]) {
    assert.equal(isOwnedPortalThemeKey(key), false);
    for (const surface of surfaces) assert.equal(resolvePortalThemeSurface(key, surface).theme.key, "default");
  }
});

test("registered manifests are serializable and preserve existing themes", () => {
  for (const [key, theme] of Object.entries(portalThemes)) {
    assert.equal(theme.key, key);
    assert.deepEqual(JSON.parse(JSON.stringify(theme)), theme);
    if (theme.previewImageUrl) {
      assert.ok(existsSync(new URL(`../../public${theme.previewImageUrl}`, import.meta.url)), `${key} preview must be shipped`);
    }
  }
  for (const key of ["beta_tester", "tap_god"]) {
    assert.equal(getPortalTheme(key).key, key);
    for (const surface of surfaces) assert.equal(resolvePortalThemeSurface(key, surface).theme.key, key);
  }
});

test("rank progression adds features without increasing lower-rank surface access", () => {
  for (const ladder of [["vip_silver", "vip_gold", "vip_diamond", "vip_ultimate"], ["staff", "moderator", "administrator", "senior_administrator", "owner"]]) {
    let previousFeatures: readonly string[] = [];
    for (const [index, key] of ladder.entries()) {
      const progression = getPortalTheme(key).progression;
      assert.ok(progression, `${key} must describe its effects`);
      assert.equal(progression.level, index + 1);
      assert.ok(progression.features.length > previousFeatures.length);
      for (const feature of previousFeatures) assert.ok(progression.features.includes(feature));
      previousFeatures = progression.features;
    }
  }
});
