import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (path) => (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`]).find(existsSync);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    const candidate = specifier.startsWith("@/")
      ? source(resolve(root, specifier.slice(2)))
      : specifier.startsWith(".") && context.parentURL?.startsWith("file:")
        ? source(fileURLToPath(new URL(specifier, context.parentURL)))
        : undefined;
    if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

if (!process.env.PORTAL_DATABASE_URL || !process.env.GAME_DATABASE_URL) {
  throw new Error("PORTAL_DATABASE_URL and GAME_DATABASE_URL are required.");
}
const { getPortalDatabasePool, getGameDatabasePool } = await import("../lib/data/database-pools.ts");
const { reconcileDiscordVerifiedGroupMemberships } = await import("../lib/data/identity-groups.ts");
const portal = getPortalDatabasePool();
try {
  const [links] = await portal.query("SELECT steam_id FROM portal_discord_links ORDER BY steam_id");
  const key = process.env.DISCORD_VERIFIED_GROUP_KEY?.trim() || "discord_verified";
  const changed = await reconcileDiscordVerifiedGroupMemberships(links.map((row) => String(row.steam_id)), key);
  console.log(`Reconciled ${links.length} Discord links with ${changed} new verified memberships.`);
} finally {
  await Promise.all([portal.end(), getGameDatabasePool()?.end()]);
}
