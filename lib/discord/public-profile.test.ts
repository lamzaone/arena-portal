import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const state = { discordId: "123456789012345678" as string | null, queries: 0 };
(globalThis as typeof globalThis & { __discordPublicProfileTest: typeof state }).__discordPublicProfileTest = state;
const source = (path: string) => (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`]).find(existsSync);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks: Record<string, string> = {
      "server-only": "export {};",
      "@/lib/data/database-pools": `export function getPortalDatabasePool(){return {query:async (_sql,[steamId])=>{const state=globalThis.__discordPublicProfileTest;state.queries++;return [state.discordId?[{discord_user_id:state.discordId}]:[],[]]}}}`,
    };
    if (specifier in mocks) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    const candidate = specifier.startsWith("@/") ? source(resolve(specifier.slice(2))) : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? source(fileURLToPath(new URL(specifier, context.parentURL))) : undefined;
    if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { getPublicDiscordProfileUrl } = await import("./public-profile.ts");

test("public Discord profile URL is available only for a valid linked Discord ID", async () => {
  state.queries = 0; state.discordId = "123456789012345678";
  assert.equal(await getPublicDiscordProfileUrl("76561198000000001"), "https://discord.com/users/123456789012345678");
  state.discordId = null;
  assert.equal(await getPublicDiscordProfileUrl("76561198000000001"), null);
  state.discordId = "https://evil.example";
  assert.equal(await getPublicDiscordProfileUrl("76561198000000001"), null);
  assert.equal(await getPublicDiscordProfileUrl("invalid"), null);
  assert.equal(state.queries, 3);
});
