import "server-only";

import { pruneCompletedEconomyOperationReceipts } from "@/lib/data/portal-repository";
import { refreshAllEconomyPublicPrices } from "@/lib/economy/price-refresh";

const schedulerKey = "__tappedEconomyPriceRefreshTimer";
const defaultIntervalMinutes = 60;
const minimumIntervalMinutes = 15;
const maximumIntervalMinutes = 24 * 60;

type SchedulerGlobal = typeof globalThis & {
  [schedulerKey]?: ReturnType<typeof setInterval>;
};

function intervalMilliseconds() {
  const configured = Number(process.env.ECONOMY_PRICE_REFRESH_INTERVAL_MINUTES);
  const minutes = Number.isFinite(configured)
    ? Math.min(
        maximumIntervalMinutes,
        Math.max(minimumIntervalMinutes, Math.floor(configured)),
      )
    : defaultIntervalMinutes;
  return minutes * 60 * 1_000;
}

async function runScheduledRefresh() {
  try {
    const result = await refreshAllEconomyPublicPrices();
    await pruneCompletedEconomyOperationReceipts();
    if (result.status === "unavailable") {
      console.warn(
        "TAPPED economy price refresh skipped: PORTAL_DATABASE_URL is not configured.",
      );
    }
  } catch (error) {
    console.error("TAPPED economy price refresh failed.", error);
  }
}

/** Starts one non-blocking worker per Node.js process. MySQL locks coordinate replicas. */
export function startEconomyPublicPriceRefreshScheduler() {
  if (process.env.ECONOMY_PRICE_REFRESH_ENABLED === "false") return;
  const scheduler = globalThis as SchedulerGlobal;
  if (scheduler[schedulerKey]) return;

  // Delay the initial download until the server is accepting requests. The
  // interval is unref'd so it never prevents a graceful process shutdown.
  const initial = setTimeout(() => void runScheduledRefresh(), 10_000);
  initial.unref?.();
  const timer = setInterval(() => void runScheduledRefresh(), intervalMilliseconds());
  timer.unref?.();
  scheduler[schedulerKey] = timer;
}
