import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const state = { session: { steamId: "76561198000000001" } as { steamId: string } | null, authorized: true, calls: [] as unknown[], failure: null as Error | null };
(globalThis as typeof globalThis & { __discordLinkRouteTest: typeof state }).__discordLinkRouteTest = state;
const source = (path: string) => (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`]).find(existsSync);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const modules: Record<string, string> = {
      "server-only": "export {};",
      "@/lib/auth/session": `export async function getSession(){return globalThis.__discordLinkRouteTest.session} export function verifyProfileActionToken(_session, csrf){return csrf === 'valid-profile-token'}`,
      "@/lib/discord/bot-auth": `export function authorizeDiscordBot(){return globalThis.__discordLinkRouteTest.authorized}`,
      "@/lib/discord/link-service": `
        const state = globalThis.__discordLinkRouteTest;
        export async function redeemDiscordLinkCode(input){ state.calls.push(input); if(state.failure)throw state.failure; return {steamId:input.steamId,discordUserId:'123456789012345678',linkedAt:'2026-09-12T12:00:00.000Z'} }
        export async function issueDiscordLinkCode(id){ state.calls.push(id); if(state.failure)throw state.failure; return {code:'ABCD-1234-EF56',expiresAt:'2026-09-12T12:10:00.000Z'} }`,
    };
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    if (specifier === "next/server") return { url: pathToFileURL(resolve("node_modules/next/server.js")).href, shortCircuit: true };
    const candidate = specifier.startsWith("@/") ? source(resolve(specifier.slice(2))) : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? source(fileURLToPath(new URL(specifier, context.parentURL))) : undefined;
    if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { POST: link } = await import("../../app/api/discord/link/route.ts");
const { POST: issue } = await import("../../app/api/discord/bot/link-code/route.ts");
const { DiscordLinkError } = await import("./link-repository.ts");
const request = (body: unknown) => new Request("https://portal.example/api/discord/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const reset = () => { state.session = { steamId: "76561198000000001" }; state.authorized = true; state.calls = []; state.failure = null; };

test("website redemption requires a Steam session and the profile CSRF scope", async () => {
  reset();
  state.session = null;
  assert.equal((await link(request({ code: "ABCD-1234-EF56", csrf: "valid-profile-token" }))).status, 401);
  state.session = { steamId: "76561198000000001" };
  assert.equal((await link(request({ code: "ABCD-1234-EF56", csrf: "economy-token" }))).status, 403);
  assert.equal(state.calls.length, 0);
});

test("website redemption uses only the authenticated Steam ID and is never cached", async () => {
  reset();
  const response = await link(request({ steamId: "76561198000000002", code: "ABCD-1234-EF56", csrf: "valid-profile-token" }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(state.calls, [{ steamId: "76561198000000001", code: "ABCD-1234-EF56", source: "portal" }]);
});

test("malformed link requests cannot reach storage", async () => {
  reset();
  for (const body of [null, [], {}, { code: 12, csrf: "valid-profile-token" }]) assert.ok((await link(request(body))).status >= 400);
  assert.equal(state.calls.length, 0);
});

test("link failures have friendly status codes and hide internal database errors", async () => {
  reset();
  for (const [code, status] of [["invalid_code", 400], ["expired_code", 410], ["already_linked", 409], ["storage_unavailable", 503]] as const) {
    state.failure = new DiscordLinkError(code, "Friendly error");
    assert.equal((await link(request({ code: "ABCD-1234-EF56", csrf: "valid-profile-token" }))).status, status);
  }
  state.failure = new Error("private database details");
  const response = await link(request({ code: "ABCD-1234-EF56", csrf: "valid-profile-token" }));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private database details/);
});

test("bot issuance is authorized before parsing or creating codes and never cached", async () => {
  reset();
  state.authorized = false;
  const denied = await issue(request({ discordUserId: "123456789012345678" }));
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(state.calls.length, 0);
  state.authorized = true;
  const issued = await issue(request({ discordUserId: "123456789012345678" }));
  assert.equal(issued.status, 200);
  const payload = await issued.json();
  assert.deepEqual({ code: payload.code, expiresAt: payload.expiresAt }, { code: "ABCD-1234-EF56", expiresAt: "2026-09-12T12:10:00.000Z" });
  assert.equal(new URL(payload.linkUrl).pathname, "/discord-link");
  assert.equal(new URL(payload.linkUrl).search, "");
});

test("bot issuance reports cooldown via HTTP retry-after", async () => {
  reset();
  state.failure = new DiscordLinkError("rate_limited", "Wait 42 seconds.", 42);
  const response = await issue(request({ discordUserId: "123456789012345678" }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
});
