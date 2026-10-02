import { execSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://insight:insight@localhost:54329/insight_pitch_test";

export const USERS = {
  maya: { email: "maya.chen@insight.gov", name: "Maya Chen", initials: "MC" },
  priya: { email: "priya.raman@insight.gov", name: "Priya Raman", initials: "PR" },
  lena: { email: "lena.fischer@example.org", name: "Lena Fischer", initials: "LF" },
} as const;
export const PASSWORD = "insight2026";

export const TITLES = {
  hospital: "Build a 200-bed district hospital in the northern region",
  procurement: "Publish all public procurement contracts online within 30 days",
  meals: "Free school meals sourced from local farms",
  legal: "Free legal aid clinics at every district court",
  telemedicine: "Telemedicine kiosks for rural health centres",
  bus: "Electric bus pilot on two city routes",
};

/** Restores the test database to the design's seed data. */
export function resetDb() {
  execSync("npx tsx scripts/seed.mts", { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "pipe" });
}

export async function login(page: Page, who: keyof typeof USERS = "maya") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS[who].email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
}

export async function openProposal(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("link", { name: new RegExp(escapeRe(title)) }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Form errors on the page; skips Next.js's hidden route announcer, which also uses role="alert". */
export const formError = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
