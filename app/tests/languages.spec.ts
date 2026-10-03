import { expect, test, type Page } from "@playwright/test";
import { login, openProposal, resetDb, TITLES } from "./helpers";

test.beforeEach(() => resetDb());

const openLangMenu = (page: Page) => page.locator(".lang-btn").click();
const pickLanguage = async (page: Page, name: RegExp, code?: string) => {
  await openLangMenu(page);
  await page.getByRole("menuitemradio", { name }).click();
  if (code) await expect(page.locator("html")).toHaveAttribute("lang", code, { timeout: 15_000 });
};

test("the interface switches to Sinhala and Tamil and back, and the choice is remembered", async ({ page, context }) => {
  await login(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await openLangMenu(page);
  await expect(page.getByRole("menu")).toContainText("Read in");
  await expect(page.getByRole("menuitemradio")).toHaveCount(3);
  await page.getByRole("menuitemradio", { name: /සිංහල/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "si");
  await expect(page.locator(".lang-btn")).toContainText("SI");
  await expect(page.getByRole("link", { name: "නව යෝජනාව" })).toBeVisible();

  // Saved to the account: a fresh session after signing in again is still in Sinhala.
  await context.clearCookies();
  await login(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "si");
  await page.waitForLoadState("networkidle");

  await pickLanguage(page, /தமிழ்/, "ta");
  await expect(page.locator("html")).toHaveAttribute("lang", "ta");
  await expect(page.getByRole("link", { name: "புதிய முன்மொழிவு" })).toBeVisible();
  await pickLanguage(page, /English/);
  await expect(page.getByRole("link", { name: "New proposal" })).toBeVisible();
});

test("visitors can switch language on the sign-in screen", async ({ page }) => {
  await page.goto("/login");
  await pickLanguage(page, /தமிழ்/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ta");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("உள்நுழைக");
  // Errors come back in the visitor's language too.
  await page.locator("button[type=submit]").click();
  await expect(page.locator(".error-text")).not.toHaveText("Enter a valid email address.");
});

test("admins manage languages, the default language and the never-translate list", async ({ page }) => {
  await login(page);
  await page.goto("/settings?tab=languages");
  await expect(page.getByText("3 languages · 3 enabled")).toBeVisible();
  await expect(page.getByTestId("lang-en")).toContainText("Default");
  await expect(page.getByTestId("lang-en").getByRole("switch")).toHaveCount(0);

  await page.getByLabel("Choose a language…").selectOption("hi");
  await page.getByRole("button", { name: "Add language" }).click();
  await expect(page.getByRole("status").filter({ hasText: "हिन्दी added" })).toBeVisible();
  await expect(page.getByText("4 languages · 4 enabled")).toBeVisible();

  await page.getByRole("switch", { name: "Hindi enabled" }).click();
  await expect(page.getByText("4 languages · 3 enabled")).toBeVisible();
  await openLangMenu(page);
  await expect(page.getByRole("menuitemradio", { name: /हिन्दी/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByTestId("lang-hi").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("3 languages · 3 enabled")).toBeVisible();

  await page.getByLabel("Add a term and press Enter").fill("Ministry of Health");
  await page.getByLabel("Add a term and press Enter").press("Enter");
  await expect(page.locator(".gloss-term").filter({ hasText: "Ministry of Health" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Remove Ministry of Health" }).click();
  await expect(page.locator(".gloss-term").filter({ hasText: "Ministry of Health" })).toHaveCount(0);

  await page.getByRole("switch", { name: "Label machine translations" }).click();
  await expect(page.getByRole("switch", { name: "Label machine translations" })).toHaveAttribute("aria-checked", "false");

  // The default language moves to Sinhala: visitors get the Sinhala interface.
  await page.getByLabel("Default language").selectOption("si");
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByLabel("Default language")).toHaveValue("si");
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "si");
});

test("proposals, stream names and the discussion are translated, with review", async ({ page }) => {
  test.skip(!process.env.OPENAI_API_KEY, "needs OPENAI_API_KEY");
  test.setTimeout(180_000);
  await login(page);
  await pickLanguage(page, /தமிழ்/);
  // Titles are translated after the first render; the page refreshes itself when they're ready.
  await expect(page.locator("a.row").first().locator(".tx-tag")).toBeVisible({ timeout: 90_000 });

  await page.locator("a.row").first().click();
  const banner = page.getByTestId("translation-banner");
  await expect(banner).toContainText("மொழிபெயர்க்கப்பட்டது", { timeout: 90_000 });
  await expect(banner.locator(".tx-chip")).toBeVisible();
  // Every translated section was checked, so the banner shows the AI accuracy check and each paragraph its own score.
  await expect(banner.getByTestId("tx-accuracy")).toHaveText(/\d+%/);
  await expect(page.locator(".prose p").first()).toHaveAttribute("title", /\d+%/);
  await expect(page.locator("h1.view-title")).not.toHaveText(TITLES.hospital);

  await banner.getByRole("link", { name: /English/ }).click();
  await expect(page.locator("h1.view-title")).toHaveText(TITLES.hospital);
  await page.getByTestId("translation-banner").getByRole("link").click();
  await expect(page.locator("h1.view-title")).not.toHaveText(TITLES.hospital);

  // Maya is an admin, so she can mark the translation as reviewed.
  await page.getByTestId("translation-banner").getByRole("button").click();
  await expect(page.getByTestId("translation-banner").locator(".tx-chip.pill-green")).toBeVisible();

  // The per-proposal menu shows the original without changing the site language.
  await page.locator(".plang-btn").click();
  await page.getByRole("menuitemradio").first().click();
  await expect(page.locator("h1.view-title")).toHaveText(TITLES.hospital);
  await expect(page.locator("html")).toHaveAttribute("lang", "ta");

  // Translate the whole discussion, then show the originals again.
  await page.locator(".plang-btn").click();
  await page.getByRole("menuitemradio", { name: /தமிழ்/ }).click();
  const daniel = page.getByTestId("comment-thread").first();
  await expect(daniel).toContainText("Phasing makes this much easier");
  await page.locator(".disc-tx").click();
  await expect(daniel).not.toContainText("Phasing makes this much easier", { timeout: 60_000 });
  await expect(daniel.locator(".tx-note").first()).toBeVisible();
  await page.locator(".disc-tx").click();
  await expect(daniel).toContainText("Phasing makes this much easier");
});

test("a single comment can be translated into another language", async ({ page }) => {
  test.skip(!process.env.OPENAI_API_KEY, "needs OPENAI_API_KEY");
  test.setTimeout(120_000);
  await login(page);
  await openProposal(page, TITLES.hospital);
  // Found by id: once translated, the comment no longer contains its English text.
  const avaId = await page.getByTestId("comment-thread").filter({ hasText: "The capital estimate looks low" }).getAttribute("id");
  const ava = page.locator(`[id="${avaId}"]`);
  await ava.locator(".cmt-tx > button").first().click();
  await ava.getByRole("menuitemradio", { name: "සිංහල" }).click();
  await expect(ava).not.toContainText("The capital estimate looks low", { timeout: 60_000 });
  await expect(ava.locator(".cmt-tx > button").first()).toContainText("සිංහල");
  await ava.locator(".cmt-tx > button").first().click();
  await ava.getByRole("menuitemradio", { name: /Original/ }).click();
  await expect(ava).toContainText("The capital estimate looks low");
});

test("the editor says which languages a new version is translated into", async ({ page }) => {
  await login(page);
  await page.goto("/proposals/new");
  await expect(page.locator(".tx-hint")).toContainText("Translated into සිංහල, தமிழ் when you publish");
});
