import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://insight:insight@localhost:54329/insight_pitch_test";

// Tests share one database, so they run one at a time and each spec reseeds it first.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { DATABASE_URL: TEST_DATABASE_URL, NEXT_DIST_DIR: ".next-test" },
  },
});
