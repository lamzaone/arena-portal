export const CLOSED_APPEAL_STATUSES = ["closed-banned", "closed-unbanned", "closed"] as const;

export function isOpenAppeal(status: string) {
  return !CLOSED_APPEAL_STATUSES.some((closedStatus) => closedStatus === status);
}
