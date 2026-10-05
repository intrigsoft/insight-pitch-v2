import { expect, test, type Page } from "@playwright/test";
import { formError, login, openProposal, resetDb, TITLES } from "./helpers";

test.beforeAll(resetDb);
test.beforeEach(async ({ page }) => login(page));

const body = (page: Page) => page.getByRole("textbox", { name: "Proposal body" });
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Formatting" });

/** Saves through the save dialog and waits for the toast. */
async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  const dialog = page.getByRole("dialog", { name: "Save draft" });
  await expect(dialog.getByRole("textbox")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved", { timeout: 60_000 });
}

/** Selects the last occurrence of `word` in the editor. */
async function selectText(page: Page, word: string) {
  await body(page).evaluate((ed, w) => {
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let hit: Text | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes(w)) hit = n as Text;
    if (!hit) throw new Error("text not found: " + w);
    const i = hit.data.lastIndexOf(w);
    const r = document.createRange();
    r.setStart(hit, i);
    r.setEnd(hit, i + w.length);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
  }, word);
}

async function startProposal(page: Page, title: string, summary: string) {
  await page.goto("/proposals/new");
  await page.getByLabel("Proposal title").fill(title);
  await page.getByLabel("Summary").fill(summary);
  await body(page).click();
}

test("new proposal: validation, save draft with detected streams, then publish v1", async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByRole("link", { name: "New proposal" }).click();
  await expect(page).toHaveURL("/proposals/new");
  await expect(page.getByText("New · not saved yet")).toBeVisible();
  await expect(page.getByTestId("detected-streams")).toContainText("No streams detected yet.");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(formError(page)).toHaveText("Add a title before saving a draft.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(formError(page)).toHaveText("A title, summary and body are required to publish.");

  await page.getByLabel("Proposal title").fill("Protected cycle lanes on the river corridor");
  await page.getByLabel("Summary").fill("Build 6 km of protected cycle lanes along the river so people can commute safely by bike.");
  await body(page).click();
  // Markdown shortcuts: "## " makes a heading.
  await page.keyboard.type("## The problem");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The river road has the highest cycling injury rate in the city.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## Proposal");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Separate cycle lanes with kerbs, new crossings at four junctions on the main road, and secure bike parking at the two rail stations for commuters using public transit.");
  await expect(body(page).locator("h2")).toHaveCount(2);

  await page.getByRole("button", { name: "Save draft" }).click();
  const dialog = page.getByRole("dialog", { name: "Save draft" });
  await expect(dialog).toContainText("Not published yet");
  await expect(dialog).toContainText("This is the first version of the proposal.");
  await expect(dialog.getByRole("textbox")).toHaveValue("Initial version");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved", { timeout: 60_000 });
  await expect(page).toHaveURL(/\/proposals\/[0-9a-f-]+\/edit$/);
  await expect(page.getByText("Draft · not published")).toBeVisible();
  await expect(page.getByTestId("detected-streams")).toContainText("Transport");
  await expect(page.getByTestId("editor-history")).toContainText("Initial version");

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published v1", { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Protected cycle lanes on the river corridor" })).toBeVisible();
  await expect(page.locator(".prose h3")).toHaveText(["The problem", "Proposal"]);
  const scores = page.getByRole("region", { name: "Stream scores" });
  await expect(scores).toContainText("Detected automatically from the proposal");
  await expect(scores).toContainText("Transport");
});

