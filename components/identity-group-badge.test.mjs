import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Keep the real badge renderer and group mutation validation. Replace only
// server startup and unavailable database boundaries; this suite never writes.
const boundaries = {
  "server-only": "export {};",
  "@/lib/data/database-pools": "export const getGameDatabasePool=()=>null; export const getPortalDatabasePool=()=>null;",
  "@/lib/data/identity-catalogue": "export const ensureIdentityCatalogue=async()=>{}; export const getIdentityCatalogueStatus=async()=>({}); export const syncIdentityCatalogue=async()=>{};",
};
function sourceUrl(path) {
  const match = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`]).find(existsSync);
  return match ? pathToFileURL(match).href : null;
}
registerHooks({
  resolve(specifier, context, next) {
    if (specifier in boundaries) return { url: `data:text/javascript,${encodeURIComponent(boundaries[specifier])}`, shortCircuit: true };
    const url = specifier.startsWith("@/")
      ? sourceUrl(resolve(specifier.slice(2)))
      : specifier.startsWith(".") && context.parentURL?.startsWith("file:")
        ? sourceUrl(fileURLToPath(new URL(specifier, context.parentURL)))
        : null;
    return url ? { url, shortCircuit: true } : next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && url.endsWith(".tsx")) {
      return { format: "module", shortCircuit: true, source: transformSync(readFileSync(new URL(url), "utf8"), { loader: "tsx", jsx: "automatic", format: "esm" }).code };
    }
    return next(url, context);
  },
});

const { IdentityGroupBadge, IdentityGroupBadgeList } = await import("./identity-group-badge.tsx");
const { createIdentityGroup, updateIdentityGroup } = await import("../lib/data/identity-groups.ts");
const { identityExternalBadgeLookupKey } = await import("../lib/content/identity-group-badges.ts");
const expandedIcons = [
  ["medal", "medal"], ["trophy", "trophy"], ["gem", "gem"], ["diamond", "diamond"],
  ["swords", "swords"], ["crosshair", "crosshair"], ["target", "target"], ["flame", "flame"],
  ["zap", "zap"], ["heart", "heart"], ["handshake", "handshake"], ["book", "book-open"],
  ["headphones", "headphones"], ["flag", "flag"], ["wrench", "wrench"], ["code", "code-xml"],
  ["bot", "bot"], ["verified", "circle-check-big"],
];
const group = {
  id: 11, key: "champions", displayName: "Arena champions", sourceType: "custom", externalKey: null,
  description: null, badgeLabel: "CHAMP", badgeIconKey: "trophy", badgeColor: "#eeb84c",
  badgeSoftColor: "#33240e", profilePriority: 10,
};
const input = {
  actor: { steamId: "76561198000000001", isFounder: true }, requestKey: "badge-catalogue-test",
  key: "champions", groupId: 11, displayName: group.displayName, badgeLabel: group.badgeLabel,
  badgeColor: group.badgeColor, badgeSoftColor: group.badgeSoftColor, enabled: true,
};
const renderBadge = icon => renderToStaticMarkup(createElement(IdentityGroupBadge, { group: { ...group, badgeIconKey: icon } }));

test("expanded rank and group symbols render distinct SVGs in actual identity badges", () => {
  const shapes = new Set();
  for (const [key, lucideName] of expandedIcons) {
    const markup = renderBadge(key);
    assert.match(markup, new RegExp(`lucide-${lucideName}(?:[\\s"-])`), `${key} must render its selected symbol`);
    assert.match(markup, /aria-label="CHAMP, Arena champions, Portal group"/);
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, /--identity-badge-color:#eeb84c/);
    shapes.add(markup.match(/<svg[^>]*>(.*?)<\/svg>/)[1]);
  }
  assert.equal(shapes.size, expandedIcons.length, "each newly selectable symbol needs distinct artwork");
});

test("expanded symbols pass actual create and update validation before the storage boundary", async () => {
  for (const mutation of [createIdentityGroup, updateIdentityGroup]) {
    for (const [badgeIconKey] of expandedIcons) {
      await assert.rejects(mutation({ ...input, badgeIconKey }), { code: "storage_unavailable" }, `${badgeIconKey} must be accepted by ${mutation.name}`);
    }
    await assert.rejects(mutation({ ...input, badgeIconKey: "unregistered-symbol" }), { code: "invalid_input" });
  }
});

test("legacy badge symbols and unknown stored-icon fallback remain intact", () => {
  for (const [key, lucideName] of [["shield", "shield-check"], ["crown", "crown"], ["star", "star"], ["badge", "badge-check"], ["sparkles", "sparkles"], ["users", "users-round"]]) {
    assert.match(renderBadge(key), new RegExp(`lucide-${lucideName}(?:[\\s"-])`));
  }
  assert.equal(renderBadge("unregistered-symbol"), renderBadge("badge"));
  const list = renderToStaticMarkup(createElement(IdentityGroupBadgeList, { groups: [group], compact: true }));
  assert.match(list, /role="list" aria-label="Player groups"/);
  assert.match(list, /role="listitem"/);
  assert.match(list, /is-compact/);
});

test("external group badge lookup still normalizes native group aliases independently of icon keys", () => {
  assert.equal(identityExternalBadgeLookupKey("vipcore", "  VIP-Gold  "), "vipcore:GOLD");
  assert.equal(identityExternalBadgeLookupKey("vipcore", "Ｇｏｌｄ"), "vipcore:GOLD");
  assert.equal(identityExternalBadgeLookupKey("admins_core", " Senior Admin "), "admins_core:SENIOR_ADMIN");
  assert.equal(identityExternalBadgeLookupKey("admins_core", "VIP_Gold"), "admins_core:VIP_GOLD");
});
