import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The Playwright server builds into its own folder so it can run next to `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
