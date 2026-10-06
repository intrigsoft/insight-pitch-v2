// Proposal teams: joining, invites, the lead role, and change requests merged by the lead.
import { expect, test, type Page } from "@playwright/test";
import { login, openProposal, resetDb, TITLES } from "./helpers";

test.beforeEach(() => resetDb());

const toast = (page: Page, text: string | RegExp) => expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();
const team = (page: Page) => page.getByRole("region", { name: "Team" });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Manage team" });

async function switchTo(page: Page, who: Parameters<typeof login>[1]) {
  await page.context().clearCookies();
  await login(page, who);
}

test("the lead sees the team, open roles and join requests, and approves one", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.legal);
  await expect(team(page)).toContainText("3 members");
  await expect(team(page)).toContainText("Maya Chen (you)");
  await expect(team(page)).toContainText("Looking for");
  await expect(team(page)).toContainText("Check the coordinator and desk costs");
  await team(page).getByRole("button", { name: /Manage team/ }).click();
  await expect(drawer(page)).toContainText("2 pending");
  await expect(drawer(page)).toContainText("3 of 6");
  const ava = drawer(page).getByTestId("join-request").filter({ hasText: "Ava Moreau" });
  await ava.getByRole("button", { name: "Approve" }).click();
  await toast(page, "Ava joined the team · Finance role filled");
  await expect(drawer(page)).toContainText("4 of 6");
  await expect(drawer(page)).not.toContainText("Check the coordinator and desk costs");
  // Blocking stops someone asking again, and can be undone.
  await drawer(page).getByTestId("join-request").filter({ hasText: "Kai Moreno" }).getByRole("button", { name: "Block" }).click();
  await toast(page, "Kai can no longer ask to join this proposal");
  await expect(drawer(page)).toContainText("No pending requests.");
  await expect(drawer(page).getByText("Blocked", { exact: true })).toBeVisible();
  await drawer(page).getByRole("button", { name: "Unblock" }).click();
  await toast(page, "Kai unblocked");
  await page.keyboard.press("Escape");
  await expect(team(page)).toContainText("4 members");
  await expect(team(page)).toContainText("Ava Moreau");
});

test("someone outside the team asks to join, sees it pending, and withdraws", async ({ page }) => {
  await login(page, "lena");
  await openProposal(page, TITLES.legal);
  await team(page).getByRole("button", { name: "Ask to join" }).click();
  const dlg = page.getByRole("dialog", { name: "Ask to join" });
  await expect(dlg).toContainText("Maya reviews each request");
  await expect(dlg.getByRole("radio", { name: /Finance/ })).toHaveAttribute("aria-checked", "true");
  await dlg.getByRole("textbox").fill("Too short");
  await dlg.getByRole("button", { name: "Send request" }).click();
  await expect(dlg).toContainText("Say a little more about what you’d bring.");
  await dlg.getByRole("textbox").fill("I sit on the school board budget committee and can check the running costs.");
  await dlg.getByRole("button", { name: "Send request" }).click();
  await toast(page, "Request sent to Maya");
  await expect(team(page)).toContainText(/Request sent .* · Finance/);
  await team(page).getByRole("button", { name: "Withdraw" }).click();
  await toast(page, "Request withdrawn");
  await expect(team(page).getByRole("button", { name: "Ask to join" })).toBeVisible();
});

test("join rules: closed teams, a declined request's wait, and a pending request", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.meals);
  await expect(team(page)).toContainText("Lena isn’t taking join requests for this proposal.");
  await openProposal(page, TITLES.heritage);
  await expect(team(page)).toContainText(/Your last request was declined. You can ask again in \d+ days?\./);
  await openProposal(page, TITLES.registry);
  await expect(team(page)).toContainText(/Request sent .* · Law & Justice/);
});

test("an invite is accepted, and the new member can suggest changes", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.legal);
  await team(page).getByRole("button", { name: /Manage team/ }).click();
  await drawer(page).getByLabel("Person").selectOption({ label: "Lena Fischer · Citizen" });
  await drawer(page).getByLabel("Area").selectOption({ label: "Education" });
  await drawer(page).getByRole("button", { name: "Send invite" }).click();
  await toast(page, "Invite sent to Lena Fischer");
  await expect(drawer(page)).toContainText(/Lena Fischer · Education · sent/);

  await switchTo(page, "lena");
  await openProposal(page, TITLES.legal);
  const invite = page.getByTestId("team-invite");
  await expect(invite).toContainText("Maya Chen invited you to join the team for Education.");
  await invite.getByRole("button", { name: "Join team" }).click();
  await toast(page, "You joined the team. You can now suggest changes.");
  await expect(team(page)).toContainText("Lena Fischer (you)");
  await expect(page.getByRole("link", { name: "Suggest changes" })).toBeVisible();
  await expect(page.getByText("Maya reviews your changes before anything is published.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Follow/ })).toHaveCount(0);
});

test("the lead role changes hands when the offer is accepted", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.hospital);
  const offer = page.getByTestId("lead-offer");
  await expect(offer).toContainText("Priya Raman offered you the lead role.");
  await expect(offer).toContainText("I move to the national planning office");
  await offer.getByRole("button", { name: "Accept" }).click();
  await toast(page, "You’re now the lead. Priya stays on as a contributor.");
  await expect(page.getByRole("link", { name: "Edit as new version" })).toBeVisible();
  await expect(team(page).getByRole("button", { name: /Manage team/ })).toBeVisible();
  // The list now shows Maya as the lead.
  await page.goto("/");
  const row = page.locator(".row").filter({ hasText: TITLES.hospital });
  await expect(row).toContainText("Maya Chen");
  await expect(row).toContainText("and 2 others");
});

