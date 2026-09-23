import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
Object.assign(globalThis, {
  __vipPanelStatus: {
    query: async () => [
      [
        {
          status: "rejected",
          result_json: JSON.stringify({
            error: {
              code: "incompatible_item",
              message: "Permanent tier already owned.",
            },
          }),
          error_code: "incompatible_item",
          last_error: "Permanent tier already owned.",
        },
      ],
      [],
    ],
  },
});
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only")
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier === "@/lib/data/database-pools")
      return {
        url: "data:text/javascript,export const getPortalDatabasePool=()=>globalThis.__vipPanelStatus;export const getGameDatabasePool=()=>null;",
        shortCircuit: true,
      };
    const path = specifier.startsWith("@/")
      ? resolve(specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL?.startsWith("file:")
        ? fileURLToPath(new URL(specifier, context.parentURL))
        : null;
    const file =
      path && (extname(path) ? [path] : [path + ".ts"]).find(existsSync);
    return file
      ? { url: pathToFileURL(file).href, shortCircuit: true }
      : next(specifier, context);
  },
});
test("a rejected durable VIP job reports its error without parsing it as a success", async () => {
  const { getVipMembershipActivationStatus } =
    await import("../data/vip-membership-activation-saga.ts");
  const status = await getVipMembershipActivationStatus({
    steamId: "76561198000000001",
    idempotencyKey: "test",
  });
  assert.equal(status?.status, "rejected");
  assert.equal(status?.result, null);
  assert.equal(status?.error?.code, "incompatible_item");
});
