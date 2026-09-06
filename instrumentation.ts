export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startEconomyPublicPriceRefreshScheduler } = await import(
    "./lib/economy/price-refresh-scheduler"
  );
  startEconomyPublicPriceRefreshScheduler();
  const { startOwnedThumbnailPrewarming } = await import("./lib/economy/thumbnail-prewarm-scheduler");
  startOwnedThumbnailPrewarming();
}
