import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, next) {
  const stubs: Record<string, string> = {
    "server-only": "export {};",
    "next/headers": "export const cookies=async()=>({get(){return undefined},set(){},delete(){}});",
    "@/lib/data/portal-repository": "export const createPortalSession=async()=>{};export const getPortalSession=async()=>null;export const revokePortalSession=async()=>{};",
    "./session-cookie": "export const COOKIE_NAME='test';export const hashSessionToken=value=>value;export const readSessionTokenHash=async()=>null;",
  };
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  return next(specifier, context);
} });
const auth = await import("./session.ts");
const session = { steamId: "76561198000000001", expiresAt: 2000000000000, tokenHash: "local-test-hash", profileThemeKey: null };

test("all action-token scopes reject malformed Unicode without throwing and keep their scope", t => {
  t.mock.property(process, "env", { ...process.env, SESSION_SECRET: "local-action-token-test-secret" });
  const pairs = [
    [auth.createAdminActionToken, auth.verifyAdminActionToken],
    [auth.createLoadoutActionToken, auth.verifyLoadoutActionToken],
    [auth.createEconomyActionToken, auth.verifyEconomyActionToken],
    [auth.createProfileActionToken, auth.verifyProfileActionToken],
  ] as const;
  for (const [create, verify] of pairs) {
    const token = create(session);
    assert.equal(verify(session, token), true);
    for (const invalid of ["", "x".repeat(token.length), "é".repeat(token.length), "☃".repeat(token.length)]) {
      assert.equal(verify(session, invalid), false, "invalid tokens must fail closed without an HTTP 500");
    }
    for (const [other] of pairs) if (other !== create) assert.equal(verify(session, other(session)), false);
  }
});
