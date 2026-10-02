// Usage: tsx scripts/shot.mts <path> <name> [width] [--anon]
// Signs in as Maya (unless --anon), opens the page and saves tests/visual/actual/<name>.png.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const [path = "/", name = "shot", width = "1280"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const anon = process.argv.includes("--anon");
const base = process.env.BASE_URL || "http://localhost:3100";
fs.mkdirSync("tests/visual/actual", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
const errors: string[] = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));
if (!anon) {
  await page.goto(base + "/login");
  await page.getByLabel("Email").fill("maya.chen@insight.gov");
  await page.getByLabel("Password").fill("insight2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(base + "/");
}
await page.goto(base + path);
await page.waitForLoadState("networkidle");
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `tests/visual/actual/${name}.png`, fullPage: true });
console.log("saved", name, errors.length ? "ERRORS: " + errors.join(" | ") : "no console errors");
await browser.close();
