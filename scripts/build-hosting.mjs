import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// Disable runtime background workers only in the build process. Next.js loads
// .env.production itself; an explicit process variable takes precedence.
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: "inherit",
  env: {
    ...process.env,
    ...(process.argv.includes("--standalone") ? { ARENA_STANDALONE: "true" } : {}),
    NODE_ENV: "production",
    ECONOMY_PRICE_REFRESH_ENABLED: "false",
    WEAPON_THUMBNAIL_PREWARM_ENABLED: "false",
  },
});

if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
