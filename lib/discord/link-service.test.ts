import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const steamId = "76561198000000001";
const link = { steamId, discordUserId: "123456789012345678", linkedAt: "2026-09-30T00:00:00.000Z" };
const state = { grants: [] as Array<[string, string]>, fail: false, linked: false };
(globalThis as typeof globalThis & { __verifiedLinkTest: typeof state }).__verifiedLinkTest = state;
const source = (path: string) => (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`]).find(existsSync);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks: Record<string, string> = {
      "server-only": "export {};",
      "@/lib/data/database-pools": "export function getPortalDatabasePool(){return {}}",
      "@/lib/data/identity-groups": `export async function ensureDiscordVerifiedGroupMembership(steamId,key){const state=globalThis.__verifiedLinkTest;state.grants.push([steamId,key]);if(state.fail)throw Error('Arena unavailable');return true}`,
      "./link-repository": `export class DiscordLinkError extends Error {} export function createDiscordLinkRepository(){return {issue:async()=>({code:'ABCD',expiresAt:''}),redeem:async()=>{globalThis.__verifiedLinkTest.linked=true;return ${JSON.stringify(link)}},getForSteam:async()=>globalThis.__verifiedLinkTest.linked?${JSON.stringify(link)}:null}}`,
    };
    if (specifier in mocks) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    const candidate = specifier.startsWith("@/") ? source(resolve(specifier.slice(2))) : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? source(fileURLToPath(new URL(specifier, context.parentURL))) : undefined;
    if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { redeemDiscordLinkCode, getDiscordLinkForSteam } = await import("./link-service.ts");

test("both redemption and reading an existing link grant the configured verified group", async () => {
  state.grants = []; state.linked = false; state.fail = false;
  process.env.DISCORD_VERIFIED_GROUP_KEY = "discord_verified";
  assert.equal((await redeemDiscordLinkCode({ steamId, code: "ABCD-1234-EF56", source: "game" })).steamId, steamId);
  assert.equal((await getDiscordLinkForSteam(steamId))?.discordUserId, link.discordUserId);
  assert.deepEqual(state.grants, [[steamId, "discord_verified"], [steamId, "discord_verified"]]);
});

test("a temporary Arena failure preserves the link for retry on the next read", async () => {
  state.grants = []; state.linked = false; state.fail = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    await redeemDiscordLinkCode({ steamId, code: "ABCD-1234-EF56", source: "portal" });
    state.fail = false;
    assert.equal((await getDiscordLinkForSteam(steamId))?.steamId, steamId);
    assert.equal(state.grants.length, 2);
  } finally { console.error = originalError; }
});
