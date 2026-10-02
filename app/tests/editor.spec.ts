import { expect, test } from "@playwright/test";
import { formError, login, openProposal, resetDb, TITLES } from "./helpers";

test.beforeAll(resetDb);
test.beforeEach(async ({ page }) => login(page));

test("new proposal: validation, save draft, then publish v1", async ({ page }) => {
  test.setTimeout(90_000);
  await page.getByRole("link", { name: "New proposal" }).click();
  await expect(page).toHaveURL("/proposals/new");
  await expect(page.getByRole("main").getByText("New proposal", { exact: true })).toBeVisible();
  await expect(page.getByText("New · not saved yet")).toBeVisible();
  await expect(page.getByText("Publishing creates v1 and opens comments.")).toBeVisible();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(formError(page)).toHaveText("Add a title before saving a draft.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(formError(page)).toHaveText("A title, summary and body are required to publish.");

  await page.getByLabel("Proposal title").fill("Protected cycle lanes on the river corridor");
  await page.getByLabel("Summary").fill("Build 6 km of protected cycle lanes along the river so people can commute safely by bike.");
  await page.getByLabel("Proposal body").fill("## The problem\n\nThe river road has the highest cycling injury rate in the city.\n\n## Proposal\n\nSeparate cycle lanes with kerbs, new crossings at four junctions, and secure bike parking at the two rail stations.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(formError(page)).toHaveText("Pick at least one stream before publishing.");

  await page.getByRole("button", { name: "Transport" }).click();
  await expect(page.getByRole("button", { name: "Transport" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Transport score").fill("8");
  await page.getByRole("button", { name: "Environment" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved");
  await expect(page).toHaveURL(/\/proposals\/[0-9a-f-]+\/edit$/);
  await expect(page.getByText(/Draft saved (just now|.*ago)/)).toBeVisible();
  await expect(page.getByText("Draft · not published")).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Published v1");
  await expect(page.getByRole("heading", { level: 1, name: "Protected cycle lanes on the river corridor" })).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  const scores = page.getByRole("region", { name: "Stream scores" });
  await expect(scores.locator(".score-row")).toHaveCount(2);
  if (process.env.TYPESAFE_API_KEY) await expect(scores).toContainText("Extracted from the proposal by Jev");
  await expect(page.getByLabel("Add to the discussion")).toBeVisible();

  await page.goto("/");
  await expect(page.locator("a.row").first()).toContainText("Protected cycle lanes on the river corridor");
});

test("publishing a new version requires a note and keeps history", async ({ page }) => {
  test.setTimeout(90_000);
  await openProposal(page, TITLES.legal);
  await page.getByRole("link", { name: "Continue draft" }).click();
  await expect(page.getByText("Editing v2 draft")).toBeVisible();
  await expect(page.getByText("Published v1 · draft of v2 in progress")).toBeVisible();
  await expect(page.getByText("Required. v1–v1 stay readable in version history.")).toBeVisible();
  await page.getByRole("button", { name: "Publish v2" }).click();
  await expect(formError(page)).toHaveText("Describe what changed in this version.");
  await page.getByLabel("What changed in v2?").fill("Added funding and success measures");
  await page.getByRole("button", { name: "Publish v2" }).click();
  await expect(page.getByRole("status")).toContainText("Published v2");
  const history = page.getByRole("navigation", { name: "Version history" });
  await expect(history.getByRole("link")).toHaveCount(2);
  await expect(history.getByRole("link").first()).toContainText("v2");
  await expect(history.getByRole("link").first()).toContainText("Added funding and success measures");
  await expect(page.getByRole("link", { name: "Edit as new version" })).toBeVisible();
  await page.goto("/");
  await expect(page.locator("a.row").filter({ hasText: TITLES.legal })).not.toContainText("Unpublished changes");
});

test("cancel and back links return without saving", async ({ page }) => {
  await page.goto("/proposals/new");
  await page.getByLabel("Proposal title").fill("Throwaway idea");
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("a.row").filter({ hasText: "Throwaway idea" })).toHaveCount(0);
  await openProposal(page, TITLES.telemedicine);
  await page.getByRole("link", { name: "Continue draft" }).click();
  await expect(page.getByText("Editing draft")).toBeVisible();
  await page.getByRole("link", { name: "Back to proposal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: TITLES.telemedicine })).toBeVisible();
});
