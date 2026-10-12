import test from "node:test";
import assert from "node:assert/strict";
import { authorizeWarning, canManageWarnings, warningStatus, validateWarningInput } from "./warning-policy.ts";

const staff = { isAdmin: true, isAssignedToServer: true, immunity: 30, permissions: new Set(["admins.commands.warn"]) };
test("warn requires genuine permission and this server's assignment", () => {
  assert.equal(canManageWarnings(staff, "issue"), true);
  assert.equal(canManageWarnings({ ...staff, isAssignedToServer: false }, "issue"), false);
  assert.equal(canManageWarnings({ ...staff, permissions: new Set(["admins.commands.ban"]) }, "issue"), false);
  assert.equal(canManageWarnings(staff, "revoke"), false);
  assert.equal(canManageWarnings({ ...staff, permissions: new Set(["admins.commands.*"]) }, "revoke"), true);
});
test("higher immunity cannot be warned; equal immunity follows configured portal mode 1", () => {
  assert.throws(() => authorizeWarning(staff, { ...staff, immunity: 40 }, "issue"), /immunity/);
  assert.doesNotThrow(() => authorizeWarning(staff, staff, "issue"));
});
test("expiry boundary retains expired history and revocation remains explicit", () => {
  assert.equal(warningStatus({ expiresAt: 1001, revokedAt: null }, 1000), "Active");
  assert.equal(warningStatus({ expiresAt: 1000, revokedAt: null }, 1000), "Expired");
  assert.equal(warningStatus({ expiresAt: 1001, revokedAt: 999 }, 1000), "Revoked");
});
test("warnings require bounded positive expiry and reason plus valid request identity", () => {
  const valid = { id: "01234567-89ab-cdef-0123-456789abcdef", steamId: "76561198000000001", serverGuid: "01234567-89ab-cdef-0123-456789abcdef", reason: "Repeated disruption", durationMinutes: 60 };
  assert.doesNotThrow(() => validateWarningInput(valid));
  for (const durationMinutes of [0, -1, 1.5, 525601, NaN]) assert.throws(() => validateWarningInput({ ...valid, durationMinutes }));
  assert.throws(() => validateWarningInput({ ...valid, id: "same-form" }));
  assert.throws(() => validateWarningInput({ ...valid, reason: " " }));
});