test("formatting: bold, links, lists, quotes and tables", async ({ page }) => {
  test.setTimeout(120_000);
  await startProposal(page, "Night bus service for shift workers", "Run night buses on the three busiest routes for hospital and factory shift workers.");
  await page.keyboard.type("Shift workers have no public transport home after midnight.");
  // Select the last word and make it bold from the floating menu.
  for (let i = 0; i < "midnight.".length; i++) await page.keyboard.press("Shift+ArrowLeft");
  const bubble = page.locator(".ed-bubble");
  await expect(bubble).toBeVisible();
  await bubble.getByTitle("Bold").click();
  await expect(body(page).locator("b, strong")).toHaveText("midnight.");

  // Link: select text, Ctrl+K, type a URL.
  await page.keyboard.press("End");
  await page.keyboard.press("Control+b");
  await page.keyboard.type(" See the survey");
  await selectText(page, "survey");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Paste or type a link").fill("transport.example.gov/survey");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(body(page).locator("a")).toHaveAttribute("href", "https://transport.example.gov/survey");

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await toolbar(page).getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("Route 4 every 30 minutes");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Route 11 every 40 minutes");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(body(page).locator("ul li")).toHaveCount(2);

  await page.keyboard.type("> Buses after midnight would change my life.");
  await expect(body(page).locator("blockquote")).toBeVisible();
  await page.keyboard.press("Enter");
  await toolbar(page).getByLabel("Text style").selectOption("p");

  // Slash menu: type "/tab" and pick Table.
  await page.keyboard.type("/tab");
  const menu = page.getByRole("listbox", { name: "Insert" });
  await expect(menu.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(body(page).locator("table th")).toHaveCount(3);
  await expect(toolbar(page)).toContainText("+ Row");
  for (const cell of ["Route", "Start", "Cost", "4", "00:30", "1.2 million"]) {
    await page.keyboard.type(cell);
    await page.keyboard.press("Tab");
  }
  await toolbar(page).getByRole("button", { name: "Delete column" }).click();
  await expect(body(page).locator("table tr").first().locator("th")).toHaveCount(2);

  await saveDraft(page);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published v1", { timeout: 60_000 });
  const prose = page.locator(".prose");
  await expect(prose.locator("strong")).toHaveText("midnight.");
  await expect(prose.getByRole("link", { name: "survey" })).toHaveAttribute("href", "https://transport.example.gov/survey");
  await expect(prose.locator(".body-list li")).toHaveCount(2);
  await expect(prose.locator("blockquote")).toContainText("Buses after midnight");
  await expect(prose.locator(".body-table th")).toHaveCount(2);
});

test("media: images need alt text, videos must be YouTube or Vimeo, files download", async ({ page }) => {
  test.setTimeout(150_000);
  await startProposal(page, "Health centre waiting room upgrade", "Refurbish rural health centre waiting rooms with seating, shade and drinking water for patients.");
  await page.keyboard.type("Patients at rural health centres often wait outside in the sun. Clinics and nurses need better waiting areas.");
  await page.keyboard.press("Enter");

  // Image: insert from the toolbar and choose a file.
  const chooser = page.waitForEvent("filechooser");
  await toolbar(page).getByRole("button", { name: "Image" }).click();
  await (await chooser).setFiles("seed-assets/proposed-site.jpg");
  const image = body(page).locator("[data-type=image]");
  await expect(image.locator("img")).toBeVisible({ timeout: 30_000 });
  await image.getByLabel("Caption (optional)").fill("A typical waiting area today");

  // File: attach a PDF.
  await body(page).locator("p").last().click();
  const fileChooser = page.waitForEvent("filechooser");
  await toolbar(page).getByRole("button", { name: "File" }).click();
  await (await fileChooser).setFiles("seed-assets/site-survey-report.pdf");
  await expect(body(page).locator("[data-type=file]")).toContainText("site-survey-report.pdf", { timeout: 30_000 });

  // Video: only YouTube and Vimeo.
  await body(page).locator("p").last().click();
  await toolbar(page).getByRole("button", { name: "Video" }).click();
  const video = body(page).locator("[data-type=video]");
  await video.getByLabel("Paste a YouTube or Vimeo link").fill("https://example.com/clip.mp4");
  await expect(video).toContainText("Only YouTube and Vimeo links are supported.");

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(formError(page)).toHaveText("Add alt text to every image before publishing.");
  await image.getByLabel("Alt text: describe what the image shows").fill("Plastic chairs under a tin roof outside a small clinic");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(formError(page)).toHaveText("Video links must be from YouTube or Vimeo.", { timeout: 30_000 });
  await video.getByLabel("Paste a YouTube or Vimeo link").fill("https://vimeo.com/123456");
  await expect(video).toContainText("Linked from vimeo.com");
  await video.getByLabel("Title readers will see").fill("Tour of the clinic");

  await saveDraft(page);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published v1", { timeout: 60_000 });

  const prose = page.locator(".prose");
  const img = prose.locator(".body-img img");
  await expect(img).toHaveAttribute("alt", "Plastic chairs under a tin roof outside a small clinic");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(prose.locator("figcaption")).toHaveText("A typical waiting area today");
  await expect(prose.locator(".body-video")).toHaveAttribute("href", "https://vimeo.com/123456");
  await expect(prose.locator(".body-file")).toContainText("added in v1");

  const download = page.waitForEvent("download");
  await prose.locator(".body-file").click();
  expect((await download).suggestedFilename()).toBe("site-survey-report.pdf");

  // Text only hides images until one is tapped, and is remembered.
  await page.getByRole("button", { name: "Text only" }).click();
  await expect(prose.locator(".body-img img")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Text only" })).toHaveAttribute("aria-pressed", "true");
  const hidden = prose.locator(".body-img-hidden");
  await expect(hidden).toContainText("Plastic chairs under a tin roof");
  await hidden.click();
  await expect(prose.locator(".body-img img")).toBeVisible();
  await page.getByRole("button", { name: "Text only" }).click();
});

test("uploads reject files that aren't images or documents", async ({ page }) => {
  const res = await page.request.post("/api/uploads", { multipart: { kind: "file", file: { name: "run.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } } });
  expect(res.status()).toBe(415);
  const fake = await page.request.post("/api/uploads", { multipart: { kind: "image", file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("<html>") } } });
  expect(fake.status()).toBe(415);
});

test("a new version: the save dialog lists changes and describes them", async ({ page }) => {
  test.setTimeout(120_000);
  await openProposal(page, TITLES.legal);
  await page.getByRole("link", { name: "Continue draft" }).click();
  await expect(page.getByText("Editing v2 draft", { exact: true })).toBeVisible();
  await expect(page.getByText("Published v1 · draft of v2 in progress")).toBeVisible();

  await page.getByRole("button", { name: "Save draft" }).click();
  const dialog = page.getByRole("dialog", { name: "Save draft" });
  await expect(dialog).toContainText("Changes since v1");
  await expect(dialog).toContainText("New section: Funding");
  await expect(dialog).toContainText("Table added");
  await expect(dialog).toContainText("Attachment added");
  const description = dialog.getByRole("textbox");
  await expect(description).not.toHaveValue("", { timeout: 30_000 });
  await description.fill("Added funding, success measures and the bar association's support");
  await expect(dialog).toContainText("You can change this again before publishing.");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved", { timeout: 60_000 });
  await expect(page.getByTestId("editor-history")).toContainText("Added funding, success measures");

  await page.getByRole("button", { name: "Publish v2" }).click();
  await expect(page.getByRole("status")).toContainText("Published v2", { timeout: 60_000 });
  const history = page.getByRole("navigation", { name: "Version history" });
  await expect(history.getByRole("link")).toHaveCount(2);
  await expect(history.getByRole("link").first()).toContainText("Added funding, success measures");
  await expect(history.getByRole("link").first()).toContainText("New section: Funding");
  await expect(page.locator(".prose .body-file")).toContainText("added in v2");
});

test("publishing an unchanged version is refused", async ({ page }) => {
  await page.context().clearCookies();
  await login(page, "priya");
  await openProposal(page, TITLES.hospital);
  await page.getByRole("link", { name: "Edit as new version" }).click();
  await page.getByRole("button", { name: "Publish v4" }).click();
  await expect(formError(page)).toHaveText("Nothing has changed since v3.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("dialog", { name: "Save draft" })).toContainText("Nothing has changed since v3.");
});

test("cancel and back links return without saving", async ({ page }) => {
  await page.goto("/proposals/new");
  await page.getByLabel("Proposal title").fill("Throwaway idea");
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator(".rows .row").filter({ hasText: "Throwaway idea" })).toHaveCount(0);
  await openProposal(page, TITLES.telemedicine);
  await page.getByRole("link", { name: "Continue draft" }).click();
  await expect(page.getByText("Editing draft", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to proposal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: TITLES.telemedicine })).toBeVisible();
});
