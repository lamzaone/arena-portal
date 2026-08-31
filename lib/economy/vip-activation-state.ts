export const VIP_ACTIVATION_TERMINAL_STATES = [
  "completed",
  "rejected",
  "manual_review",
] as const;

export type VipActivationJobState =
  | "prepared"
  | "dispatching"
  | "retry_wait"
  | "arena_applied"
  | "finalizing"
  | (typeof VIP_ACTIVATION_TERMINAL_STATES)[number];

export type VipActivationResumeAction =
  | "dispatch"
  | "finalize"
  | "return-result"
  | "return-rejection"
  | "manual-review"
  | "wait";

export function isVipActivationTerminalState(
  state: VipActivationJobState,
) {
  return (VIP_ACTIVATION_TERMINAL_STATES as readonly string[]).includes(state);
}

/**
 * An ended subscription may intentionally retain a legacy-suppression
 * tombstone after staff revoke access. That tombstone prevents an old
 * VIPCore row from resurfacing, but it must not stop the player from starting
 * a new Arena-owned subscription with another inventory item.
 *
 * Suppression is suspicious only when a row still claims to be active while
 * its referenced membership is no longer effective. Conflict rows are
 * rejected separately before this check.
 */
export function vipSuppressionRequiresReconciliation(input: {
  subscriptionStatus: "active" | "ended" | "conflict";
  subscriptionActive: boolean;
  suppressionActive: boolean;
}) {
  return input.subscriptionStatus === "active" &&
    !input.subscriptionActive &&
    input.suppressionActive;
}

/**
 * Keeps recovery decisions explicit. In particular, an ambiguous dispatch
 * never releases an inventory item: it remains pending and is dispatched
 * again with the same arena command UUID.
 */
export function vipActivationResumeAction(input: {
  state: VipActivationJobState;
  leaseIsFresh?: boolean;
}): VipActivationResumeAction {
  switch (input.state) {
    case "completed":
      return "return-result";
    case "rejected":
      return "return-rejection";
    case "manual_review":
      return "manual-review";
    case "arena_applied":
    case "finalizing":
      return input.state === "finalizing" && input.leaseIsFresh
        ? "wait"
        : "finalize";
    case "dispatching":
      return input.leaseIsFresh ? "wait" : "dispatch";
    case "prepared":
    case "retry_wait":
      return "dispatch";
  }
}

/** JSON with deterministic object-key ordering for durable request hashes. */
export function canonicalVipActivationJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      return entry;
    }
    throw new TypeError("VIP activation hashes only support JSON values.");
  };

  return JSON.stringify(normalize(value));
}
