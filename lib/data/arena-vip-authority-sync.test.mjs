import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier === "@/lib/economy/vip-membership-conversion") {
      return { url: new URL("../economy/vip-membership-conversion.ts", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { synchronizeArenaVipAuthorityForPlayer } = await import("./arena-vip-authority-sync.ts");
const steamId = "76561198000000123";

// Exercise the actual transactional synchronization against a stateful SQL
// boundary, without a connection to the hosted game database.
function fixture({ provenance = "legacy_vip_users", history = false, native = true, status = "ended", suppressed = true } = {}) {
  const member = {
    membership_uuid: "old-membership", group_id: 1, scope_id: 1,
    starts_at: new Date("2020-01-01Z"), expires_at: null, status: "revoked",
    provenance_type: provenance, vip_family_key: "vip", rank_weight: 10,
  };
  const subscription = {
    scope_id: 1, vip_family_key: "vip", group_id: null, membership_uuid: null,
    status, starts_at: null, expires_at: null,
    legacy_suppressed_until: null, legacy_suppressed_permanently: suppressed ? 1 : 0, row_version: 1,
  };
  const writes = [];
  const connection = {
    async query(sql) {
      if (sql.includes("FROM vip_users")) return [native ? [{ account_id: "39734395", sid: 1, group_name: "Gold", expires: 0 }] : []];
      if (sql.includes("FROM arena_groups AS identity_group")) return [[{ group_id: 1, scope_id: 1, vip_server_id: 1, external_key: "Gold", vip_family_key: "vip" }]];
      if (sql.includes("FROM arena_group_memberships AS membership")) return [[{ ...member }]];
      if (sql.includes("FROM arena_vip_subscriptions")) return [[{ ...subscription }]];
      if (sql.includes("FROM arena_vip_subscription_history")) return [history ? [{ scope_id: 1 }] : []];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async execute(sql, values) {
      writes.push({ sql, values });
      if (sql.startsWith("INSERT INTO arena_group_memberships")) {
        member.expires_at = values[4];
        member.status = values[5];
      } else if (sql.startsWith("UPDATE arena_group_memberships SET status = 'superseded'")) {
        member.status = "superseded";
      } else if (sql.startsWith("UPDATE arena_group_memberships SET status = 'revoked'")) {
        member.status = "revoked";
      } else if (sql.startsWith("UPDATE arena_vip_subscriptions SET group_id = ?")) {
        Object.assign(subscription, {
          group_id: values[0], membership_uuid: values[1], status: "active",
          starts_at: values[2], expires_at: values[3], legacy_suppressed_until: values[4],
          legacy_suppressed_permanently: values[5], row_version: subscription.row_version + 1,
        });
      } else if (sql.startsWith("UPDATE arena_vip_subscriptions SET legacy_suppressed_until = NULL")) {
        Object.assign(subscription, { legacy_suppressed_until: null, legacy_suppressed_permanently: false, row_version: subscription.row_version + 1 });
      } else if (sql.startsWith("UPDATE arena_vip_subscriptions SET group_id = NULL")) {
        Object.assign(subscription, { status: "ended", legacy_suppressed_until: values[0], legacy_suppressed_permanently: values[1] });
      } else {
        throw new Error(`Unexpected write: ${sql}`);
      }
      return [{ affectedRows: 1 }];
    },
  };
  return { connection, member, subscription, writes };
}

test("native regrant after in-game removal revives an ended legacy mirror", async () => {
  const state = fixture();
  await synchronizeArenaVipAuthorityForPlayer(state.connection, steamId);
  assert.equal(state.member.status, "active");
  assert.equal(state.subscription.status, "active");
  assert.equal(state.subscription.membership_uuid, "old-membership");
});

test("legacy-only removal marker is cleared even before another grant", async () => {
  const state = fixture({ native: false });
  await synchronizeArenaVipAuthorityForPlayer(state.connection, steamId);
  assert.equal(state.subscription.status, "ended");
  assert.equal(Boolean(state.subscription.legacy_suppressed_permanently), false);
});

test("keeping native VIP after an inventory revocation cannot recreate its cleared block", async () => {
  const state = fixture({ provenance: "inventory", history: true, suppressed: false });
  await synchronizeArenaVipAuthorityForPlayer(state.connection, steamId);
  assert.equal(Boolean(state.subscription.legacy_suppressed_permanently), false);
  assert.equal(state.subscription.legacy_suppressed_until, null);
  assert.equal(state.member.status, "revoked");
});

for (const options of [{ provenance: "staff" }, { provenance: "inventory" }, { history: true }, { status: "conflict" }]) {
  test(`preserves deliberate or unresolved suppression ${JSON.stringify(options)}`, async () => {
    const state = fixture(options);
    await synchronizeArenaVipAuthorityForPlayer(state.connection, steamId);
    assert.equal(Boolean(state.subscription.legacy_suppressed_permanently), true);
    assert.notEqual(state.subscription.status, "active");
    assert.notEqual(state.member.status, "active");
  });
}
