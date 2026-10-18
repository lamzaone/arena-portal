export const CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type CasePriority = typeof CASE_PRIORITIES[number];

export function parseCasePriority(value: unknown): CasePriority | null {
  return typeof value === "string" && CASE_PRIORITIES.some((priority) => priority === value) ? value as CasePriority : null;
}
