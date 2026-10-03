import { expect, test } from "@playwright/test";
import { formError, login, resetDb, USERS } from "./helpers";

test.beforeAll(resetDb);

test("signed-out visitors are sent to the sign-in screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Better public decisions start as open proposals." })).toBeVisible();
  await page.goto("/settings");
  await expect(page).toHaveURL("/login");
});

test("sign-in validates the form and rejects a wrong password", async ({ page }) => {
  await page.goto("/login");
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await page.getByLabel("Email").fill("not-an-email");
  await submit.click();
  await expect(formError(page)).toHaveText("Enter a valid email address.");
  await page.getByLabel("Email").fill(USERS.maya.email);
  await submit.click();
  await expect(formError(page)).toHaveText("Enter your password.");
  await page.getByLabel("Password").fill("wrong-password");
  await submit.click();
  await expect(formError(page)).toHaveText("That email and password don't match an account.");
});

test("forgot password and national ID explain what to do", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot?" }).click();
  await expect(page.getByRole("status")).toContainText("Ask your administrator");
  await page.getByRole("button", { name: "Continue with national ID" }).click();
  await expect(page.getByRole("status")).toContainText("National ID sign-in isn't connected yet");
});

test("admin signs in, sees the account menu and signs out", async ({ page }) => {
  await login(page, "maya");
  await expect(page.getByRole("heading", { level: 1, name: "All proposals" })).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toContainText("Maya Chen");
  await expect(menu).toContainText("Admin");
  await expect(menu).toContainText(USERS.maya.email);
  await expect(menu.getByRole("menuitem", { name: "Admin settings" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});

test("a new citizen can create an account but not open admin settings", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await page.getByLabel("Full name").fill("Rosa Diaz");
  await page.getByLabel("Email").fill("rosa.diaz@example.org");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(formError(page)).toHaveText("Use a password of at least 8 characters.");
  await page.getByLabel("Password").fill("longenough1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveText("RD");
  await expect(page.getByRole("link", { name: "Admin settings" })).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Admins only" })).toBeVisible();

  // Signing up again with the same email is refused.
  await page.context().clearCookies();
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Rosa Diaz");
  await page.getByLabel("Email").fill("rosa.diaz@example.org");
  await page.getByLabel("Password").fill("longenough1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(formError(page)).toContainText("already exists");
});
