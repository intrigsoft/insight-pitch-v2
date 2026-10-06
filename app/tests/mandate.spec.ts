// Public mandate: supporting or opposing published proposals, the lead's display minimum, and the admin's mandate rule.
import { expect, test, type Page } from "@playwright/test";
import { escapeRe, login, openProposal, resetDb, TITLES } from "./helpers";

test.beforeEach(() => resetDb());

const toast = (page: Page, text: string | RegExp) => expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();
const card = (page: Page) => page.getByRole("region", { name: "Public mandate" });
const row = (page: Page, title: string) => page.locator(".row").filter({ has: page.getByRole("link", { name: new RegExp(escapeRe(title)) }) });

test("the list shows support and mandates for published proposals", async ({ page }) => {
  await login(page);
  await expect(row(page, TITLES.hospital)).toContainText("Mandate");
  await expect(row(page, TITLES.hospital)).toContainText("82% support · 231 votes");
  await expect(row(page, TITLES.procurement)).toContainText("62% support · 154 votes");
  await expect(row(page, TITLES.procurement)).not.toContainText("Mandate");
  // Below the lead's minimum, only the number of votes shows.
  await expect(row(page, TITLES.legal)).toContainText("18 votes");
  await expect(row(page, TITLES.legal)).not.toContainText("support");
  await expect(row(page, TITLES.telemedicine)).not.toContainText("votes");
});

test("voting, changing the vote, telling the author what would change it, and withdrawing", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  await expect(card(page)).toContainText("Mandate reached");
  await expect(card(page)).toContainText("support of 231 votes");
  await expect(card(page)).toContainText("Support over time");
  await card(page).getByRole("button", { name: "Support" }).click();
  await toast(page, "Vote recorded");
  await expect(card(page).getByRole("button", { name: "Supported" })).toHaveAttribute("aria-pressed", "true");
  await expect(card(page)).toContainText("190 support");
  await expect(card(page)).toContainText("You can change or withdraw your vote at any time.");

  await card(page).getByRole("button", { name: "Oppose" }).click();
  await expect(card(page)).toContainText("43 oppose");
  await expect(card(page)).toContainText("189 support");
  const reason = card(page).getByLabel("What would need to change for you to support it?");
  await expect(card(page).getByRole("button", { name: "Send to author" })).toBeDisabled();
  await reason.fill("Publish a staffing plan for doctors and nurses.");
  await card(page).getByRole("button", { name: "Send to author" }).click();
  await toast(page, "Your reason was sent to the author");
  await expect(reason).toBeHidden();

  await card(page).getByRole("button", { name: "Opposed" }).click();
  await toast(page, "Vote withdrawn");
  await expect(card(page)).toContainText("support of 231 votes");

  // Withdrawing the vote takes the reason with it.
  await page.context().clearCookies();
  await login(page, "priya");
  await openProposal(page, TITLES.hospital);
  await expect(card(page).getByRole("button", { name: /said what would win their support/ })).toHaveCount(0);
});

test("a reason sent while opposing reaches the lead", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  await card(page).getByRole("button", { name: "Oppose" }).click();
  await card(page).getByLabel("What would need to change for you to support it?").fill("Publish a staffing plan for doctors and nurses.");
  await card(page).getByRole("button", { name: "Send to author" }).click();
  await toast(page, "Your reason was sent to the author");
  await page.context().clearCookies();
  await login(page, "priya");
  await openProposal(page, TITLES.hospital);
  await card(page).getByRole("button", { name: "1 person said what would win their support" }).click();
  await expect(card(page)).toContainText("Publish a staffing plan for doctors and nurses.");
  // Supporting instead takes the reason back.
  await page.context().clearCookies();
  await login(page);
  await openProposal(page, TITLES.hospital);
  await card(page).getByRole("button", { name: "Support" }).click();
  await toast(page, "Vote recorded");
  await page.context().clearCookies();
  await login(page, "priya");
  await openProposal(page, TITLES.hospital);
  await expect(card(page).getByRole("button", { name: /said what would win their support/ })).toHaveCount(0);
});

test("the lead chooses when approval shows and reads reasons; others can't", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.legal);
  await expect(card(page)).toContainText("18 votes so far");
  await expect(card(page)).toContainText("Approval shows publicly after 30 votes.");
  await card(page).getByRole("button", { name: "2 people said what would win their support" }).click();
  await expect(card(page)).toContainText("Start with a few courts");
  await card(page).getByLabel(/Show approval after/).selectOption("10");
  await toast(page, "Approval shows after 10 votes");
  await expect(card(page)).toContainText("78%");
  await expect(card(page)).toContainText("Needs 182 more votes for a mandate.");
  await page.context().clearCookies();
  await login(page, "daniel");
  await openProposal(page, TITLES.legal);
  await expect(card(page)).toContainText("78%");
  await expect(card(page).getByLabel(/Show approval after/)).toHaveCount(0);
  await expect(card(page).getByRole("button", { name: /said what would win their support/ })).toHaveCount(0);
});

test("drafts have no votes", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.telemedicine);
  await expect(card(page)).toHaveCount(0);
});

test("the admin's mandate rule decides which proposals have a mandate", async ({ page }) => {
  await login(page);
  await page.goto("/settings?tab=scoring");
  const rule = page.getByTestId("mandate-rule");
  await rule.getByLabel("From at least this many votes").fill("150");
  await rule.getByLabel("From at least this many votes").press("Enter");
  await page.waitForTimeout(500);
  await page.goto("/");
  await expect(row(page, TITLES.procurement)).toContainText("Mandate");
  await page.goto("/settings?tab=scoring");
  await rule.getByLabel("Support needed").selectOption("70");
  await page.waitForTimeout(500);
  await page.goto("/");
  await expect(row(page, TITLES.procurement)).not.toContainText("Mandate");
  await expect(row(page, TITLES.hospital)).toContainText("Mandate");
  await expect(row(page, TITLES.bus)).toContainText("Mandate");
});
