import { expect, test, type Page } from "@playwright/test";
import { login, resetDb, TITLES } from "./helpers";

test.beforeEach(async ({ page }) => {
  resetDb();
  await login(page);
});

const drawer = (page: Page) => page.getByRole("dialog");

test("streams table lists every stream with counts and overlaps", async ({ page }) => {
  await page.getByRole("link", { name: "Admin settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("9 streams · 8 active")).toBeVisible();
  const finance = page.getByTestId("stream-finance");
  await expect(finance).toContainText("Healthcare");
  await expect(finance.getByRole("cell").nth(2)).toHaveText("7");
  await expect(page.getByTestId("stream-agri")).toContainText("Inactive");
});

test("add a stream, reject duplicates, link overlaps and delete it", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Add stream" }).click();
  await expect(drawer(page).getByRole("heading", { name: "New stream" })).toBeVisible();
  await drawer(page).getByRole("button", { name: "Save stream" }).click();
  await expect(drawer(page).getByRole("alert")).toHaveText("Give the stream a name.");
  await drawer(page).getByLabel("Name").fill("finance");
  await drawer(page).getByRole("button", { name: "Save stream" }).click();
  await expect(drawer(page).getByRole("alert")).toHaveText("A stream with this name already exists.");
  await drawer(page).getByLabel("Name").fill("Housing");
  await drawer(page).getByLabel("Description").fill("Social housing, rents and planning.");
  await drawer(page).getByRole("radio", { name: "#7a3f5e" }).click();
  await drawer(page).getByRole("button", { name: "Finance" }).click();
  await drawer(page).getByRole("button", { name: "Save stream" }).click();
  await expect(page.getByRole("status")).toHaveText("Stream added");
  await expect(page.getByText("10 streams · 9 active")).toBeVisible();
  const housing = page.getByTestId("stream-housing");
  await expect(housing).toContainText("Finance");
  await expect(page.getByTestId("stream-finance")).toContainText("Housing");

  await housing.getByRole("button", { name: "Edit Housing" }).click();
  await expect(drawer(page).getByRole("heading", { name: "Edit stream" })).toBeVisible();
  await drawer(page).getByRole("button", { name: "Delete stream" }).click();
  await expect(page.getByRole("status")).toHaveText("Stream deleted");
  await expect(page.getByTestId("stream-housing")).toHaveCount(0);
  await expect(page.getByTestId("stream-finance")).not.toContainText("Housing");
});

test("streams in use can't be deleted, only deactivated", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Edit Tourism" }).click();
  await expect(drawer(page)).toContainText("Used by 1 proposal. Deactivate instead of deleting.");
  await expect(drawer(page).getByRole("button", { name: "Delete stream" })).toHaveCount(0);
  await drawer(page).getByRole("button", { name: "Cancel" }).click();
  await expect(drawer(page)).toHaveCount(0);

  await page.getByRole("switch", { name: "Tourism active" }).click();
  await expect(page.getByRole("status")).toHaveText("Tourism deactivated");
  await expect(page.getByText("9 streams · 7 active")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Streams" }).getByRole("link", { name: /^Tourism/ })).toHaveCount(0);
  // Existing proposals keep the stream.
  await expect(page.locator("a.row").filter({ hasText: "Heritage trail" }).locator(".score-chip").first()).toContainText("Tourism");
  await page.goto("/proposals/new");
  await expect(page.getByRole("button", { name: "Tourism" })).toHaveCount(0);
});

test("score scale and public score setting change how scores show", async ({ page }) => {
  await page.goto("/settings?tab=scoring");
  await page.getByRole("button", { name: "0 – 100" }).click();
  await expect(page.getByRole("button", { name: "0 – 100" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/");
  const hospital = page.locator("a.row").filter({ hasText: TITLES.hospital });
  await expect(hospital.locator(".score-chip").first()).toHaveText("Healthcare90");
  await hospital.click();
  await expect(page.locator(".score-row").first()).toHaveText("Healthcare90/100");

  await page.goto("/settings?tab=scoring");
  await page.getByRole("button", { name: "1 – 5" }).click();
  await page.getByRole("switch", { name: "Show scores on the public listing" }).click();
  await expect(page.getByRole("switch", { name: "Show scores on the public listing" })).toHaveAttribute("aria-checked", "false");
  await page.goto("/");
  await expect(page.locator("a.row").filter({ hasText: TITLES.hospital }).locator(".score-chip").first()).toHaveText("Healthcare");
  await page.locator("a.row").filter({ hasText: TITLES.hospital }).click();
  await expect(page.locator(".score-row").first()).toHaveText("Healthcare5/5");
});

test("who assigns scores controls the editor sliders, and stream requirement can be lifted", async ({ page }) => {
  await page.goto("/settings?tab=scoring");
  await page.getByRole("radio", { name: /Reviewers/ }).click();
  await expect(page.getByRole("radio", { name: /Reviewers/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Require at least one stream to publish" }).click();
  await expect(page.getByRole("switch", { name: "Require at least one stream to publish" })).toHaveAttribute("aria-checked", "false");
  await page.goto("/proposals/new");
  await expect(page.getByText("Pick the streams this affects. Reviewers assign scores after publishing.")).toBeVisible();
  await page.getByRole("button", { name: "Healthcare" }).click();
  await expect(page.getByLabel("Healthcare score")).toHaveCount(0);

  // Without the stream requirement a proposal can publish with no streams.
  await page.getByRole("button", { name: "Healthcare" }).click();
  await page.getByLabel("Proposal title").fill("Open data portal for city budgets");
  await page.getByLabel("Summary").fill("Publish the city budget as open data every quarter.");
  await page.getByLabel("Proposal body").fill("## Proposal\n\nRelease line-item budget data each quarter in a machine-readable format.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published v1");
  await expect(page.getByText("No streams picked yet.")).toBeVisible();
});

test("overlap matrix and suggested links", async ({ page }) => {
  await page.goto("/settings?tab=overlaps");
  await expect(page.getByRole("table")).toBeVisible();
  const cell = page.getByTitle("Finance + Law & Justice: 3 shared");
  await expect(cell.first()).toHaveText("3");
  const suggestion = page.locator(".suggest-row").filter({ hasText: "Finance + Law & Justice" });
  await expect(suggestion).toContainText("3 shared proposals");
  await suggestion.getByRole("button", { name: "Link" }).click();
  await expect(page.getByRole("status")).toHaveText("Streams linked");
  await expect(page.locator(".suggest-row").filter({ hasText: "Finance + Law & Justice" })).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByTestId("stream-law")).toContainText("Finance");
});
