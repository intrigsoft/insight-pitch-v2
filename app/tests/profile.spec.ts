// Profiles: reached from the account menu and from any author's name.
import { expect, test, type Page } from "@playwright/test";
import { login, openProposal, resetDb, TITLES, USERS } from "./helpers";

test.beforeEach(() => resetDb());

const tab = (page: Page, name: string) => page.locator(".profile-tabs").getByRole("link", { name: new RegExp(name) });

test("your profile shows your proposals, drafts, comments and private strengths", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Your profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: USERS.maya.name })).toBeVisible();
  await expect(page.getByText("This is you")).toBeVisible();
  await expect(page.locator(".role-pill")).toHaveText("Admin");
  await expect(page.getByText("Policy advisor, Ministry of Public Administration · Capital district")).toBeVisible();

  // Drafts are listed on your own profile.
  await expect(tab(page, "Proposals")).toContainText("2");
  await expect(page.locator(".rows").getByText(TITLES.telemedicine)).toBeVisible();
  await expect(page.locator(".rows .pill-amber").first()).toBeVisible();

  const strengths = page.getByTestId("strengths");
  await expect(strengths).toContainText("Only you can see your strengths");
  await expect(strengths.locator(".strength").first()).toContainText("Law & Justice");

  await tab(page, "Comments").click();
  await expect(page).toHaveURL(/tab=comments/);
  const comment = page.getByTestId("profile-comment").first();
  await expect(comment).toContainText("Replied to Daniel on");
  await expect(comment).toContainText(TITLES.legal);
  await comment.getByRole("link", { name: TITLES.legal }).click();
  await expect(page.getByRole("heading", { level: 1, name: TITLES.legal })).toBeVisible();
});

test("strengths are only shown to others once made public", async ({ page, browser }) => {
  await login(page, "priya");
  await page.goto("/");
  await page.locator(".row").filter({ hasText: TITLES.procurement }).getByRole("link", { name: "Daniel Okafor" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Daniel Okafor" })).toBeVisible();
  await expect(page.getByTestId("strengths")).toBeVisible();

  // Maya's strengths are private: Priya sees the streams she is active in instead.
  await openProposal(page, TITLES.legal);
  await page.locator(".byline").getByRole("link", { name: USERS.maya.name }).click();
  await expect(page.getByRole("heading", { level: 1, name: USERS.maya.name })).toBeVisible();
  await expect(page.getByTestId("strengths")).toHaveCount(0);
  await expect(page.getByText("Active in")).toBeVisible();
  const mayaUrl = page.url();

  const maya = await browser.newPage();
  await login(maya);
  await maya.goto(mayaUrl);
  await maya.getByRole("switch", { name: "Public" }).click();
  await expect(maya.getByText("Visible to everyone on your profile")).toBeVisible();
  await maya.close();

  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("strengths")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(page.getByText("Active in")).toHaveCount(0);
});

test("editing your profile updates your name, bio and languages", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Your profile" }).click();
  await page.getByRole("button", { name: "Edit profile" }).click();
  const drawer = page.getByRole("dialog", { name: "Edit profile" });
  await expect(drawer).toContainText("Role · Admin");

  await drawer.getByLabel("Display name").fill("");
  await drawer.getByRole("button", { name: "Save profile" }).click();
  await expect(drawer.getByRole("alert")).toHaveText("Add your name.");

  await drawer.getByLabel("Display name").fill("Maya Ortiz");
  await drawer.getByLabel("Bio").fill("x".repeat(281));
  await expect(drawer.getByText("281/280")).toBeVisible();
  await drawer.getByRole("button", { name: "Save profile" }).click();
  await expect(drawer.getByRole("alert")).toHaveText("Keep your bio under 280 characters.");

  await drawer.getByLabel("Bio").fill("Policy advisor working on access to justice.");
  await drawer.getByLabel("Location").fill("Old Town");
  await drawer.getByRole("button", { name: "தமிழ்" }).click();
  await drawer.getByRole("button", { name: "Save profile" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText("Profile updated")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Maya Ortiz" })).toBeVisible();
  await expect(page.getByText("Policy advisor working on access to justice.")).toBeVisible();
  await expect(page.locator(".pa-details")).toContainText("Old Town");
  await expect(page.locator(".pa-details")).toContainText("English, සිංහල, தமிழ்");
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveText("MO");
});

test("following a person adds their proposals to your Following list", async ({ page }) => {
  await login(page, "lena");
  await page.goto("/?tab=following");
  await expect(page.getByText(TITLES.bus)).toHaveCount(0);

  await page.goto("/");
  await page.locator(".row").filter({ hasText: TITLES.bus }).locator(".author-link").click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const follow = page.getByRole("button", { name: "Follow" });
  await follow.click();
  await expect(page.getByRole("button", { name: "Following ✓" })).toBeVisible();
  await expect(page.getByText(/You’ll be notified when \w+ publishes/)).toBeVisible();

  await page.goto("/?tab=following");
  await expect(page.locator(".rows").getByText(TITLES.bus)).toBeVisible();
});

test("comment authors link to their profiles", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  const thread = page.getByTestId("comment-thread").first();
  const name = await thread.locator(".an .name-link").first().textContent();
  await thread.locator(".an .name-link").first().click();
  await expect(page.getByRole("heading", { level: 1, name: name! })).toBeVisible();
  await tab(page, "Comments").click();
  await expect(page.getByTestId("profile-comment").filter({ hasText: TITLES.hospital }).first()).toBeVisible();
});

test("strengths are reassessed by AI after the person comments", async ({ page }) => {
  test.skip(!process.env.TYPESAFE_API_KEY, "needs TYPESAFE_API_KEY");
  await login(page, "lena");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Your profile" }).click();
  const strengths = page.getByTestId("strengths");
  await expect(strengths).toContainText("Calculated from your proposals");
  const profileUrl = page.url();

  await openProposal(page, TITLES.bus);
  await page.getByLabel("Add to the discussion").fill(
    "Battery buses lose range in hot weather. The pilot should log range on both routes in summer and plan depot charging around it.",
  );
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Battery buses lose range in hot weather").first()).toBeVisible({ timeout: 60_000 });

  await page.goto(profileUrl);
  await expect(async () => {
    await page.reload();
    await expect(strengths).toContainText("Assessed by AI", { timeout: 1000 });
  }).toPass({ timeout: 90_000 });
  await expect(strengths).toContainText("Transport");
});
