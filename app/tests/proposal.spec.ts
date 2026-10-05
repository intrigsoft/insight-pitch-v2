import { expect, test } from "@playwright/test";
import { login, openProposal, resetDb, TITLES } from "./helpers";

test.beforeAll(resetDb);

test("proposal page shows scores, body sections and version history", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  await expect(page.getByText(/^Published v3 · .* · first published /)).toBeVisible();
  const scores = page.getByRole("region", { name: "Stream scores" });
  await expect(scores.locator(".score-row")).toHaveText(["Healthcare9/10", "Finance6/10", "Transport3/10"]);
  await expect(scores).toContainText("Not scored: Law & Justice, IT & Digital, Tourism, Environment, Education");
  await expect(page.locator(".prose h3")).toHaveText(["The problem", "Proposal", "Cost and funding", "Access"]);
  await expect(page.getByText("3 versions · last published")).toBeVisible();

  const history = page.getByRole("navigation", { name: "Version history" });
  await expect(history.getByRole("link")).toHaveCount(3);
  await expect(history.getByRole("link").first()).toContainText("Latest");
  await history.getByRole("link", { name: /v1/ }).click();
  await expect(page.getByText("You're viewing v1")).toBeVisible();
  await expect(page.locator(".prose h3")).toHaveText(["The problem", "Proposal"]);
  await page.getByRole("link", { name: "View latest (v3) →" }).click();
  await expect(page.getByText("You're viewing")).toHaveCount(0);
  await expect(page.locator(".prose h3")).toHaveCount(4);
});

test("following a proposal adds it to the Following tab", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  await page.getByRole("button", { name: "Follow proposal" }).click();
  await expect(page.getByRole("status")).toHaveText("You’ll be notified about new versions");
  await expect(page.getByRole("button", { name: "Following ✓" })).toBeVisible();
  await page.goto("/?tab=following");
  await expect(page.locator(".rows .row")).toHaveCount(2);
  await openProposal(page, TITLES.hospital);
  await page.getByRole("button", { name: "Following ✓" }).click();
  await expect(page.getByRole("status")).toHaveText("Unfollowed");
  await expect(page.getByRole("button", { name: "Follow proposal" })).toBeVisible();
});

test("own published proposal with a draft offers to continue it", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.legal);
  await expect(page.getByRole("link", { name: "Continue draft" })).toBeVisible();
  const pending = page.getByRole("navigation", { name: "Version history" }).getByRole("link", { name: /Unpublished draft/ });
  await expect(pending).toContainText("Saved yesterday · Continue editing");
  await pending.click();
  await expect(page.getByText("Editing v2 draft", { exact: true })).toBeVisible();
});

test("an unpublished draft is private and closed for comments", async ({ page, browser }) => {
  await login(page);
  await openProposal(page, TITLES.telemedicine);
  await expect(page.getByText("This proposal is a draft. Only you can see it until it's published.")).toBeVisible();
  await expect(page.getByText("Comments open once the proposal is published.")).toBeVisible();
  await expect(page.getByText("Nothing published yet. v1 is created when you publish.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue draft" })).toBeVisible();
  const url = page.url();

  const other = await browser.newPage();
  await login(other, "priya");
  await expect(other.locator(".rows .row").filter({ hasText: TITLES.telemedicine })).toHaveCount(0);
  await other.goto(url);
  await expect(other.getByRole("heading", { name: "Not found" })).toBeVisible();
  await other.close();
});

test("other people's proposals can't be edited", async ({ page }) => {
  await login(page, "priya");
  await openProposal(page, TITLES.legal);
  await expect(page.getByRole("button", { name: "Follow proposal" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue draft|Edit/ })).toHaveCount(0);
  await page.goto(page.url() + "/edit");
  await expect(page.getByRole("heading", { level: 1, name: TITLES.legal })).toBeVisible();
  await expect(page.getByText("Editing")).toHaveCount(0);
});
