import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const upperRangeSteamId = "76561200000000000";
const ownedThemeItemId = "11111111-1111-4111-8111-111111111111";
const projectRoot = resolve(".");

type ProfileDependencyTestGlobal = typeof globalThis & {
  __profileDependencyPortalPool?: {
    query(sql: string, values?: unknown[]): Promise<[unknown[], unknown[]]>;
  };
};

function sourceModuleUrl(path: string): string | null {
  const candidates = extname(path)
    ? [path]
    : [`${path}.ts`, `${path}.tsx`, resolve(path, "index.ts"), resolve(path, "index.tsx")];
  const match = candidates.find(existsSync);
  return match ? pathToFileURL(match).href : null;
}

(globalThis as ProfileDependencyTestGlobal).__profileDependencyPortalPool = {
  async query(sql, values) {
    if (sql.includes("SELECT steam_id, inventory_visibility")) {
      return [[{ steam_id: upperRangeSteamId, inventory_visibility: "private" }], []];
    }
    if (sql.includes("SELECT s.steam_id, t.theme_key")) {
      return [[{ steam_id: upperRangeSteamId, theme_key: "beta_tester", inventory_item_id: ownedThemeItemId }], []];
    }
    if (sql.includes("SELECT item.id AS item_id")) {
      assert.deepEqual(values, [ownedThemeItemId]);
      return [[{ steam_id: upperRangeSteamId, theme_key: "beta_tester", item_id: ownedThemeItemId }], []];
    }
    throw new Error(`Unexpected profile dependency query: ${sql}`);
  },
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return {
        shortCircuit: true,
        url: pathToFileURL(resolve(projectRoot, "node_modules/next/server.js")).href,
      };
    }

    if (specifier === "server-only") {
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    }
    if (specifier === "@/lib/data/database-pools") {
      return {
        url: "data:text/javascript,export function getGameDatabasePool(){return null} export function getPortalDatabasePool(){return globalThis.__profileDependencyPortalPool}",
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/data/identity-groups") {
      return {
        url: "data:text/javascript,export async function applyIdentityGroupMembershipRewards(){} export async function getEffectiveIdentityGroupBadgesForPlayers(){return new Map()} export async function reconcileIdentityGroupMembershipRewardsInTransaction(){return {}}",
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/data/staff-vip-memberships") {
      return {
        url: "data:text/javascript,export class StaffVipMembershipError extends Error {}",
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/data/vip-membership-activation-saga") {
      return {
        url: "data:text/javascript,export async function activateVipMembershipItemWithSaga(){}",
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/auth/session") {
      return {
        url: "data:text/javascript,export async function getSession(){return null}",
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      const url = sourceModuleUrl(resolve(projectRoot, specifier.slice(2)));
      if (url) return { url, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      const resolved = sourceModuleUrl(fileURLToPath(url));
      if (resolved) return { url: resolved, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const {
  getPlayerProfileInventoryPage,
  getPlayerProfileThemeKey,
} = await import("../data/portal-repository.ts");
const { resolvePlayerIdentities } = await import("../player-identities.ts");
const { GET: getInventoryPage } = await import("../../app/api/players/[steamId]/inventory/route.ts");

test("upper-range public profiles reach the inventory dependency without invalid-input failure", async () => {
  assert.deepEqual(await getPlayerProfileInventoryPage(null, upperRangeSteamId), {
    visibility: "private",
    canView: false,
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
});

test("upper-range public profiles retain their equipped profile theme", async () => {
  assert.equal(await getPlayerProfileThemeKey(upperRangeSteamId), "beta_tester");
});

test("upper-range IDs remain player identities with profile enrichment", async () => {
  const identities = await resolvePlayerIdentities([{ steamId: upperRangeSteamId }]);

  assert.equal(identities[upperRangeSteamId]?.steamId, upperRangeSteamId);
  assert.equal(identities[upperRangeSteamId]?.profileThemeKey, "beta_tester");
});

test("upper-range profile inventory pagination accepts the same route identifier", async () => {
  const response = await getInventoryPage(
    new Request(`https://arena.test/api/players/${upperRangeSteamId}/inventory?page=1`),
    { params: Promise.resolve({ steamId: upperRangeSteamId }) },
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