test("a member's change request is reviewed, merged into the draft and credited on publish", async ({ page }) => {
  // Daniel, a member of the legal aid team, suggests a new title.
  await login(page, "daniel");
  await openProposal(page, TITLES.legal);
  await page.getByRole("link", { name: "Suggest changes" }).click();
  await expect(page.getByText("Suggesting changes to v1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  const title = page.getByLabel("Proposal title");
  await title.fill("Free legal aid desks at every district court");
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dlg = page.getByRole("dialog", { name: "Submit change request" });
  await expect(dlg).toContainText("Changes since v1");
  await expect(dlg.getByRole("textbox")).not.toHaveValue("", { timeout: 30_000 });
  await dlg.getByRole("textbox").fill("Call them desks in the title");
  await dlg.getByRole("button", { name: "Submit change request" }).click();
  await toast(page, "Change request sent to Maya");
  await expect(page.getByRole("navigation", { name: "Change requests" })).toContainText("Call them desks in the title");

  // Maya reviews it: one clean change, accepted and merged into her draft.
  await switchTo(page, "maya");
  await openProposal(page, TITLES.legal);
  const crs = page.getByRole("navigation", { name: "Change requests" });
  await expect(crs).toContainText("3 open");
  await crs.getByRole("link", { name: /Call them desks in the title/ }).click();
  await expect(page.getByText("Needs your review")).toBeVisible();
  await expect(page.getByText("0 of 1 decided")).toBeVisible();
  const hunk = page.getByTestId("cr-hunk");
  await expect(hunk).toContainText("Title");
  await hunk.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("1 of 1 decided")).toBeVisible();
  await page.getByRole("button", { name: "Merge into draft" }).click();
  await toast(page, "Merged 1 change into your draft. Publish when you’re ready.");
  await expect(page).toHaveURL(/\/proposals\/[0-9a-f-]{36}$/);
  await expect(crs.getByRole("link", { name: /Call them desks/ })).toContainText("Merged");

  // Publishing the draft credits Daniel.
  await page.getByRole("link", { name: "Continue draft" }).click();
  await expect(page.getByLabel("Proposal title")).toHaveValue("Free legal aid desks at every district court");
  await page.getByRole("button", { name: /Publish v2/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Free legal aid desks at every district court", { timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Version history" })).toContainText("Maya Chen with Daniel");
});

test("a conflicting change is resolved with a combined version", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.legal);
  await page.getByRole("navigation", { name: "Change requests" }).getByRole("link", { name: /supervised by a practising lawyer/ }).click();
  const conflict = page.getByTestId("cr-conflict");
  await expect(conflict).toContainText("Both changed");
  await expect(conflict).toContainText("You and Sam both edited this since v1.");
  await expect(page.getByText("1 overlaps with edits made since v1")).toBeVisible();
  await conflict.getByRole("button", { name: "Write a combined version instead" }).click();
  const combined = conflict.getByRole("textbox", { name: "Combined version" });
  await combined.fill("Open a free legal aid desk in every district court, staffed three days a week by volunteer lawyers and final-year law students supervised by a practising lawyer, with one full-time coordinator.");
  await page.getByRole("button", { name: "Merge into draft" }).click();
  await toast(page, "Merged 1 change into your draft.");
  await page.getByRole("link", { name: "Continue draft" }).click();
  await expect(page.getByRole("textbox", { name: "Proposal body" })).toContainText("final-year law students supervised by a practising lawyer, with one full-time coordinator.");
});

test("a change request sent back is updated and resubmitted by its author", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.legal);
  await page.getByRole("navigation", { name: "Change requests" }).getByRole("link", { name: /Named the case types/ }).click();
  await page.getByRole("button", { name: "Send back to Daniel" }).click();
  await toast(page, "Sent back to Daniel");

  await switchTo(page, "daniel");
  await openProposal(page, TITLES.legal);
  await page.getByRole("navigation", { name: "Change requests" }).getByRole("link", { name: /Named the case types/ }).click();
  await expect(page.getByText("Sent back to you to update")).toBeVisible();
  await page.getByRole("link", { name: "Update and resubmit" }).click();
  await expect(page.getByRole("textbox", { name: "Proposal body" })).toContainText("family, tenancy and debt disputes");
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dlg = page.getByRole("dialog", { name: "Submit change request" });
  await expect(dlg.getByRole("textbox")).toHaveValue("Named the case types the desks would cover");
  await dlg.getByRole("button", { name: "Submit change request" }).click();
  await toast(page, "Change request sent to Maya");
  await expect(page.getByRole("navigation", { name: "Change requests" }).getByRole("link", { name: /Named the case types/ })).toContainText("Open");
});

test("team members see the draft before it's published; others don't", async ({ page }) => {
  await login(page);
  await openProposal(page, TITLES.telemedicine);
  await expect(page.getByText("This proposal is a draft. Only the team can see it until it's published.")).toBeVisible();
  await team(page).getByRole("button", { name: /Manage team/ }).click();
  await expect(drawer(page)).toContainText("Join requests open once the proposal is published.");
  await drawer(page).getByLabel("Person").selectOption({ label: "Daniel Okafor · Citizen" });
  await drawer(page).getByRole("button", { name: "Send invite" }).click();
  await toast(page, "Invite sent to Daniel Okafor");
  const url = page.url();

  await switchTo(page, "lena");
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();

  await switchTo(page, "daniel");
  await openProposal(page, TITLES.telemedicine);
  await page.getByTestId("team-invite").getByRole("button", { name: "Join team" }).click();
  await toast(page, "You joined the team.");
  await expect(page.getByText("You can suggest changes once v1 is published.")).toBeVisible();
  await page.goto("/?tab=mine");
  await expect(page.locator(".row").filter({ hasText: TITLES.telemedicine })).toBeVisible();
});
