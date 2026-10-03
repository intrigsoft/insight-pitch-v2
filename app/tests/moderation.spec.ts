// Comment checks, reader flags and moderation. These call the real Jev API, so they need TYPESAFE_API_KEY.
import { expect, test, type Page } from "@playwright/test";
import { login, openProposal, resetDb, TITLES } from "./helpers";

test.skip(!process.env.TYPESAFE_API_KEY, "needs TYPESAFE_API_KEY");
test.beforeEach(() => resetDb());

const thread = (page: Page, text: string) => page.getByTestId("comment-thread").filter({ hasText: text });
const composer = (page: Page) => page.getByLabel("Add to the discussion");

test("flagged comments are hidden until revealed, and sorting works", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  // Keep hold of the thread by id: its text changes once revealed.
  const robId = await thread(page, "Hidden · Personal attack").getAttribute("id");
  const rob = page.locator(`[id="${robId}"]`);
  await expect(rob).toContainText("Waiting for moderator review.");
  await expect(rob).not.toContainText("padding her CV");
  await rob.getByRole("button", { name: "Show anyway" }).click();
  await expect(rob).toContainText("Flagged · Personal attack · under review");
  await expect(rob).toContainText("padding her CV");

  // Most relevant: on-topic comments first, hidden ones last.
  const threads = page.getByTestId("comment-thread");
  await expect(threads.first()).toContainText("Phasing makes this much easier");
  await page.getByLabel("Sort comments").selectOption("newest");
  await expect(threads.first()).toContainText("Rob Kessler");
  await page.getByLabel("Sort comments").selectOption("oldest");
  await expect(threads.first()).toContainText("Daniel Okafor");
  await page.getByLabel("Sort comments").selectOption("replies");
  await expect(threads.first()).toContainText("Phasing makes this much easier");
});

test("an abusive comment is held for review and a moderator approves it", async ({ page, browser }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  const text = "This is a stupid idea and you are all idiots";
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Possible ", { exact: false }).filter({ hasText: "Edit it, or post it for moderator review." })).toBeVisible();
  await page.getByRole("button", { name: "Post for review" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Submitted for review" })).toBeVisible();
  await expect(thread(page, text)).toContainText("Pending review · only you can see this");

  const other = await browser.newPage();
  await login(other, "priya");
  await openProposal(other, TITLES.hospital);
  await expect(other.getByText(text)).toHaveCount(0);

  await page.goto("/settings?tab=moderation");
  const item = page.getByTestId("moderation-item").filter({ hasText: text });
  await expect(item).toContainText("Held before posting");
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comment approved" })).toBeVisible();
  await expect(page.getByTestId("moderation-item").filter({ hasText: text })).toHaveCount(0);

  await other.reload();
  await expect(thread(other, text)).toBeVisible();
  await other.close();
});

test("editing the text clears the warning; an off-topic comment can still be posted", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  await composer(page).fill("Does anyone know when the summer music festival tickets go on sale?");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("This looks unrelated to the proposal. Edit it, or post anyway.")).toBeVisible();
  await composer(page).fill("Does anyone know when the summer music festival tickets go on sale? I missed them last year.");
  await expect(page.getByText("This looks unrelated to the proposal.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Post comment" })).toBeVisible();
  await page.getByRole("button", { name: "Post comment" }).click();
  await page.getByRole("button", { name: "Post anyway" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comment posted" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Discussion/ })).toContainText("13");
});

test("an abusive reply asks for confirmation and is held", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  const t = thread(page, "The capital estimate looks low");
  await t.getByRole("button", { name: "Reply" }).click();
  await t.getByLabel("Write a reply").fill("Shut up and get lost, nobody asked you.");
  await t.getByLabel("Write a reply").press("Enter");
  await expect(t.getByText("Send again to post it for moderator review.")).toBeVisible();
  await t.getByRole("button", { name: "Post for review" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reply held for moderator review" })).toBeVisible();
  await expect(t).toContainText("Pending review · only you can see this");
});

test("two reader flags hide a comment; withdrawing a flag brings it back", async ({ page, browser }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  // Threads are found by id because flagged comments collapse and lose their text.
  const avaId = await thread(page, "The capital estimate looks low").getAttribute("id");
  const ava = page.locator(`[id="${avaId}"]`);
  await ava.getByRole("button", { name: "Flag", exact: true }).click();
  await ava.getByRole("group", { name: "Flag as" }).getByRole("button", { name: "Misleading" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Flagged. A moderator will review it." })).toBeVisible();
  await expect(ava.getByRole("button", { name: "Flagged" })).toBeVisible();
  // One flag doesn't hide it, but it reaches the moderators.
  await expect(ava).toContainText("Ava Moreau");
  await page.goto("/settings?tab=moderation");
  await expect(page.getByTestId("moderation-item").filter({ hasText: "The capital estimate" })).toContainText("Misleading × 1");

  const priya = await browser.newPage();
  await login(priya, "priya");
  await openProposal(priya, TITLES.hospital);
  const t2 = priya.locator(`[id="${avaId}"]`);
  await t2.getByRole("button", { name: "Flag", exact: true }).click();
  await t2.getByRole("group", { name: "Flag as" }).getByRole("button", { name: "Misleading" }).click();
  // The second flag hides it, for Priya too.
  await expect(t2).toContainText("Hidden · Misleading");
  await expect(t2.getByRole("button", { name: "Flagged" })).toBeVisible();

  const lena = await browser.newPage();
  await login(lena, "lena");
  await openProposal(lena, TITLES.hospital);
  await expect(lena.getByText("Hidden · Misleading")).toBeVisible();

  await t2.getByRole("button", { name: "Flagged" }).click();
  await expect(priya.getByRole("status").filter({ hasText: "Flag removed" })).toBeVisible();
  await lena.reload();
  await expect(lena.getByText("Hidden · Misleading")).toHaveCount(0);
  await expect(lena.locator(`[id="${avaId}"]`)).toContainText("Ava Moreau");
  await priya.close();
  await lena.close();
});

test("a moderator can remove a comment", async ({ page }) => {
  await login(page);
  await page.goto("/settings?tab=moderation");
  await expect(page.getByRole("link", { name: /Moderation \(2\)/ })).toBeVisible();
  const spam = page.getByTestId("moderation-item").filter({ hasText: "quickbuild-loans" });
  await expect(spam).toContainText("Hidden · Spam");
  await spam.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comment removed" })).toBeVisible();
  await openProposal(page, TITLES.hospital);
  await expect(page.getByText("Hidden · Spam")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Discussion/ })).toContainText("11");
});

test("insults written in Sinhala or Tamil with English letters are caught; polite ones post", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  await openProposal(page, TITLES.hospital);
  // Romanised comments take longer: they're converted to Sinhala or Tamil script and checked again.
  await composer(page).fill("Palayan yanna ballo, umbala okkoma horu");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Edit it, or post it for moderator review.")).toBeVisible({ timeout: 20_000 });
  // A single slang word, which once slipped through as merely "unrelated".
  await composer(page).fill("Hukanawa");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Possible abusive language. Edit it, or post it for moderator review.")).toBeVisible({ timeout: 20_000 });
  await composer(page).fill("Indha hospital nalla idea, aana staff enga irundhu varuvaanga?");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comment posted" })).toBeVisible({ timeout: 20_000 });
});
