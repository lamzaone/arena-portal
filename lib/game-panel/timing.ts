import type { PanelOperation } from "./contracts";

export type PanelTimingPhase =
  | "auth"
  | "membership_lookup"
  | "lock_wait"
  | "reconcile"
  | "inventory_sql"
  | "catalogue_sql"
  | "variant_cache"
  | "snapshot_quote"
  | "discount";

export type PanelTimingReporter = (phase: PanelTimingPhase, durationMs: number) => void;

export function recordPanelTiming(
  operation: PanelOperation,
  phase: PanelTimingPhase,
  durationMs: number,
) {
  console.info(JSON.stringify({
    event: "game_panel_timing",
    operation,
    phase,
    durationMs: Math.max(0, Math.round(durationMs * 10) / 10),
  }));
}
