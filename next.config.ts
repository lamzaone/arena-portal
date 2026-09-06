import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.ARENA_STANDALONE === "true" ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  serverExternalPackages: ["playwright", "sharp", "@skinhub/cdn", "@skinhub/viewer"],
  outputFileTracingIncludes: {
    "/api/economy/thumbnails*": ["./node_modules/playwright/**", "./node_modules/playwright-core/**", "./node_modules/@skinhub/viewer/**", "./node_modules/@skinhub/cdn/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
        ]
      }
    ];
  }
};

export default nextConfig;
