import type { LaunchOptions } from "playwright";

type ThumbnailEnvironment = {
  [key: string]: string | undefined;
  WEAPON_THUMBNAIL_GPU?: string;
  WEAPON_THUMBNAIL_BROWSER_PATH?: string;
};

export function thumbnailBrowserOptions(
  environment: ThumbnailEnvironment = process.env,
  platform: NodeJS.Platform = process.platform,
): LaunchOptions {
  // Playwright's default headless shell uses software WebGL on Windows.
  // Full Chromium's new headless mode can use the installed GPU and drivers.
  // Linux hosting packages only the shell, so GPU use there stays opt-in.
  const gpu = environment.WEAPON_THUMBNAIL_GPU === "true"
    || (environment.WEAPON_THUMBNAIL_GPU !== "false" && platform === "win32");
  const executablePath = environment.WEAPON_THUMBNAIL_BROWSER_PATH || undefined;
  return {
    headless: true,
    executablePath,
    channel: gpu && !executablePath ? "chromium" : undefined,
    args: ["--enable-unsafe-swiftshader", ...(gpu ? ["--enable-gpu"] : [])],
    timeout: 30000,
  };
}

export function thumbnailPersistentBrowserOptions(
  environment: ThumbnailEnvironment = process.env,
  platform: NodeJS.Platform = process.platform,
): LaunchOptions {
  const options = thumbnailBrowserOptions(environment, platform);
  // Windows' blockfile backend can discard an oversized cache at startup
  // before its delayed eviction runs. Simple safely evicts individual assets.
  // Our feature flag must retain Playwright's own screenshot default.
  const features = [
    ...(!environment.PLAYWRIGHT_LEGACY_SCREENSHOT ? ["CDPScreenshotNewSurface"] : []),
    "DiskCacheBackendExperiment:backend/simple",
  ];
  return { ...options, args: [...(options.args ?? []), "--disk-cache-size=1073741824", `--enable-features=${features.join(",")}`] };
}
