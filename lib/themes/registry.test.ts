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

const surfaces = ["profile", "global", "smallProfile", "playerContainer"] as const;

test("Shadow is an owned site theme with its own global and profile atmosphere", () => {
  assert.equal(isOwnedPortalThemeKey("shadow"), true);
  for (const surface of surfaces) {
    assert.equal(resolvePortalThemeSurface("shadow", surface).theme.key, "shadow");
  }
  assert.equal(getPortalThemeSurface("shadow", "global")?.background, "shadowAtmosphere");
  assert.equal(getPortalThemeSurface("shadow", "profile")?.background, "shadowAtmosphere");
});

test("every current theme styles the site, profile and public player surfaces", () => {
  for (const key of Object.keys(portalThemes)) {
    assert.equal(isOwnedPortalThemeKey(key), key !== "default");
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

test("both rank ladders add decoration features while every tier has site UI", () => {
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
