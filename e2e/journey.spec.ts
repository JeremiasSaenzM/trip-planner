import { readFileSync } from "node:fs";

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

// /budget-lines always renders both AddBudgetLineForm and AddFxRateForm
// at once -- each has its own "Currency" label, so every lookup below
// is scoped to one form or the other rather than relying on there being
// only one match.
function budgetLineAddForm(page: Page) {
  return page.locator("form").filter({ has: page.getByRole("button", { name: "Add budget line" }) });
}

function fxRateAddForm(page: Page) {
  return page.locator("form").filter({ hasText: "Add an FX rate" });
}

// Same reasoning as paymentRow() above: scopes to the one Card whose
// text includes the given budget line's own description.
function budgetLineRow(page: Page, description: string) {
  return page.locator("div.rounded-xl").filter({ hasText: description });
}

// A missing-rate row names its currency and which kind it's missing --
// scoping by the kind's own label text is enough since this suite only
// ever has one non-USD currency in play at a time.
function missingRateRow(page: Page, rateKindLabel: string) {
  return page.locator("li").filter({ hasText: rateKindLabel });
}

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

    // exact: true -- a substring match would also hit the "$500.00 due
    // later" line (paidAmount is still 0, so dueLater equals the new total).
    await expect(row.getByText("$500.00", { exact: true })).toBeVisible();
  });

  const tripCostRangeTarget = page.getByTestId("trip-cost-range-target");

  await test.step("add a non-USD budget line and see the missing-rate caveat", async () => {
    await page.goto("/");
    const targetBefore = parseUsd(await tripCostRangeTarget.innerText());

    await page.goto("/budget-lines");
    const addForm = budgetLineAddForm(page);
    await addForm.getByLabel("Description").fill("Flight deposit");
    await addForm.getByLabel("Budget category").selectOption("B");
    await addForm.getByLabel("Minimum").fill("90");
    await addForm.getByLabel("Target").fill("100");
    await addForm.getByLabel("Conservative").fill("120");
    await addForm.getByLabel("Currency").fill("EUR");
    await addForm.getByRole("button", { name: "Add budget line" }).click();

    await expect(budgetLineRow(page, "Flight deposit")).toBeVisible();
    await expect(missingRateRow(page, "Planning (base)")).toBeVisible();
    await expect(missingRateRow(page, "Planning (conservative)")).toBeVisible();

    // Excluded from the cost range while its rate is missing -- adding
    // the line alone must not move the figure yet.
    await page.goto("/");
    const targetStillExcluded = parseUsd(await tripCostRangeTarget.innerText());
    expect(targetStillExcluded).toBe(targetBefore);
  });

  await test.step("add the matching FX rates and watch the caveat clear and the cost range change", async () => {
    await page.goto("/");
    const targetWhileMissing = parseUsd(await tripCostRangeTarget.innerText());

    await page.goto("/budget-lines");
    for (const [index, kindLabel] of ["Planning (base)", "Planning (conservative)"].entries()) {
      await missingRateRow(page, kindLabel).getByRole("button", { name: "Add this rate" }).click();

      const fxForm = fxRateAddForm(page);
      await fxForm.getByLabel("Rate to USD").fill("1.1");
      // exact: true -- with no sources yet the new-source fields are
      // already showing, and "Source Observation date" is a
      // case-insensitive substring match for plain "Date" otherwise.
      await fxForm.getByLabel("Date", { exact: true }).fill("2024-01-01");
      if (index === 0) {
        // Regression check: no source exists yet on this account, so the
        // new-source fields must already be showing, with no selectOption
        // first. selectOption("__new__") would hide the bug -- Playwright
        // fires a change event even when the value doesn't change, while
        // a real browser doesn't, and "Add a new source…" used to be the
        // option the browser already showed as selected.
        await expect(fxForm.getByLabel("Source Provider")).toBeVisible();
        await expect(fxForm.getByLabel("Source Tier")).toBeVisible();
        await expect(fxForm.getByLabel("Source URL (optional)")).toBeVisible();
        await expect(fxForm.getByLabel("Source Observation date")).toBeVisible();
        await expect(fxForm.getByLabel("Source Applicable period (optional) From")).toBeVisible();
        await expect(fxForm.getByLabel("Source Applicable period (optional) To")).toBeVisible();
        // Visible labels, not just accessible names -- the three date
        // inputs used to render side by side with nothing on screen to
        // tell the observation date from the applicable period.
        for (const text of ["Provider", "Tier", "URL (optional)", "Observation date", "Applicable period (optional)"]) {
          await expect(fxForm.getByText(text, { exact: true })).toBeVisible();
        }
      } else {
        // The first iteration's source now exists, so the picker starts
        // on its "Choose a source" placeholder and picking "Add a new
        // source…" is a real change.
        await expect(fxForm.getByLabel("Source Provider")).toHaveCount(0);
        await fxForm.getByLabel("Source", { exact: true }).selectOption("__new__");
      }
      await fxForm.getByLabel("Source Provider").fill("Fictional FX source");
      await fxForm.getByLabel("Source Tier").selectOption("6");
      await fxForm.getByLabel("Source Observation date").fill("2024-01-01");
      await fxForm.getByRole("button", { name: "Add rate" }).click();

      await expect(missingRateRow(page, kindLabel)).toHaveCount(0);
    }

    await expect(page.getByText("Missing rates")).not.toBeVisible();

    await page.goto("/");
    const targetAfter = parseUsd(await tripCostRangeTarget.innerText());
    expect(targetAfter).toBeGreaterThan(targetWhileMissing);
  });

  await test.step("edit the budget line with a reason", async () => {
    await page.goto("/budget-lines");
    const row = budgetLineRow(page, "Flight deposit");

    await row.getByRole("button", { name: "Edit" }).click();
    // Stays within min (90) <= target <= conservative (120) --
    // budget_lines_amount_order is enforced client-side too (see
    // amountsInOrder in budget-line-write-ui.tsx), so a save that broke
    // it would never even reach the server to prove anything.
    await row.getByLabel("New target").fill("110");
    await row.getByLabel("Reason for this change").fill("Flight price went up");
    await row.getByRole("button", { name: "Save" }).click();

    await expect(row.getByText("€110.00")).toBeVisible();
  });

  await test.step("try \"confirmed\" with no source and see it refused", async () => {
    const row = budgetLineRow(page, "Flight deposit");

    await row.getByRole("button", { name: "Edit" }).click();
    await row.getByLabel("New information state").selectOption("confirmed");
    await row.getByLabel("Reason for this change").fill("Trying to confirm with no source");
    await row.getByRole("button", { name: "Save" }).click();

    await expect(row.getByText("Confirmed needs a source")).toBeVisible();
    // Refused client-side -- the row is still showing the edit form,
    // never submitted, so the line itself is unchanged.
    await expect(row.getByRole("button", { name: "Save" })).toBeVisible();
  });

  // The journey's only savings entry so far was recorded, edited, and
  // then deleted earlier (see "delete the entry with a reason") -- a
  // fresh one here is what the export step below actually checks for,
  // rather than relying on something this run already deleted.
  await test.step("record a fresh savings entry for the export check", async () => {
    await page.goto("/");
    await page.getByLabel("Amount (USD)").fill("75");
    await page.getByLabel("Date", { exact: true }).fill("2026-02-01");
    await page.getByLabel("Note (optional)").fill("For the export check");
    await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByText("For the export check")).toBeVisible();
  });

  await test.step("export my data and check its contents", async () => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Export" }).click();
    await expect(page).toHaveURL("/export");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download my data" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^trip-planner-export-\d{4}-\d{2}-\d{2}\.json$/);

    const path = await download.path();
    const exported = JSON.parse(readFileSync(path!, "utf-8"));

    expect(typeof exported.exportedAt).toBe("string");
    expect(exported.schemaVersion).toBe(1);

    expect(
      exported.data.savingsEntries.some((entry: { note: string | null }) => entry.note === "For the export check"),
    ).toBe(true);
    expect(
      exported.data.payments.some((payment: { description: string }) => payment.description === "Registration fee"),
    ).toBe(true);
    expect(exported.data.changeLog.length).toBeGreaterThan(0);
  });
});
