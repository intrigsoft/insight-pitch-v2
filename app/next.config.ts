import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The Playwright server builds into its own folder so it can run next to `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Uploads (up to 20 MB) pass through the proxy on their way to /api/uploads.
  experimental: { proxyClientMaxBodySize: "25mb" },
};

export default nextConfig;
