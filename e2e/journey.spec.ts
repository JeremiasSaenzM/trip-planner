import { expect, test } from "@playwright/test";

import { getLatestMagicLink } from "./mailpit";

// e2e-tests.yml creates this exact user via Supabase's admin API before
// the suite runs -- login requires shouldCreateUser: false, so it must
// already exist. One continuous test, not several, covering every
// Phase 5 PR's write path in order as each one lands: the PKCE session
// cookie set during login has to carry through every later step, which
// only holds if it's all the same Playwright page/context, and starting
// fresh each time would mean re-doing the bootstrap flow just to get
// back to a usable state.
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e-test@example.com";

test("the full first-run journey, starting from a signed-out, empty account", async ({ page }) => {
  await test.step("log in via the magic link", async () => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByRole("button", { name: /email me a login link/i }).click();
    await expect(page.getByRole("status")).toContainText(TEST_EMAIL);

    const link = await getLatestMagicLink(TEST_EMAIL);
    await page.goto(link);
    await expect(page).toHaveURL("/");
  });

  await test.step("create a trip from the empty state", async () => {
    await expect(page.getByText("Start your trip")).toBeVisible();
    await page.getByLabel("Trip name").fill("Llangollen 2027");
    await page.getByRole("button", { name: "Create trip" }).click();
    await expect(page.getByText("Add a competition")).toBeVisible();
  });

  await test.step("add a competition", async () => {
    await page.getByLabel("Name").fill("Llangollen International Musical Eisteddfod");
    await page.getByLabel("City").fill("Llangollen");
    await page.getByLabel("Country").fill("United Kingdom");
    await page.getByLabel("Official festival dates: first day").fill("2027-07-06");
    await page.getByLabel("Official festival dates: final day").fill("2027-07-11");
    await page.getByLabel("Time zone").fill("Europe/London");
    await page.getByRole("button", { name: "Add competition" }).click();
    await expect(page.getByText("Create a scenario")).toBeVisible();
  });

  await test.step("create a scenario and reach the dashboard", async () => {
    await page.getByLabel("Name").fill("Llangollen 2027");
    await page.getByRole("button", { name: "Create scenario" }).click();
    await expect(page.getByText("Required monthly saving")).toBeVisible();
  });

  const availableBalance = page.getByTestId("available-balance");

  // TODO(PR5, budget lines): once a budget line/payment exists, add an
  // assertion here that "Required monthly saving" actually drops after
  // recording savings -- with none yet, it's already $0 and can't drop
  // any further, so "Available" rising is the only thing to check for now.
  await test.step("record a savings entry", async () => {
    await expect(availableBalance).toHaveText("$0");
    await page.getByLabel("Amount (USD)").fill("500");
    await page.getByLabel("Date").fill("2026-01-01");
    await page.getByLabel("Note (optional)").fill("First savings");
    await page.getByRole("button", { name: "Record" }).click();
    await expect(availableBalance).toHaveText("$500");
  });

  await test.step("edit the entry with a reason", async () => {
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("New amount (USD)").fill("600");
    await page.getByLabel("Reason for this change").fill("Added more than I first recorded");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(availableBalance).toHaveText("$600");
  });

  // Regression check: a save that changes nothing visible (same
  // amount, date and note) must still return the row to view mode --
  // it previously got stuck showing the edit form forever, since
  // nothing about the row's own props ever changed to signal success.
  await test.step("edit again with unchanged values and still returns to view mode", async () => {
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Reason for this change").fill("No change, just confirming this still works");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(availableBalance).toHaveText("$600");
  });

  await test.step("delete the entry with a reason", async () => {
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByLabel("Reason for deleting this").fill("Testing deletion");
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No savings recorded yet.")).toBeVisible();
    await expect(availableBalance).toHaveText("$0");
  });
});
