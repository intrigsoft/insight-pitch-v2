// Renders each screen of the Claude Design file and saves reference screenshots to tests/visual/design/.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const designDir = path.resolve("../design");
const src = fs.readFileSync(path.join(designDir, "Insight Pitch v8.dc.html"), "utf8");
const outDir = path.resolve("tests/visual/design");
const tmpDir = path.resolve(".design-tmp");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });
for (const f of ["support.js", "image-slot.js"]) fs.copyFileSync(path.join(designDir, f), path.join(tmpDir, f));

const screens = ["login", "list", "view", "edit", "settings", "profile"];
const browser = await chromium.launch();
for (const screen of screens) {
  // The start screen is a prop default stored in the data-props attribute.
  const html = src.replace("&quot;default&quot;:&quot;login&quot;", `&quot;default&quot;:&quot;${screen}&quot;`);
  const file = path.join(tmpDir, `${screen}.html`);
  fs.writeFileSync(file, html);
  for (const [label, width] of [["desktop", 1280], ["mobile", 390]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto("file://" + file);
    await page.waitForFunction(() => document.querySelector("[data-screen-label]") !== null, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, `${screen}-${label}.png`), fullPage: true });
    await page.close();
  }
  console.log("saved", screen);
}
await browser.close();
