import { execSync } from "node:child_process";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://insight:insight@localhost:54329/insight_pitch_test";

export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execSync("npx tsx scripts/migrate.mts", { env, stdio: "inherit" });
  execSync("npx tsx scripts/seed.mts", { env, stdio: "inherit" });
}
