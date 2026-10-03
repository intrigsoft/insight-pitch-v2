import { expect, test } from "@playwright/test";
import { login, openProposal, resetDb, TITLES } from "./helpers";

test.beforeAll(resetDb);
test.beforeEach(async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
});

const thread = (page: import("@playwright/test").Page, text: string) => page.getByTestId("comment-thread").filter({ hasText: text });

test("long threads collapse to the latest reply", async ({ page }) => {
  const t = thread(page, "Phasing makes this much easier to fund");
  await expect(t.locator(".reply")).toHaveCount(1);
  await t.getByRole("button", { name: "View 2 earlier replies" }).click();
  await expect(t.locator(".reply")).toHaveCount(3);
  await expect(t.locator(".mention")).toHaveText("@Daniel Okafor");
});

test("post a comment", async ({ page }) => {
  await expect(page.getByRole("tab", { name: /Discussion/ })).toContainText("12");
  const post = page.getByRole("button", { name: "Post comment" });
  await expect(post).toBeDisabled();
  await page.getByLabel("Add to the discussion").fill("Please publish the staffing plan alongside Phase 1.");
  await post.click();
  await expect(page.getByLabel("Add to the discussion")).toHaveValue("");
  await expect(page.getByRole("tab", { name: /Discussion/ })).toContainText("13");
  const mine = thread(page, "Please publish the staffing plan");
  await expect(mine).toContainText("Maya Chen");
  await expect(mine).toContainText("Just now");
});

test("like and unlike a comment", async ({ page }) => {
  const t = thread(page, "The capital estimate looks low");
  await expect(t.getByLabel("2 likes")).toBeVisible();
  await t.getByRole("button", { name: "Like" }).click();
  await expect(t.getByLabel("3 likes")).toBeVisible();
  await expect(t.getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(t.getByLabel("3 likes")).toBeVisible();
  await t.getByRole("button", { name: "Like" }).click();
  await expect(t.getByLabel("2 likes")).toBeVisible();
});

test("reply with Enter, mention prefill, and Escape to cancel", async ({ page }) => {
  const t = thread(page, "Who maintains the access road");
  await t.locator(".reply").filter({ hasText: "Priya Raman" }).getByRole("button", { name: "Reply" }).click();
  const box = t.getByLabel("Write a reply");
  await expect(box).toHaveValue("@Priya Raman ");
  await box.press("Escape");
  await expect(box).toHaveCount(0);

  await t.locator(".cmt").first().getByRole("button", { name: "Reply" }).click();
  await t.getByLabel("Write a reply").fill("Thanks, that settles it for me.");
  await t.getByLabel("Write a reply").press("Enter");
  await expect(t.getByLabel("Write a reply")).toHaveCount(0);
  // Jun's thread already has Priya's answer and Kai's hidden spam reply.
  await expect(t.locator(".reply")).toHaveCount(3);
  await expect(t.locator(".reply").last()).toContainText("Thanks, that settles it for me.");
});
