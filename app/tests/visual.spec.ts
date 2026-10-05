// Compares each screen with the screenshots rendered from the Claude Design file (tests/visual/design).
// Writes the app screenshot and a diff image to tests/visual/actual and fails if too many pixels differ.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { login, openProposal, resetDb, TITLES } from "./helpers";

const DESIGN = path.join(__dirname, "visual/design");
const OUT = path.join(__dirname, "visual/actual");
const HEIGHT = 900;
// Share of pixels allowed to differ. Live data (relative dates, seeded times) and font
// anti-aliasing account for a few percent; layout regressions push far past these limits.
const LIMIT = { desktop: 0.06, mobile: 0.1 };

function crop(png: PNG, width: number, height: number) {
  const out = new PNG({ width, height });
  PNG.bitblt(png, out, 0, 0, Math.min(width, png.width), Math.min(height, png.height), 0, 0);
  return out;
}

async function compare(page: Page, screen: string, device: "desktop" | "mobile") {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const width = page.viewportSize()!.width;
  const actual = crop(PNG.sync.read(await page.screenshot()), width, HEIGHT);
  const design = crop(PNG.sync.read(fs.readFileSync(path.join(DESIGN, `${screen}-${device}.png`))), width, HEIGHT);
  const diff = new PNG({ width, height: HEIGHT });
  const { default: pixelmatch } = await import("pixelmatch"); // ESM-only package
  const changed = pixelmatch(design.data, actual.data, diff.data, width, HEIGHT, { threshold: 0.2 });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${screen}-${device}.png`), PNG.sync.write(actual));
  fs.writeFileSync(path.join(OUT, `${screen}-${device}.diff.png`), PNG.sync.write(diff));
  const ratio = changed / (width * HEIGHT);
  test.info().annotations.push({ type: "pixel diff", description: `${screen}-${device}: ${(ratio * 100).toFixed(2)}%` });
  console.log(`${screen}-${device}: ${(ratio * 100).toFixed(2)}% of pixels differ`);
  expect(ratio, `${screen} (${device}) differs from the design`).toBeLessThan(LIMIT[device]);
  // No screen may scroll sideways; wide tables scroll inside their own container.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${screen} (${device}) scrolls horizontally`).toBeLessThanOrEqual(0);
}

for (const device of ["desktop", "mobile"] as const) {
  test.describe(`${device} matches the design`, () => {
    test.use({ viewport: { width: device === "desktop" ? 1280 : 390, height: HEIGHT } });
    test.beforeAll(resetDb);

    test("login", async ({ page }) => {
      await page.goto("/login");
      // The design shows the form pre-filled with Maya's demo account.
      await page.getByLabel("Email").fill("maya.chen@insight.gov");
      await page.getByLabel("Password").fill("insight2026");
      await page.getByLabel("Password").blur();
      await compare(page, "login", device);
    });

    test("proposals list", async ({ page }) => {
      await login(page);
      await compare(page, "list", device);
    });

    test("proposal view", async ({ page }) => {
      await login(page);
      await openProposal(page, TITLES.hospital);
      await compare(page, "view", device);
    });

    test("editor", async ({ page }) => {
      await login(page);
      await openProposal(page, TITLES.legal);
      await page.getByRole("link", { name: "Continue draft" }).click();
      await expect(page.getByText("Editing v2 draft", { exact: true })).toBeVisible();
      await compare(page, "edit", device);
    });

    test("admin settings", async ({ page }) => {
      await login(page);
      await page.goto("/settings");
      await compare(page, "settings", device);
    });

    test("profile", async ({ page }) => {
      await login(page);
      await openProposal(page, TITLES.hospital);
      await page.locator(".byline").getByRole("link", { name: "Priya Raman" }).click();
      await expect(page.getByRole("heading", { name: "Priya Raman", level: 1 })).toBeVisible();
      await compare(page, "profile", device);
    });
  });
}
