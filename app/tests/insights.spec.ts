// Insights tab. Creating insights from new comments calls Jev and OpenAI.
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { login, openProposal, resetDb, TITLES } from "./helpers";

test.beforeEach(() => resetDb());

const insight = (page: Page, text: string) => page.getByTestId("insight").filter({ hasText: text });

test("insights are grouped, can be upvoted and link back to comments", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  await page.getByRole("tab", { name: /Insights/ }).click();
  await expect(page.getByRole("tab", { name: /Insights/ })).toContainText("4");
  await expect(page.getByTestId("insights-concern")).toContainText("Concerns2");
  await expect(page.getByTestId("insights-clarification")).toContainText("1 · 1 answered");
  const staffing = insight(page, "No recruitment plan yet");
  await expect(staffing).toContainText("Raised by");
  await staffing.getByRole("button", { name: /Upvote/ }).click();
  await expect(staffing.getByRole("button", { name: /Upvote/ })).toHaveText("10");
  await page.reload();
  await page.getByRole("tab", { name: /Insights/ }).click();
  await expect(insight(page, "No recruitment plan yet").getByRole("button", { name: /Upvote/ })).toHaveText("10");
  // Maya isn't the author, so she can't mark questions answered.
  await expect(page.getByRole("button", { name: /Mark (un)?answered/ })).toHaveCount(0);

  // "Raised by Sam" opens the discussion at Sam's reply, expanding the collapsed thread.
  await insight(page, "No recruitment plan yet").getByRole("button", { name: "Sam" }).click();
  await expect(page.getByRole("tab", { name: /Discussion/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".bubble.highlight")).toContainText("Staffing is the real constraint");
});

test("the author marks clarifications answered", async ({ page }) => {
  await login(page, "priya");
  await openProposal(page, TITLES.hospital);
  await page.getByRole("tab", { name: /Insights/ }).click();
  const road = insight(page, "Who maintains the access road");
  await road.getByRole("button", { name: "Mark unanswered" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked as unanswered" })).toBeVisible();
  await expect(road).not.toContainText("Answered");
  await road.getByRole("button", { name: "Mark answered" }).click();
  await expect(road).toContainText("Answered");
  // Only clarifications can be marked.
  await expect(insight(page, "No recruitment plan yet").getByRole("button", { name: /Mark/ })).toHaveCount(0);
});

test("a new comment joins a matching insight or starts a new one", async ({ page }) => {
  test.skip(!process.env.TYPESAFE_API_KEY, "needs TYPESAFE_API_KEY");
  test.setTimeout(120_000);
  await login(page);
  await openProposal(page, TITLES.hospital);
  const box = page.getByLabel("Add to the discussion");

  await box.fill("Where will the doctors and nurses come from? I don't see any recruitment plan for staff.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comment posted" })).toBeVisible();
  await box.fill("The bus stop on the regional route should have a covered shelter for patients waiting in the rain.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comment posted" })).toBeVisible();

  // Insights are built in the background; reload until both comments have been processed.
  await expect(async () => {
    await page.reload();
    await page.getByRole("tab", { name: /Insights/ }).click();
    await expect(insight(page, "No recruitment plan yet")).toContainText("Maya");
    await expect(page.getByTestId("insights-suggestion").getByTestId("insight").filter({ hasText: /shelter/i })).toContainText("Maya");
  }).toPass({ timeout: 60_000, intervals: [3000] });
  // The new insight is judged for relevance too.
  await expect(async () => {
    await page.reload();
    await page.getByRole("tab", { name: /Insights/ }).click();
    await expect(page.getByTestId("insights-suggestion").getByTestId("insight").filter({ hasText: /shelter/i })).toContainText(/\d+% relevant/);
  }).toPass({ timeout: 60_000, intervals: [3000] });
});

test("insights are sorted by relevance to the proposal, or by votes", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  await page.getByRole("tab", { name: /Insights/ }).click();
  const concerns = page.getByTestId("insights-concern").getByTestId("insight");
  // Most relevant first: the cost concern (96%) outranks the staffing one (91%) despite fewer votes.
  await expect(page.getByLabel("Sort insights")).toHaveValue("relevant");
  await expect(concerns.first()).toContainText("The capital estimate looks low");
  await expect(concerns.first()).toContainText("96% relevant");
  await expect(concerns.nth(1)).toContainText("91% relevant");
  await page.getByLabel("Sort insights").selectOption("votes");
  await expect(concerns.first()).toContainText("No recruitment plan yet");
  await expect(concerns.first().getByRole("button", { name: /Upvote/ })).toHaveText("9");
});

test("insights not yet judged against the latest version are judged when the proposal is opened", async ({ page }) => {
  test.skip(!process.env.TYPESAFE_API_KEY, "needs TYPESAFE_API_KEY");
  test.setTimeout(90_000);
  // Simulate insights from before relevance scoring.
  const sql = postgres(process.env.TEST_DATABASE_URL || "postgres://insight:insight@localhost:54329/insight_pitch_test");
  await sql`update insights set relevance = null, relevance_version = null`;
  await sql.end();
  await login(page);
  await openProposal(page, TITLES.procurement);
  await page.getByRole("tab", { name: /Insights/ }).click();
  await expect(page.getByTestId("insight").first()).not.toContainText("relevant");
  await expect(async () => {
    await page.reload();
    await page.getByRole("tab", { name: /Insights/ }).click();
    await expect(page.getByTestId("insight")).toHaveCount(2);
    for (const i of await page.getByTestId("insight").all()) await expect(i).toContainText(/\d+% relevant/, { timeout: 1000 });
  }).toPass({ timeout: 60_000, intervals: [3000] });
});
