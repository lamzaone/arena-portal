import assert from "node:assert/strict";
import test from "node:test";

test("builds canonical URLs on the public TAPPED.RO origin", async () => {
  const seo = await import("./site.ts").catch(() => null);

  assert.ok(seo, "the shared SEO module should exist");
  assert.equal(seo.canonicalUrl("/").href, "https://tapped.ro/");
  assert.equal(seo.canonicalUrl("/modes").href, "https://tapped.ro/modes");
});

test("publishes only stable public landing pages in the sitemap", async () => {
  const seo = await import("./site.ts");

  assert.equal(typeof seo.buildPublicSitemap, "function");
  const urls = seo.buildPublicSitemap().map((entry) => entry.url);

  assert.deepEqual(urls, [
    "https://tapped.ro/",
    "https://tapped.ro/modes",
    "https://tapped.ro/vip",
    "https://tapped.ro/ranking",
    "https://tapped.ro/market",
  ]);
  assert.equal(urls.some((url) => /\/(?:admin|api|players|inventory|loadout|trades)(?:\/|$)/.test(url)), false);
});

test("keeps public pages crawlable while excluding private portal surfaces", async () => {
  const seo = await import("./site.ts");

  assert.equal(typeof seo.buildRobotsPolicy, "function");
  const policy = seo.buildRobotsPolicy();
  const rule = policy.rules[0];

  assert.equal(rule.allow, "/");
  assert.deepEqual(rule.disallow, [
    "/admin/",
    "/api/",
    "/players/",
    "/inventory",
    "/loadout",
    "/trades",
    "/settings",
    "/tickets",
    "/appeals",
  ]);
  assert.equal(policy.sitemap, "https://tapped.ro/sitemap.xml");
});

test("describes the homepage as an English CS2 arena server for Romania without stuffing", async () => {
  const seo = await import("./site.ts");

  assert.equal(typeof seo.buildHomeMetadata, "function");
  const metadata = seo.buildHomeMetadata();
  const title = String(metadata.title);
  const description = String(metadata.description);

  assert.match(title, /CS2 Arena Server Romania/i);
  assert.match(description, /CS2 arena server in Romania/i);
  assert.equal((title.match(/CS2/gi) ?? []).length, 1);
  assert.ok(title.length <= 60);
  assert.ok(description.length >= 100 && description.length <= 160);
  assert.equal(metadata.alternates.canonical, "/");
  assert.equal(metadata.openGraph.url, "https://tapped.ro/");
  assert.equal(metadata.openGraph.locale, "en_RO");
});

test("gives each public discovery page a unique canonical search identity", async () => {
  const seo = await import("./site.ts");

  assert.equal(typeof seo.buildPageMetadata, "function");
  const entries = (["/modes", "/vip", "/ranking", "/market"] as const).map((pathname) => ({
    pathname,
    metadata: seo.buildPageMetadata(pathname),
  }));

  assert.equal(new Set(entries.map(({ metadata }) => metadata.title)).size, entries.length);
  for (const { pathname, metadata } of entries) {
    assert.ok(String(metadata.title).includes("TAPPED.RO"));
    assert.ok(String(metadata.description).length >= 70);
    assert.equal(metadata.alternates.canonical, pathname);
  }
});

test("identifies TAPPED.RO and its Romanian CS2 arena service in structured data", async () => {
  const seo = await import("./site.ts");

  assert.equal(typeof seo.buildHomeStructuredData, "function");
  const data = seo.buildHomeStructuredData();
  const graph = data["@graph"];
  const website = graph.find((entry) => entry["@type"] === "WebSite");
  const service = graph.find((entry) => entry["@type"] === "Service");

  assert.equal(data["@context"], "https://schema.org");
  assert.ok(website);
  assert.ok(service);
  assert.ok(service.areaServed);
  assert.equal(website.url, "https://tapped.ro/");
  assert.equal(website.inLanguage, "en");
  assert.equal(service.serviceType, "Counter-Strike 2 arena server");
  assert.equal(service.areaServed.name, "Romania");
  assert.equal(service.url, "https://tapped.ro/");
});
