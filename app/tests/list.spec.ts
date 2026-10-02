import { expect, test, type Page } from "@playwright/test";
import { login, resetDb, TITLES } from "./helpers";

test.beforeAll(resetDb);
test.beforeEach(async ({ page }) => login(page));

const rows = (page: Page) => page.locator("a.row");
const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Library" }).getByRole("link", { name: new RegExp(`^${name}`) });
const streamLink = (page: Page, name: string) => page.getByRole("navigation", { name: "Streams" }).getByRole("link", { name: new RegExp(`^${name}`) });

test("library tabs show counts and filter the list", async ({ page }) => {
  await expect(tab(page, "All proposals")).toContainText("8");
  await expect(tab(page, "My proposals")).toContainText("2");
  await expect(tab(page, "Drafts")).toContainText("2");
  await expect(tab(page, "Following")).toContainText("1");
  await expect(rows(page)).toHaveCount(8);

  await tab(page, "My proposals").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My proposals");
  await expect(rows(page)).toHaveCount(2);
  await tab(page, "Following").click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(TITLES.meals);
});

test("rows show badges, score chips, author, version and comment count", async ({ page }) => {
  const hospital = rows(page).filter({ hasText: TITLES.hospital });
  await expect(hospital).toContainText("Priya Raman");
  await expect(hospital).toContainText("Updated 2 days ago");
  await expect(hospital).toContainText("v3");
  await expect(hospital.locator(".score-chip")).toHaveText(["Healthcare9", "Finance6", "Transport3"]);
  await expect(hospital.getByLabel("9 comments")).toBeVisible();
  await expect(rows(page).filter({ hasText: TITLES.telemedicine })).toContainText("Draft");
  await expect(rows(page).filter({ hasText: TITLES.telemedicine })).toContainText("Not published");
  await expect(rows(page).filter({ hasText: TITLES.legal })).toContainText("Unpublished changes");
});

test("stream filter narrows the list and toggles off", async ({ page }) => {
  await streamLink(page, "Healthcare").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Healthcare");
  await expect(page.getByText("3 proposals in all proposals")).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  // Inactive streams are hidden from the public filter.
  await expect(streamLink(page, "Agriculture")).toHaveCount(0);
  await streamLink(page, "Healthcare").click();
  await expect(rows(page)).toHaveCount(8);
});

test("search matches titles, people and streams, with an empty state", async ({ page }) => {
  const search = page.getByRole("textbox", { name: "Search proposals, people, streams" });
  await search.fill("procurement");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText("1 proposal matching “procurement”")).toBeVisible();
  await search.fill("Tomás");
  await expect(rows(page)).toHaveCount(1);
  await search.fill("Tourism");
  await expect(rows(page)).toHaveCount(1);
  await search.fill("no such thing");
  await expect(page.getByText("No proposals match")).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(rows(page)).toHaveCount(8);
  await expect(search).toHaveValue("");
});

test("searching from another screen jumps to the list", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("textbox", { name: "Search proposals, people, streams" }).fill("bus");
  await expect(page).toHaveURL(/\/\?q=bus/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(TITLES.bus);
});

test("sort by most discussed and by stream score", async ({ page }) => {
  await page.getByLabel("Sort").selectOption("discussed");
  await expect(rows(page).first()).toContainText(TITLES.hospital);
  await streamLink(page, "Finance").click();
  await expect(page.getByLabel("Sort").locator("option[value=score]")).toHaveText("Highest Finance score");
  await page.getByLabel("Sort").selectOption("score");
  await expect(rows(page).first()).toContainText(TITLES.procurement);
});
