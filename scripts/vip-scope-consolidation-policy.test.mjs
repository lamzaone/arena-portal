import assert from "node:assert/strict";
import test from "node:test";

import { buildVipScopeConsolidationPlan } from "./vip-scope-consolidation-policy.mjs";

const globalScope = {
  id: 1,
  scopeUuid: "00000000-0000-0000-0000-000000000001",
  serverId: 0,
  scopeType: "global",
};

const arenaScope = {
  id: 4,
  scopeUuid: "11111111-1111-1111-1111-111111111111",
  serverId: 1,
  scopeType: "server",
};

const currentTime = "2026-09-05T20:00:00.000Z";

function activeMembership(overrides = {}) {
  return {
    startsAt: "2026-01-01T00:00:00.000Z",
    membershipStatus: "active",
    membershipStartsAt: "2026-01-01T00:00:00.000Z",
    membershipExpiresAt: null,
    ...overrides,
  };
}

test("plans the observed global-to-arena move without downgrading a permanent server membership", () => {
  const plan = buildVipScopeConsolidationPlan({
    currentTime,
    fromScope: globalScope,
    toScope: arenaScope,
    targetGroupIds: [8, 9, 10, 11, 12],
    sourceSubscriptions: [
      activeMembership({
        steamId: "76561190000000001",
        family: "vipcore",
        status: "active",
        membershipUuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        groupId: 8,
        tier: "DIAMOND",
        rankWeight: 80,
        expiresAt: "2027-02-05T20:54:13.964Z",
      }),
      activeMembership({
        steamId: "76561190000000002",
        family: "vipcore",
        status: "active",
        membershipUuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        groupId: 9,
        tier: "GOLD",
        rankWeight: 60,
        expiresAt: "2027-01-01T00:00:00.000Z",
      }),
      activeMembership({
        steamId: "76561190000000003",
        family: "vipcore",
        status: "ended",
        membershipUuid: null,
        groupId: null,
        tier: null,
        rankWeight: null,
        expiresAt: null,
      }),
    ],
    targetSubscriptions: [
      activeMembership({
        steamId: "76561190000000001",
        family: "vipcore",
        status: "active",
        membershipUuid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        groupId: 12,
        tier: "ULTIMATE",
        rankWeight: 100,
        expiresAt: null,
      }),
      {
        steamId: "76561190000000003",
        family: "vipcore",
        status: "ended",
        membershipUuid: null,
        groupId: null,
        tier: null,
        rankWeight: null,
        expiresAt: null,
      },
    ],
    listings: [
      { listingId: 1, scopeUuid: globalScope.scopeUuid },
      { listingId: 2, scopeUuid: globalScope.scopeUuid },
    ],
    inventoryItems: [
      {
        itemId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        itemType: "vip_membership",
        state: "available",
        scopeUuid: null,
        attributes: {},
      },
      { itemId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", state: "consumed", scopeUuid: null },
    ],
    pendingActivationJobs: 0,
  });

  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(
    plan.subscriptionMoves.map((entry) => entry.steamId),
    ["76561190000000002"],
  );
  assert.deepEqual(plan.collisionResolutions, [
    {
      steamId: "76561190000000001",
      family: "vipcore",
      action: "supersede-source-keep-target",
      sourceMembershipUuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      targetMembershipUuid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    },
  ]);
  assert.deepEqual(plan.redundantSourceSubscriptions, [
    { steamId: "76561190000000003", family: "vipcore" },
  ]);
  assert.deepEqual(plan.listingIds, [1, 2]);
  assert.deepEqual(plan.inventoryItemIds, ["dddddddd-dddd-dddd-dddd-dddddddddddd"]);
});

test("blocks a collision that cannot be resolved without choosing between live entitlements", () => {
  const plan = buildVipScopeConsolidationPlan({
    currentTime,
    fromScope: globalScope,
    toScope: arenaScope,
    targetGroupIds: [8, 12],
    sourceSubscriptions: [activeMembership({
      steamId: "76561190000000001",
      family: "vipcore",
      status: "active",
      membershipUuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      groupId: 12,
      tier: "ULTIMATE",
      rankWeight: 100,
      expiresAt: null,
    })],
    targetSubscriptions: [activeMembership({
      steamId: "76561190000000001",
      family: "vipcore",
      status: "active",
      membershipUuid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      groupId: 8,
      tier: "DIAMOND",
      rankWeight: 80,
      expiresAt: "2027-02-05T20:54:13.964Z",
    })],
    listings: [],
    inventoryItems: [],
    pendingActivationJobs: 0,
  });

  assert.equal(plan.collisionResolutions.length, 0);
  assert.match(plan.blockers[0], /cannot safely keep the destination/i);
});

test("blocks the plan while an activation job can still write the old scope", () => {
  const plan = buildVipScopeConsolidationPlan({
    currentTime,
    fromScope: globalScope,
    toScope: arenaScope,
    targetGroupIds: [8],
    sourceSubscriptions: [],
    targetSubscriptions: [],
    listings: [],
    inventoryItems: [],
    pendingActivationJobs: 1,
  });

  assert.deepEqual(plan.blockers, [
    "1 membership activation job is still in flight.",
  ]);
});

test("blocks a collision when the retained destination membership is not currently effective", () => {
  for (const invalidMembership of [
    { membershipStatus: "revoked" },
    { membershipStartsAt: "2026-10-01T00:00:00.000Z" },
    { membershipExpiresAt: "2026-09-01T00:00:00.000Z" },
  ]) {
    const plan = buildVipScopeConsolidationPlan({
      currentTime,
      fromScope: globalScope,
      toScope: arenaScope,
      targetGroupIds: [8, 12],
      sourceSubscriptions: [activeMembership({
        steamId: "76561190000000001",
        family: "vipcore",
        status: "active",
        membershipUuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        groupId: 8,
        rankWeight: 80,
        startsAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
      })],
      targetSubscriptions: [activeMembership({
        steamId: "76561190000000001",
        family: "vipcore",
        status: "active",
        membershipUuid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        groupId: 12,
        rankWeight: 100,
        startsAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
        ...invalidMembership,
      })],
      listings: [],
      inventoryItems: [],
      pendingActivationJobs: 0,
    });

    assert.equal(plan.collisionResolutions.length, 0);
    assert.match(plan.blockers.at(-1), /cannot safely keep the destination/i);
  }
});

test("blocks non-global sources and foreign VIP projections", () => {
  const plan = buildVipScopeConsolidationPlan({
    currentTime,
    fromScope: { ...globalScope, serverId: 2, scopeType: "server" },
    toScope: arenaScope,
    targetGroupIds: [],
    sourceSubscriptions: [],
    targetSubscriptions: [],
    listings: [{ listingId: 7, scopeUuid: "22222222-2222-2222-2222-222222222222" }],
    inventoryItems: [{
      itemId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      state: "available",
      scopeUuid: "22222222-2222-2222-2222-222222222222",
    }],
    pendingActivationJobs: 0,
  });

  assert.match(plan.blockers.join(" "), /source VIP scope must be the global server-0 scope/i);
  assert.match(plan.blockers.join(" "), /listing 7/i);
  assert.match(plan.blockers.join(" "), /inventory item dddddddd/i);
});

test("blocks a global VIP listing whose trusted catalogue target is orphaned", () => {
  const plan = buildVipScopeConsolidationPlan({
    currentTime,
    fromScope: globalScope,
    toScope: arenaScope,
    targetGroupIds: [],
    sourceSubscriptions: [],
    targetSubscriptions: [],
    listings: [{
      listingId: 9,
      scopeUuid: globalScope.scopeUuid,
      targetScopeUuid: null,
      targetGroupType: null,
      targetSnapshot: null,
      catalogueMetadata: {},
    }],
    inventoryItems: [],
    pendingActivationJobs: 0,
  });

  assert.match(plan.blockers.join(" "), /missing or non-VIP catalogue target/i);
  assert.match(plan.blockers.join(" "), /catalogue target disagree on scope/i);
});
