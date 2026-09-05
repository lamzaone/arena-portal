const movableInventoryStates = new Set([
  "available",
  "escrowed",
  "attached",
  "activation_pending",
]);

function subscriptionKey(subscription) {
  return `${subscription.steamId}\0${subscription.family}`;
}

function permanent(subscription) {
  return subscription.expiresAt === null && subscription.membershipExpiresAt === null;
}

function normalizedUuid(value) {
  return typeof value === "string" ? value.toLowerCase() : null;
}

function timestamp(value) {
  if (typeof value !== "string") return Number.NaN;
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return Date.parse(normalized);
}

function currentlyEffective(subscription, currentTime) {
  const now = timestamp(currentTime);
  const startsAt = timestamp(subscription.startsAt);
  const membershipStartsAt = timestamp(subscription.membershipStartsAt);
  const expiresAt = subscription.expiresAt === null ? null : timestamp(subscription.expiresAt);
  const membershipExpiresAt = subscription.membershipExpiresAt === null
    ? null
    : timestamp(subscription.membershipExpiresAt);
  return subscription.status === "active" &&
    subscription.membershipStatus === "active" &&
    Number.isFinite(now) &&
    Number.isFinite(startsAt) && startsAt <= now &&
    Number.isFinite(membershipStartsAt) && membershipStartsAt <= now &&
    (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > now)) &&
    (membershipExpiresAt === null || (Number.isFinite(membershipExpiresAt) && membershipExpiresAt > now));
}

export function buildVipScopeConsolidationPlan(input) {
  const blockers = [];
  if (input.fromScope.serverId === input.toScope.serverId) {
    blockers.push("The source and destination VIP server scopes are identical.");
  }
  if (input.fromScope.serverId !== 0 || input.fromScope.scopeType !== "global") {
    blockers.push("The source VIP scope must be the global server-0 scope.");
  }
  if (input.toScope.scopeType !== "server") {
    blockers.push("The destination VIP scope is not a single-server scope.");
  }
  if (input.pendingActivationJobs > 0) {
    blockers.push(
      `${input.pendingActivationJobs} membership activation job${input.pendingActivationJobs === 1 ? " is" : "s are"} still in flight.`,
    );
  }

  const targetGroupIds = new Set(input.targetGroupIds);
  const targetByKey = new Map(
    input.targetSubscriptions.map((subscription) => [
      subscriptionKey(subscription),
      subscription,
    ]),
  );
  const subscriptionMoves = [];
  const collisionResolutions = [];
  const redundantSourceSubscriptions = [];

  for (const source of input.sourceSubscriptions) {
    const target = targetByKey.get(subscriptionKey(source));
    if (source.status !== "active") {
      if (target) {
        redundantSourceSubscriptions.push({
          steamId: source.steamId,
          family: source.family,
        });
      } else {
        blockers.push(
          `Ended source subscription ${source.steamId}/${source.family} has no destination state to preserve.`,
        );
      }
      continue;
    }
    if (!source.membershipUuid || !source.groupId || !targetGroupIds.has(source.groupId)) {
      blockers.push(
        `Active source subscription ${source.steamId}/${source.family} has no enabled matching destination tier.`,
      );
      continue;
    }
    if (!currentlyEffective(source, input.currentTime)) {
      blockers.push(
        `Active source subscription ${source.steamId}/${source.family} does not reference a currently effective membership.`,
      );
      continue;
    }
    if (!target) {
      subscriptionMoves.push(source);
      continue;
    }
    if (
      target.status === "active" &&
      target.membershipUuid &&
      target.groupId &&
      targetGroupIds.has(target.groupId) &&
      currentlyEffective(target, input.currentTime) &&
      permanent(target) &&
      Number(target.rankWeight) >= Number(source.rankWeight)
    ) {
      collisionResolutions.push({
        steamId: source.steamId,
        family: source.family,
        action: "supersede-source-keep-target",
        sourceMembershipUuid: source.membershipUuid,
        targetMembershipUuid: target.membershipUuid,
      });
      continue;
    }
    blockers.push(
      `Collision ${source.steamId}/${source.family} cannot safely keep the destination membership without losing rank or duration.`,
    );
  }


  const sourceScopeUuid = input.fromScope.scopeUuid.toLowerCase();
  const targetScopeUuid = input.toScope.scopeUuid.toLowerCase();
  const listingIds = [];
  for (const listing of input.listings) {
    const scopeUuid = normalizedUuid(listing.scopeUuid);
    const targetScopeUuid = normalizedUuid(listing.targetScopeUuid);
    const snapshotScopeUuid = normalizedUuid(listing.targetSnapshot?.arenaScopeUuid);
    const metadataScopeUuid = normalizedUuid(listing.catalogueMetadata?.membershipScopeUuid);
    const metadataServerId = Number(listing.catalogueMetadata?.membershipVipServerId);
    if (scopeUuid === sourceScopeUuid) listingIds.push(listing.listingId);
    else if (scopeUuid !== targetScopeUuid) {
      blockers.push(`VIP listing ${listing.listingId} has an unexpected foreign or missing scope.`);
    }
    if (listing.targetGroupType !== undefined && listing.targetGroupType !== "vip") {
      blockers.push(`VIP listing ${listing.listingId} has a missing or non-VIP catalogue target.`);
    }
    if ("targetScopeUuid" in listing && targetScopeUuid !== scopeUuid) {
      blockers.push(`VIP listing ${listing.listingId} and its catalogue target disagree on scope.`);
    }
    for (const [label, projectedScope, supplied] of [
      ["target snapshot", snapshotScopeUuid, "targetSnapshot" in listing],
      ["catalogue metadata", metadataScopeUuid, "catalogueMetadata" in listing],
    ]) {
      if (!supplied) continue;
      if (projectedScope !== null && projectedScope !== sourceScopeUuid && projectedScope !== targetScopeUuid) {
        blockers.push(`VIP listing ${listing.listingId} has a foreign ${label} scope.`);
      } else if (scopeUuid === targetScopeUuid && projectedScope !== targetScopeUuid) {
        blockers.push(`VIP listing ${listing.listingId} has stale or missing ${label} scope data.`);
      }
    }
    if (scopeUuid === targetScopeUuid && metadataServerId !== input.toScope.serverId) {
      blockers.push(`VIP listing ${listing.listingId} has stale or missing catalogue server data.`);
    }
  }

  const inventoryItemIds = [];
  for (const item of input.inventoryItems) {
    if (!movableInventoryStates.has(item.state)) continue;
    const scopeUuid = normalizedUuid(item.scopeUuid);
    if ("listingId" in item && item.listingId === null) {
      blockers.push(`VIP inventory item ${item.itemId} has no managed VIP listing.`);
    }
    if (scopeUuid === null || scopeUuid === sourceScopeUuid) inventoryItemIds.push(item.itemId);
    else if (scopeUuid !== targetScopeUuid) {
      blockers.push(`VIP inventory item ${item.itemId} has an unexpected foreign scope.`);
    }
    if (scopeUuid === targetScopeUuid && Number(item.attributes?.membershipVipServerId) !== input.toScope.serverId) {
      blockers.push(`VIP inventory item ${item.itemId} has stale or missing server data.`);
    }
  }

  return {
    blockers,
    subscriptionMoves,
    collisionResolutions,
    redundantSourceSubscriptions,
    listingIds,
    inventoryItemIds,
  };
}
