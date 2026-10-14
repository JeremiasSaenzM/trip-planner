import { expect, test, type Page } from "@playwright/test";

import { getLatestMagicLink } from "./mailpit";

function parseUsd(text: string): number {
  return Number(text.replace(/[^0-9.-]/g, ""));
}

// The Payments page lists every row with the same "Change status" /
// "Edit" / "Delete" labels -- this scopes to the one Card whose text
// includes the given payment's description, the same way a person
// would find it by eye.
function paymentRow(page: Page, description: string) {
  return page.locator("div.rounded-xl").filter({ hasText: description });
}

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
  const requiredMonthlySaving = page.getByTestId("required-monthly-saving");

  await test.step("add a payment and watch required monthly saving rise", async () => {
    await expect(requiredMonthlySaving).toHaveText("$0");

    await page.goto("/payments");
    await page.getByLabel("Description").fill("Registration fee");
    await page.getByLabel("Budget category").selectOption("A");
    await page.getByLabel("Amount").fill("300");
    await page.getByLabel("Refundability").selectOption("refundable");
    await page.getByLabel("Timing").selectOption("due_on_date");
    await page.getByLabel("Due date (optional)").fill("2027-02-01");
    await page.getByRole("button", { name: "Add payment" }).click();
    // exact: true -- a substring match would also hit the budget-line
    // picker's new option for this same line ("Registration fee (A) —
    // $300.00"), now that it exists to be picked for a later payment.
    await expect(page.getByText("Registration fee", { exact: true })).toBeVisible();

    await page.goto("/");
    const required = parseUsd(await requiredMonthlySaving.innerText());
    expect(required).toBeGreaterThan(0);
  });

  await test.step("record a savings entry, and watch required monthly saving drop", async () => {
    const requiredBefore = parseUsd(await requiredMonthlySaving.innerText());

    await expect(availableBalance).toHaveText("$0");
    await page.getByLabel("Amount (USD)").fill("100");
    // exact: true -- now that a payment exists, the Savings schedule
    // chart renders a real legend (empty before), and Recharts' own
    // "<series name> legend icon" aria-label on its SVG icon is a
    // case-insensitive substring match for plain "Date" otherwise.
    await page.getByLabel("Date", { exact: true }).fill("2026-01-01");
    await page.getByLabel("Note (optional)").fill("First savings");
    await page.getByRole("button", { name: "Record" }).click();
    await expect(availableBalance).toHaveText("$100");

    const requiredAfter = parseUsd(await requiredMonthlySaving.innerText());
    expect(requiredAfter).toBeLessThan(requiredBefore);
  });

  await test.step("edit the entry with a reason", async () => {
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("New amount (USD)").fill("150");
    await page.getByLabel("Reason for this change").fill("Added more than I first recorded");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(availableBalance).toHaveText("$150");
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
    await expect(availableBalance).toHaveText("$150");
  });

  await test.step("delete the entry with a reason", async () => {
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByLabel("Reason for deleting this").fill("Testing deletion");
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No savings recorded yet.")).toBeVisible();
    await expect(availableBalance).toHaveText("$0");
  });

  await test.step("add a non-refundable, competition-related payment", async () => {
    await page.goto("/payments");
    await page.getByLabel("Description").fill("Accommodation deposit");
    await page.getByLabel("Budget category").selectOption("C");
    await page.getByLabel("Amount").fill("200");
    await page.getByLabel("Refundability").selectOption("non_refundable");
    await page.getByLabel("Timing").selectOption("due_on_date");
    await page.getByLabel("Due date (optional)").fill("2027-03-01");
    await page.getByLabel(/tied to the competition itself/i).check();
    await page.getByRole("button", { name: "Add payment" }).click();
    // exact: true -- same reason as "Registration fee" above: a
    // substring match would also hit this line's own new option in
    // the budget-line picker.
    await expect(page.getByText("Accommodation deposit", { exact: true })).toBeVisible();
  });

  await test.step("hit the acceptance safeguard, then accept the risk", async () => {
    const row = paymentRow(page, "Accommodation deposit");

    await row.getByRole("button", { name: "Change status" }).click();
    await row.getByLabel("New status").selectOption("committed");
    await row.getByLabel("Reason for this change").fill("Trying to commit before acceptance");
    await row.getByRole("button", { name: "Save" }).click();

    await expect(row.getByRole("button", { name: "I accept this risk" })).toBeVisible();

    await row.getByLabel("Why you're accepting this risk").fill("Deposit is small enough to risk");
    await row.getByRole("button", { name: "I accept this risk" }).click();

    await expect(row.getByText("Committed")).toBeVisible();
  });

  await test.step("raise the committed payment's amount past what was accepted, then accept the new amount", async () => {
    const row = paymentRow(page, "Accommodation deposit");

    await row.getByRole("button", { name: "Edit" }).click();
    await row.getByLabel("New total amount").fill("500");
    await row.getByLabel("Reason for this change").fill("Deposit turned out to be higher");
    await row.getByRole("button", { name: "Save" }).click();

    await expect(row.getByRole("button", { name: "I accept this risk" })).toBeVisible();

    await row.getByLabel("Why you're accepting this risk").fill("Still worth it at the new amount");
    await row.getByRole("button", { name: "I accept this risk" }).click();

    await expect(row.getByText("$500.00")).toBeVisible();
  });
});
