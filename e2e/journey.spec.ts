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
  return page.locator("form").filter({ has: page.getByRole("button", { name: "Add budget line", exact: true }) });
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

// /scenarios lists each scenario's competition by name, and the Add
// forms' competition pickers list every competition too -- so a card
// is found inside its own section, never page-wide by text alone.
function scenariosSection(page: Page, heading: "Travel window" | "Scenarios" | "Competitions") {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
}

function scenarioCard(page: Page, name: string) {
  return scenariosSection(page, "Scenarios").locator("div.rounded-xl").filter({ hasText: name });
}

function competitionCard(page: Page, name: string) {
  return scenariosSection(page, "Competitions").locator("div.rounded-xl").filter({ hasText: name });
}

// Scoped inside their own list's data-testid, not just by text: the
// Itinerary card above them (checks, and the generated night-by-night
// strip) names the same locations and movements, so a page-wide
// div.rounded-xl text filter resolves to several ancestors at once.
function stayRow(page: Page, location: string) {
  return page.getByTestId("stays-list").locator("div.rounded-xl").filter({ hasText: location });
}

function movementRow(page: Page, label: string) {
  return page.getByTestId("movements-list").locator("div.rounded-xl").filter({ hasText: label });
}

function flightOptionCard(page: Page, label: string) {
  return page.getByTestId("flight-option-card").filter({ has: page.getByText(label, { exact: true }) });
}

// /import/[batch] numbers each proposal "Item n" -- found by that exact
// label, since an item's own text (a scenario's name, say) also shows up
// in every later item that references it.
function proposalCard(page: Page, n: number) {
  return page.getByTestId("proposal-item").filter({ has: page.getByText(`Item ${n}`, { exact: true }) });
}

test("the full first-run journey, starting from a signed-out, empty account", async ({ page }) => {
  // One long journey on purpose (each step builds on the last), so it
  // gets more than Playwright's default 30 s for the whole test. Phase
  // 6.5b added more steps (a location round-trip, an extra proposal
  // item) than the previous budget had headroom for.
  test.setTimeout(180_000);

  await test.step("log in via the magic link", async () => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByRole("button", { name: /email me a login link/i }).click();
    await expect(page.getByRole("status")).toContainText(TEST_EMAIL);

    const link = await getLatestMagicLink(TEST_EMAIL);
    await page.goto(link);
    await expect(page).toHaveURL("/");
  });

  await test.step("switch the theme with the header toggle", async () => {
    await expect(page.getByRole("radio", { name: "System", exact: true })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("radio", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");

    // No flash of the wrong theme: the choice survives a reload because
    // the inline head script (not a useEffect) applies it before paint.
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("radio", { name: "Light", exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");

    // System follows the OS preference live, not just at load.
    await page.getByRole("radio", { name: "System", exact: true }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  await test.step("create a trip from the empty state", async () => {
    await expect(page.getByText("Start your trip")).toBeVisible();
    await page.getByLabel("Trip name").fill("Thornmere 2029");
    await page.getByRole("button", { name: "Create trip", exact: true }).click();
    await expect(page.getByText("Add a competition")).toBeVisible();
  });

  await test.step("add a competition", async () => {
    await page.getByLabel("Name").fill("Thornmere International Choir Festival");
    await page.getByLabel("City").fill("Thornmere");
    await page.getByLabel("Country").fill("United Kingdom");
    await page.getByLabel("Official festival dates: first day").fill("2029-11-06");
    await page.getByLabel("Official festival dates: final day").fill("2029-11-11");
    await page.getByLabel("Time zone").fill("Europe/London");
    await page.getByRole("button", { name: "Add competition", exact: true }).click();
    await expect(page.getByText("Create a scenario")).toBeVisible();
  });

  await test.step("create a scenario and reach the dashboard", async () => {
    await page.getByLabel("Name").fill("Thornmere 2029");
    await page.getByRole("button", { name: "Create scenario", exact: true }).click();
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
    await page.getByRole("button", { name: "Add payment", exact: true }).click();
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
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect(availableBalance).toHaveText("$100");

    const requiredAfter = parseUsd(await requiredMonthlySaving.innerText());
    expect(requiredAfter).toBeLessThan(requiredBefore);
  });

  await test.step("edit the entry with a reason", async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("New amount (USD)").fill("150");
    await page.getByLabel("Reason for this change").fill("Added more than I first recorded");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(availableBalance).toHaveText("$150");
  });

  // Regression check: a save that changes nothing visible (same
  // amount, date and note) must still return the row to view mode --
  // it previously got stuck showing the edit form forever, since
  // nothing about the row's own props ever changed to signal success.
  await test.step("edit again with unchanged values and still returns to view mode", async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Reason for this change").fill("No change, just confirming this still works");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
    await expect(availableBalance).toHaveText("$150");
  });

  await test.step("delete the entry with a reason", async () => {
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByLabel("Reason for deleting this").fill("Testing deletion");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
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
    await page.getByRole("button", { name: "Add payment", exact: true }).click();
    // exact: true -- same reason as "Registration fee" above: a
    // substring match would also hit this line's own new option in
    // the budget-line picker.
    await expect(page.getByText("Accommodation deposit", { exact: true })).toBeVisible();
  });

  await test.step("hit the acceptance safeguard, then accept the risk", async () => {
    const row = paymentRow(page, "Accommodation deposit");

    await row.getByRole("button", { name: "Change status", exact: true }).click();
    await row.getByLabel("New status").selectOption("committed");
    await row.getByLabel("Reason for this change").fill("Trying to commit before acceptance");
    await row.getByRole("button", { name: "Save", exact: true }).click();

    await expect(row.getByRole("button", { name: "I accept this risk", exact: true })).toBeVisible();

    await row.getByLabel("Why you're accepting this risk").fill("Deposit is small enough to risk");
    await row.getByRole("button", { name: "I accept this risk", exact: true }).click();

    await expect(row.getByText("Committed")).toBeVisible();
  });

  await test.step("raise the committed payment's amount past what was accepted, then accept the new amount", async () => {
    const row = paymentRow(page, "Accommodation deposit");

    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await row.getByLabel("New total amount").fill("500");
    await row.getByLabel("Reason for this change").fill("Deposit turned out to be higher");
    await row.getByRole("button", { name: "Save", exact: true }).click();

    await expect(row.getByRole("button", { name: "I accept this risk", exact: true })).toBeVisible();

    await row.getByLabel("Why you're accepting this risk").fill("Still worth it at the new amount");
    await row.getByRole("button", { name: "I accept this risk", exact: true }).click();

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
    await addForm.getByLabel("Confidence", { exact: true }).selectOption("low");
    await addForm.getByRole("button", { name: "Add budget line", exact: true }).click();

    await expect(budgetLineRow(page, "Flight deposit")).toBeVisible();
    await expect(budgetLineRow(page, "Flight deposit").getByText("Confidence: Low")).toBeVisible();
    // create_payment's auto-created line was never assessed -- null
    // shows as such, never as a silent "Low".
    await expect(budgetLineRow(page, "Registration fee").getByText("Confidence: Not assessed")).toBeVisible();
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
      await missingRateRow(page, kindLabel).getByRole("button", { name: "Add this rate", exact: true }).click();

      const fxForm = fxRateAddForm(page);
      await fxForm.getByLabel("Rate to USD").fill("1.1");
      // exact: true -- with no sources yet the new-source fields are
      // already showing, and "Observation date" is a case-insensitive
      // substring match for plain "Date" otherwise.
      await fxForm.getByLabel("Date", { exact: true }).fill("2024-01-01");
      // The new-source fields are found by their own visible label
      // ("Provider"), not their full accessible name ("Source Provider"):
      // Playwright's getByLabel matches each aria-labelledby element on
      // its own rather than joining them. This form only has one
      // SourcePicker, so the bare label is unambiguous here.
      if (index === 0) {
        // Regression check: no source exists yet on this account, so the
        // new-source fields must already be showing, with no selectOption
        // first. selectOption("__new__") would hide the bug -- Playwright
        // fires a change event even when the value doesn't change, while
        // a real browser doesn't, and "Add a new source…" used to be the
        // option the browser already showed as selected.
        await expect(fxForm.getByLabel("Provider", { exact: true })).toBeVisible();
        await expect(fxForm.getByLabel("Tier", { exact: true })).toBeVisible();
        await expect(fxForm.getByLabel("URL (optional)", { exact: true })).toBeVisible();
        await expect(fxForm.getByLabel("Observation date", { exact: true })).toBeVisible();
        await expect(fxForm.getByLabel("From", { exact: true })).toBeVisible();
        await expect(fxForm.getByLabel("To", { exact: true })).toBeVisible();
        // What a screen reader actually hears: the picker's label joined
        // with the field's, so two pickers in one form stay distinct.
        await expect(fxForm.getByRole("textbox", { name: "Source Provider", exact: true })).toBeVisible();
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
        await expect(fxForm.getByLabel("Provider", { exact: true })).toHaveCount(0);
        await fxForm.getByLabel("Source", { exact: true }).selectOption("__new__");
      }
      await fxForm.getByLabel("Provider", { exact: true }).fill("Fictional FX source");
      await fxForm.getByLabel("Tier", { exact: true }).selectOption("6");
      await fxForm.getByLabel("Observation date", { exact: true }).fill("2024-01-01");
      await fxForm.getByRole("button", { name: "Add rate", exact: true }).click();

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

    await row.getByRole("button", { name: "Edit", exact: true }).click();
    // Stays within min (90) <= target <= conservative (120) --
    // budget_lines_amount_order is enforced client-side too (see
    // amountsInOrder in budget-line-write-ui.tsx), so a save that broke
    // it would never even reach the server to prove anything.
    await row.getByLabel("New target").fill("110");
    await row.getByLabel("Reason for this change").fill("Flight price went up");
    await row.getByRole("button", { name: "Save", exact: true }).click();

    await expect(row.getByText("€110.00")).toBeVisible();
  });

  await test.step("change the budget line's confidence with a reason", async () => {
    const row = budgetLineRow(page, "Flight deposit");

    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(row.getByLabel("New confidence")).toHaveValue("low");
    await row.getByLabel("New confidence").selectOption("medium");
    await row.getByLabel("Reason for this change").fill("Several current fare observations now");
    await row.getByRole("button", { name: "Save", exact: true }).click();

    await expect(row.getByText("Confidence: Medium")).toBeVisible();
    // Confidence is its own field -- changing it leaves the
    // information state exactly where it was.
    await expect(row.getByText("Estimate · Confidence: Medium")).toBeVisible();
  });

  await test.step("switch the basis to Minimum: the figures drop to the observed floor, with a note", async () => {
    // Flight deposit is now 90 / 110 / 120 EUR with no payment of its
    // own, so the departure deadline -- the last phase of "one phase at
    // a time", from the 1 March payments' deadline to departure's -- is smaller at
    // the minimum. That phase's dates are fixed, so its monthly figure
    // doesn't depend on what day the test runs.
    const departurePhaseSaving = async () => {
      const text = await page.getByTestId("phased-savings-list").getByRole("listitem").last().innerText();
      return Number(text.match(/save \$([\d,.]+)/)![1].replace(/,/g, ""));
    };

    await page.goto("/");
    await expect(page.getByTestId("minimum-basis-note")).toHaveCount(0);
    const targetSaving = parseUsd(await requiredMonthlySaving.innerText());
    const targetDeparturePhase = await departurePhaseSaving();

    await page.getByRole("link", { name: "Minimum", exact: true }).click();
    await expect(page).toHaveURL(/[?&]basis=minimum/);
    await expect(page.getByText("Required monthly saving (minimum)")).toBeVisible();
    await expect(page.getByTestId("minimum-basis-note")).toHaveText(/not a savings plan/);
    expect(await departurePhaseSaving()).toBeLessThan(targetDeparturePhase);
    // The headline is the tightest deadline's rate, which here is the
    // 1 March payments (identical at every basis) -- so it may not
    // move, but it can never be higher than at target.
    expect(parseUsd(await requiredMonthlySaving.innerText())).toBeLessThanOrEqual(targetSaving);
    await expect(page.getByRole("link", { name: "Minimum", exact: true })).toHaveAttribute("aria-current", "page");

    // Carried along by the nav, like target and conservative.
    await expect(page.getByRole("link", { name: "Budget", exact: true })).toHaveAttribute("href", /[?&]basis=minimum/);

    // Back to Target: the planning figure, and the note goes away.
    await page.getByRole("link", { name: "Target", exact: true }).click();
    await expect(page).toHaveURL(/[?&]basis=target/);
    await expect(page.getByTestId("minimum-basis-note")).toHaveCount(0);
    expect(parseUsd(await requiredMonthlySaving.innerText())).toBe(targetSaving);
    expect(await departurePhaseSaving()).toBe(targetDeparturePhase);

    // Leave the page where this step found it: the budget line steps
    // around this one work on /budget-lines without navigating.
    await page.goto("/budget-lines");
  });

  await test.step("try \"confirmed\" with no source and see it refused", async () => {
    const row = budgetLineRow(page, "Flight deposit");

    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await row.getByLabel("New information state").selectOption("confirmed");
    await row.getByLabel("Reason for this change").fill("Trying to confirm with no source");
    await row.getByRole("button", { name: "Save", exact: true }).click();

    await expect(row.getByText("Confirmed needs a source")).toBeVisible();
    // Refused client-side -- the row is still showing the edit form,
    // never submitted, so the line itself is unchanged.
    await expect(row.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  });

  const FIRST_COMPETITION = "Thornmere International Choir Festival";
  const DATELESS_COMPETITION = "Global Choir Festival (host TBA)";
  let firstScenarioId = "";
  let datelessScenarioId = "";

  await test.step("open /scenarios from the Manage scenarios link", async () => {
    await page.goto("/");
    firstScenarioId = new URL(
      (await page.getByRole("link", { name: "Manage scenarios" }).getAttribute("href"))!,
      "http://x",
    ).searchParams.get("scenario")!;
    await page.getByRole("link", { name: "Manage scenarios" }).click();
    await expect(page).toHaveURL(/\/scenarios\?scenario=/);
    await expect(scenarioCard(page, "Thornmere 2029").getByText("Selected")).toBeVisible();
  });

  await test.step("add a second competition with no city and no dates", async () => {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add competition", exact: true }) });
    await form.getByLabel("Name").fill(DATELESS_COMPETITION);
    await form.getByRole("button", { name: "Add competition", exact: true }).click();

    const card = competitionCard(page, DATELESS_COMPETITION);
    await expect(card.getByText("Festival dates not announced yet")).toBeVisible();
    await expect(card.getByText("Host city not announced yet")).toBeVisible();
    await expect(card.getByText("Not used by any scenario")).toBeVisible();
  });

  await test.step("create a scenario for it and switch to it", async () => {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create scenario", exact: true }) });
    await form.getByLabel("Name").fill("Host TBA scenario");
    await form.getByLabel("Competition").selectOption({ label: DATELESS_COMPETITION });
    await form.getByRole("button", { name: "Create scenario", exact: true }).click();

    await expect(competitionCard(page, DATELESS_COMPETITION).getByText("Used by: Host TBA scenario")).toBeVisible();

    await scenarioCard(page, "Host TBA scenario").getByRole("link", { name: "Switch to" }).click();
    await expect(page).toHaveURL(/\/\?scenario=/);
    datelessScenarioId = new URL(page.url()).searchParams.get("scenario")!;
    expect(datelessScenarioId).not.toBe(firstScenarioId);
  });

  await test.step("with no festival dates, say so instead of showing $0", async () => {
    await expect(page.getByTestId("no-savings-requirement")).toContainText(
      "No departure date or festival dates yet, so there's no savings requirement to compute.",
    );
    await expect(page.getByTestId("required-monthly-saving")).toHaveCount(0);
  });

  await test.step("the selection survives a nav click", async () => {
    const budgetLink = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Budget" });
    // Also waits for the nav to hydrate: its prerendered fallback has
    // no query, and clicking that one would drop the selection.
    await expect(budgetLink).toHaveAttribute("href", new RegExp(`scenario=${datelessScenarioId}`));
    await budgetLink.click();
    await expect(page).toHaveURL(new RegExp(`/budget-lines\\?scenario=${datelessScenarioId}`));
  });

  await test.step("add a budget line to the new scenario; it doesn't appear in the first one", async () => {
    const addForm = budgetLineAddForm(page);
    await addForm.getByLabel("Description").fill("Host TBA registration");
    await addForm.getByLabel("Budget category").selectOption("A");
    await addForm.getByLabel("Minimum").fill("200");
    await addForm.getByLabel("Target").fill("250");
    await addForm.getByLabel("Conservative").fill("300");
    await addForm.getByRole("button", { name: "Add budget line", exact: true }).click();
    await expect(budgetLineRow(page, "Host TBA registration")).toBeVisible();

    await page.getByRole("link", { name: "Thornmere 2029", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`scenario=${firstScenarioId}`));
    await expect(budgetLineRow(page, "Flight deposit")).toBeVisible();
    await expect(budgetLineRow(page, "Host TBA registration")).toHaveCount(0);
  });

  await test.step("with no festival dates, Payments says it can't split instead of bucketing silently", async () => {
    await page.goto(`/payments?scenario=${datelessScenarioId}`);
    await page.getByLabel("Description").fill("Host TBA deposit");
    await page.getByLabel("Budget category").selectOption("A");
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Refundability").selectOption("refundable");
    await page.getByRole("button", { name: "Add payment", exact: true }).click();
    await expect(page.getByText("Host TBA deposit", { exact: true })).toBeVisible();

    await expect(page.getByTestId("no-payment-split")).toContainText("No departure date or festival dates yet");
    await expect(page.getByRole("heading", { name: "All payments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Due before you leave" })).toHaveCount(0);
  });

  await test.step("edit the first competition's dates to confirmed, with a source", async () => {
    await page.goto(`/scenarios?scenario=${firstScenarioId}`);
    const card = competitionCard(page, FIRST_COMPETITION);

    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await card.getByLabel("Information state (festival dates)").selectOption("confirmed");
    // A role lookup, not getByLabel: this picker is optional, so its
    // visible label reads "Source (festival dates) (optional)".
    await card.getByRole("combobox", { name: /^Source \(festival dates\)/ }).selectOption("__new__");
    await card.getByLabel("Provider", { exact: true }).fill("Fictional festival website");
    await card.getByLabel("Tier", { exact: true }).selectOption("1");
    await card.getByLabel("Observation date", { exact: true }).fill("2026-10-01");
    await card.getByLabel("Reason for this change").fill("Dates published on the official site");
    await card.getByRole("button", { name: "Save", exact: true }).click();

    await expect(card.getByText(/\(Confirmed\)/)).toBeVisible();
    await expect(card.getByText("Acceptance pending")).toBeVisible();
  });

  await test.step("create an empty scenario, rename it and link it, then delete it with a reason", async () => {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create scenario", exact: true }) });
    await form.getByLabel("Name").fill("Throwaway scenario");
    await form.getByLabel("Competition").selectOption({ label: "No competition yet" });
    await form.getByRole("button", { name: "Create scenario", exact: true }).click();
    await expect(scenarioCard(page, "Throwaway scenario").getByText("No competition yet")).toBeVisible();

    const card = scenarioCard(page, "Throwaway scenario");
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await card.getByLabel("New name").fill("Throwaway scenario (linked)");
    await card.getByLabel("Competition").selectOption({ label: DATELESS_COMPETITION });
    await card.getByLabel("Reason for this change").fill("Trying out a link");
    await card.getByRole("button", { name: "Save", exact: true }).click();

    const renamed = scenarioCard(page, "Throwaway scenario (linked)");
    // The card's read-only competition caption is a <p> -- getByText alone
    // also matches the <option> of the same name inside the edit form's
    // competition <select>, which can still be mid-unmount right after
    // Save (the useActionState effect that closes it fires a tick after
    // the server data refreshes), so this pins it to the caption only.
    await expect(renamed.locator("p").filter({ hasText: DATELESS_COMPETITION })).toBeVisible();

    await renamed.getByRole("button", { name: "Delete", exact: true }).click();
    await renamed.getByLabel("Reason for deleting this").fill("Only a test");
    await renamed.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(scenarioCard(page, "Throwaway scenario")).toHaveCount(0);
  });

  await test.step("deleting a scenario that still has budget lines is refused", async () => {
    const card = scenarioCard(page, "Host TBA scenario");
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    await card.getByLabel("Reason for deleting this").fill("Trying anyway");
    await card.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(card.getByRole("alert")).toContainText("still has budget lines");
    await expect(scenarioCard(page, "Host TBA scenario")).toHaveCount(1);

    // Back to view mode, where "Delete" and "Delete everything in this
    // scenario" sit side by side -- its own locator, not a substring of
    // "Delete", proves the two don't collide.
    await card.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "Delete everything in this scenario", exact: true }),
    ).toBeVisible();
  });

  await test.step("payments due after the festival starts, or with no due date, are listed as moved to departure", async () => {
    for (const [description, amount, dueDate] of [
      ["Post-festival hotel", "120", "2029-11-15"],
      ["Choir arrangement", "80", ""],
    ]) {
      // A fresh page each time, so the second payment can't inherit the
      // first one's due date from a form that kept its field values.
      await page.goto(`/payments?scenario=${firstScenarioId}`);
      await page.getByLabel("Description").fill(description);
      await page.getByLabel("Budget category").selectOption("C");
      await page.getByLabel("Amount").fill(amount);
      await page.getByLabel("Refundability").selectOption("refundable");
      if (dueDate) await page.getByLabel("Due date (optional)").fill(dueDate);
      await page.getByRole("button", { name: "Add payment", exact: true }).click();
      await expect(page.getByText(description, { exact: true })).toBeVisible();
    }

    await page.goto(`/?scenario=${firstScenarioId}`);
    // No travel window yet: the festival's first official day stands in.
    await expect(page.getByTestId("departure-anchor")).toHaveText(
      "No departure date set for the trip yet, so saving toward the festival's first day, Nov 6, 2029. " +
        "Your last income before then arrives Oct 31, 2029.",
    );
    const pots = page.getByTestId("deadline-pots");
    await expect(pots.getByText("Post-festival hotel — $120, due Nov 15, 2029, needed before you leave")).toBeVisible();
    await expect(pots.getByText("Choir arrangement — $80, no due date, assumed due at departure")).toBeVisible();
    await expect(pots.getByText("Registration fee — $300, due Feb 1, 2027")).toBeVisible();

    // Saved for by the last month-end income before leaving, not the
    // departure day itself -- and the pot says why.
    const departurePot = page.getByTestId("deadline-pot").filter({ hasText: "Post-festival hotel" });
    await expect(departurePot).toContainText("By Oct 31, 2029 · last income before you leave");
    await expect(departurePot.getByTestId("pot-income-note")).toContainText("Nov 6, 2029 (you leave)");
    await expect(departurePot).toContainText("Choir arrangement");
  });

  await test.step("set the trip's travel window, and the plan anchors on the departure date instead", async () => {
    await page.goto(`/scenarios?scenario=${firstScenarioId}`);
    const travelWindow = scenariosSection(page, "Travel window");
    await expect(page.getByTestId("travel-window")).toContainText("Leave: not set");

    await travelWindow.getByRole("button", { name: "Set travel window", exact: true }).click();
    await travelWindow.getByLabel("Departure date").fill("2029-11-03");
    await travelWindow.getByLabel("Return date").fill("2029-11-14");
    await travelWindow.getByLabel("Reason for this change").fill("Arriving a few days early");
    await travelWindow.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("travel-window")).toContainText("Leave: Nov 3, 2029 · Return: Nov 14, 2029");

    await page.goto(`/?scenario=${firstScenarioId}`);
    await expect(page.getByTestId("departure-anchor")).toHaveText(
      "Saving toward your departure on Nov 3, 2029. Your last income before then arrives Oct 31, 2029.",
    );
    const departurePot = page.getByTestId("deadline-pot").filter({ hasText: "Post-festival hotel" });
    await expect(departurePot).toContainText("By Oct 31, 2029 · last income before you leave");
    await expect(departurePot.getByTestId("pot-income-note")).toContainText("Nov 3, 2029 (you leave)");
    await expect(page.getByText(/departure date is on or after the festival/)).toHaveCount(0);

    // Trip-wide: a scenario whose competition has no dates now has a
    // departure to save toward too.
    await page.goto(`/?scenario=${datelessScenarioId}`);
    await expect(page.getByTestId("required-monthly-saving")).toBeVisible();
    await expect(page.getByTestId("no-savings-requirement")).toHaveCount(0);
  });

  await test.step("the Scenario Overview explains what this scenario is, and says what isn't stored", async () => {
    await page.goto(`/?scenario=${firstScenarioId}`);
    await page.getByRole("link", { name: "About this scenario" }).click();
    await expect(page).toHaveURL(new RegExp(`/scenario\\?scenario=${firstScenarioId}`));

    await expect(page.getByTestId("scenario-name")).toHaveText("Thornmere 2029");
    const whatThisIs = page.locator("section").filter({ has: page.getByRole("heading", { name: "What this is" }) });
    await expect(whatThisIs.getByText(FIRST_COMPETITION)).toBeVisible();
    await expect(whatThisIs.getByText("Leave Nov 3, 2029 · return Nov 14, 2029")).toBeVisible();
    // Nothing invented for what isn't stored.
    await expect(whatThisIs.getByText(/No notes recorded for this scenario/)).toBeVisible();

    await expect(page.getByTestId("selected-basis")).toContainText("Showing the Target basis.");
    await expect(page.getByTestId("scenario-required-saving")).toBeVisible();

    // The expanded pot list, same as on Overview -- scoped to this page's
    // own section: after a client-side navigation this Next.js version
    // keeps the previous page (Overview, with its own pot list) mounted
    // but hidden, and getByTestId doesn't skip hidden elements.
    const whenNeeded = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "When money is needed" }) });
    await expect(
      whenNeeded.getByText("Post-festival hotel — $120, due Nov 15, 2029, needed before you leave"),
    ).toBeVisible();

    await expect(page.getByText("None of this scenario's budget lines has a source.")).toBeVisible();
    await expect(page.getByTestId("unsourced-lines")).toContainText("Flight deposit");
    await expect(page.getByTestId("unsourced-lines")).toContainText("Registration fee");
    await expect(page.getByTestId("lines-by-confidence")).toContainText("Medium: 1");
    await expect(page.getByTestId("lines-by-confidence")).toContainText("Not assessed:");

    await page.getByRole("link", { name: "Conservative", exact: true }).click();
    // visible: true -- same hidden-previous-page reason as above.
    await expect(page.getByTestId("selected-basis").filter({ visible: true })).toContainText(
      "Showing the Conservative basis.",
    );
  });

  await test.step("add movements and a stay, see the night-count warning, then fix it", async () => {
    // Neither location exists yet, so both pickers start on "Add a new
    // location…" already -- LocationPicker's mustCreate (itinerary-write-ui.tsx).
    await page.getByLabel("Order in the chain").fill("1");
    // getByRole, not getByLabel -- these fields' accessible name comes
    // from a two-ref aria-labelledby ("From" + "Name"), which getByLabel
    // doesn't resolve (it only matches a field's own native label text,
    // "Name" alone, ambiguous across the three LocationPickers on this
    // page); getByRole computes the full accessible name per spec.
    await page.getByRole("textbox", { name: "From Name", exact: true }).fill("Home");
    // exact: true -- the Flight options section's "Mandatory fees"
    // field (always rendered on this same page) contains "to" too.
    await page.getByRole("textbox", { name: "To Name", exact: true }).fill("Cardiff");
    await page.getByLabel("Departs").fill("2029-11-03");
    await page.getByLabel("Arrives").fill("2029-11-03");
    await page.getByRole("button", { name: "Add movement", exact: true }).click();
    await expect(movementRow(page, "Home → Cardiff")).toBeVisible();

    // Home and Cardiff now exist as real locations -- picked from the
    // list this time, not re-created (the unique-per-owner name would
    // refuse a second "Cardiff" anyway).
    await page.getByLabel("Order in the chain").fill("2");
    await page.getByLabel("From", { exact: true }).selectOption({ label: "Cardiff (no time zone yet)" });
    await page.getByLabel("To", { exact: true }).selectOption({ label: "Home (no time zone yet)" });
    await page.getByLabel("Departs").fill("2029-11-14");
    await page.getByLabel("Arrives").fill("2029-11-14");
    await page.getByRole("button", { name: "Add movement", exact: true }).click();
    await expect(movementRow(page, "Cardiff → Home")).toBeVisible();

    // Generated from the movement chain, not typed in.
    await expect(page.getByTestId("itinerary-strip")).toContainText("Home → Cardiff (Plane)");
    await expect(page.getByTestId("itinerary-strip")).toContainText("Cardiff → Home (Plane)");

    // Neither movement has a budget line yet -- check 5's own warning.
    await expect(
      page.getByText("2 movements with no budget line yet: Home → Cardiff, Cardiff → Home."),
    ).toBeVisible();

    // The trip's travel window is Nov 3 - Nov 14 (11 nights) -- a
    // 10-night stay doesn't add up, the check this phase exists for.
    await page.getByLabel("Location", { exact: true }).selectOption({ label: "Cardiff (no time zone yet)" });
    await page.getByLabel("First night").fill("2029-11-03");
    await page.getByLabel("Nights").fill("10");
    await page.getByLabel("Kind").selectOption("festival");
    await page.getByRole("button", { name: "Add stay", exact: true }).click();
    await expect(
      page.getByText("Stays total 10 nights, but the trip's travel window is 11 nights."),
    ).toBeVisible();

    const stay = stayRow(page, "Cardiff");
    await stay.getByRole("button", { name: "Edit", exact: true }).click();
    await stay.getByLabel("New nights").fill("11");
    await stay.getByLabel("Reason for this change").fill("Counted wrong the first time");
    await stay.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText(/Stays total \d+ nights, but the trip's travel window/)).not.toBeVisible();
  });

  await test.step("add flight options, watch the checks run, accept a risk, and compare -- never a sort control", async () => {
    // F-e2e-A: a round trip linked to the existing movements, with
    // segments that land well before the festival and leave well
    // after it, refundable and with baggage included -- every check
    // should read "Pass", check 4 included (never "Fail": it's a
    // statement about what buying it would mean).
    await page.getByLabel("Label", { exact: true }).fill("F-e2e-A");
    await page.getByLabel("Fare", { exact: true }).fill("650");
    await page.getByLabel("Currency", { exact: true }).fill("USD");
    await page.getByLabel("Baggage allowance", { exact: true }).selectOption("included");
    await page.getByLabel("Refundability", { exact: true }).selectOption("refundable");
    await page.getByLabel("Source", { exact: true }).selectOption("__new__");
    await page.getByLabel("Provider", { exact: true }).fill("Fictional airline fare page");
    await page.getByLabel("Tier", { exact: true }).selectOption("2");
    await page.getByLabel("Observation date", { exact: true }).fill("2026-10-20");
    await page.getByLabel("Fare observed on", { exact: true }).fill("2026-10-20");
    await page.getByRole("button", { name: "Add flight option", exact: true }).click();

    const optionA = flightOptionCard(page, "F-e2e-A");
    await expect(optionA).toBeVisible();

    await optionA.getByRole("button", { name: "Add a segment", exact: true }).click();
    await optionA.getByLabel("Direction", { exact: true }).selectOption("outbound");
    await optionA.getByLabel("Order within this direction", { exact: true }).fill("1");
    await optionA.getByLabel("From airport", { exact: true }).fill("JFK");
    await optionA.getByLabel("To airport", { exact: true }).fill("LHR");
    await optionA.getByLabel("From country", { exact: true }).fill("US");
    await optionA.getByLabel("To country", { exact: true }).fill("GB");
    await optionA.getByLabel(/^Departs at/).fill("2029-11-03T20:00:00-04:00");
    await optionA.getByLabel(/^Arrives at/).fill("2029-11-04T08:00:00+01:00");
    await optionA.getByRole("button", { name: "Add segment", exact: true }).click();
    await expect(optionA.getByTestId("flight-segments-list").getByText("JFK → LHR")).toBeVisible();

    await optionA.getByRole("button", { name: "Add a segment", exact: true }).click();
    await optionA.getByLabel("Direction", { exact: true }).selectOption("return");
    await optionA.getByLabel("Order within this direction", { exact: true }).fill("1");
    await optionA.getByLabel("From airport", { exact: true }).fill("LHR");
    await optionA.getByLabel("To airport", { exact: true }).fill("JFK");
    await optionA.getByLabel("From country", { exact: true }).fill("GB");
    await optionA.getByLabel("To country", { exact: true }).fill("US");
    await optionA.getByLabel(/^Departs at/).fill("2029-11-14T11:00:00+01:00");
    await optionA.getByLabel(/^Arrives at/).fill("2029-11-14T14:00:00-04:00");
    await optionA.getByRole("button", { name: "Add segment", exact: true }).click();
    await expect(optionA.getByTestId("flight-segments-list").getByText("LHR → JFK")).toBeVisible();

    // Neither movement is linked to this option yet, so the festival
    // check can't resolve its onward/return travel time -- "Unknown",
    // not a guessed "Pass".
    await expect(optionA.getByTestId("constraint-badge").filter({ hasText: "Pass" })).toHaveCount(2);
    await expect(optionA.getByTestId("constraint-badge").filter({ hasText: "Unknown" })).toHaveCount(1);
    await expect(optionA.getByTestId("acceptance-safeguard-badge")).toContainText("Safe to buy");

    // Linking the existing Home -> Cardiff / Cardiff -> Home movements
    // to this option gives the festival check a chain to walk. The
    // outbound leg lands exactly at the festival-kind stay's own
    // location, so calculateOnwardTravelMinutes resolves it (0 minutes)
    // without needing a zone at all -- but findFestivalDeparture has no
    // such shortcut: it always needs the departure location's own zone
    // to interpret a local clock reading, even just to bound a result.
    // Neither Home nor Cardiff has one in this flow, so the combined
    // badge stays "Unknown" -- only the arrival half's own reason text
    // changes, from "can't resolve" to an actual pass.
    const outboundMovement = movementRow(page, "Home → Cardiff");
    await outboundMovement.getByRole("button", { name: "Edit", exact: true }).click();
    await outboundMovement.getByLabel("Flight option (optional)").selectOption({ label: "F-e2e-A (Candidate)" });
    await outboundMovement.getByLabel("Reason for this change").fill("Linking the outbound flight");
    await outboundMovement.getByRole("button", { name: "Save", exact: true }).click();

    const returnMovement = movementRow(page, "Cardiff → Home");
    await returnMovement.getByRole("button", { name: "Edit", exact: true }).click();
    await returnMovement.getByLabel("Flight option (optional)").selectOption({ label: "F-e2e-A (Candidate)" });
    await returnMovement.getByLabel("Reason for this change").fill("Linking the return flight");
    await returnMovement.getByRole("button", { name: "Save", exact: true }).click();

    await expect(optionA.getByTestId("constraint-badge").filter({ hasText: "Pass" })).toHaveCount(2);
    await expect(optionA.getByTestId("constraint-badge").filter({ hasText: "Unknown" })).toHaveCount(1);
    await expect(optionA.getByText("at the destination before the first festival day begins")).toBeVisible();
    await expect(
      optionA.getByText("festival departure unknown: the departure location has no time zone recorded yet"),
    ).toBeVisible();

    // Neither the competition nor Cardiff has a time zone recorded in
    // this flow, so there's nothing to compare -- the mismatch warning
    // stays unknown, not shown, rather than guessing.
    await expect(optionA.getByTestId("festival-location-timezone-mismatch")).toHaveCount(0);

    // F-e2e-B: no segments, baggage and refundability unrecorded,
    // competition-related and not yet accepted -- unknown must not
    // look like pass anywhere, and check 4 reads as "needs a decision",
    // never "Fail".
    await page.getByLabel("Label", { exact: true }).fill("F-e2e-B");
    await page.getByLabel("Fare", { exact: true }).fill("480");
    await page.getByLabel("Currency", { exact: true }).fill("USD");
    await page.getByLabel("Source", { exact: true }).selectOption("__new__");
    await page.getByLabel("Provider", { exact: true }).fill("Another fictional fare page");
    await page.getByLabel("Tier", { exact: true }).selectOption("3");
    await page.getByLabel("Observation date", { exact: true }).fill("2026-10-20");
    await page.getByLabel("Fare observed on", { exact: true }).fill("2026-10-20");
    await page.getByRole("button", { name: "Add flight option", exact: true }).click();

    const optionB = flightOptionCard(page, "F-e2e-B");
    await expect(optionB).toBeVisible();
    // No segments at all means no intermediate stop to flag -- the
    // US/Canada check reads that as "Pass", not a guess either way.
    // The festival-arrival and baggage checks have nothing to go on,
    // so those stay "Unknown" rather than looking like a pass.
    await expect(optionB.getByTestId("constraint-badge").filter({ hasText: "Pass" })).toHaveCount(1);
    await expect(optionB.getByTestId("constraint-badge").filter({ hasText: "Unknown" })).toHaveCount(2);
    await expect(optionB.getByTestId("constraint-badge").filter({ hasText: "Fail" })).toHaveCount(0);
    await expect(optionB.getByTestId("acceptance-safeguard-badge")).toContainText("Needs a decision first");

    await optionB.getByRole("button", { name: "Accept this risk", exact: true }).click();
    await optionB.getByLabel("Why you're accepting this risk").fill("Booking before acceptance to hold the fare");
    await optionB.getByRole("button", { name: "Accept the risk", exact: true }).click();
    await expect(optionB.getByTestId("acceptance-safeguard-badge")).toContainText("Safe to buy");

    // Both options at once, same level of detail.
    const comparison = page.getByTestId("flight-comparison-table");
    await expect(comparison).toContainText("F-e2e-A");
    await expect(comparison).toContainText("F-e2e-B");

    // The spec's own guard: journey time, connection count, and which
    // airports a route passes through are descriptive only, never a
    // sort/rank key -- asserted structurally so one can't be added back
    // absent-mindedly later.
    const sortish = /sort|rank|order by|shortest|fastest|fewest connections/i;
    await expect(page.getByRole("button", { name: sortish })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: sortish })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: sortish })).toHaveCount(0);
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
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect(page.getByText("For the export check")).toBeVisible();
  });

  // One research batch, pasted the way a claude.ai session would hand it
  // over: a source, a competition with no host yet, a scenario for it
  // and three budget lines in it (by ref, no ids yet), an update to an
  // existing line, an update written against a value that has since
  // moved, and a scenario-plus-line chain that gets rejected as a whole.
  let batchUrl = "";

  await test.step("paste a research batch from the Export page's Import research link", async () => {
    const before = await (await page.request.get("/export/download")).json();
    const flightDeposit = before.data.budgetLines.find(
      (line: { description: string }) => line.description === "Flight deposit",
    );
    expect(flightDeposit.amountTarget).toBe(110);
    expect(flightDeposit.amountMin).toBe(90);

    const home = before.data.locations.find((location: { name: string }) => location.name === "Home");
    expect(home).toBeTruthy();

    const line = (scenarioRef: string, category: string, description: string, amounts: [number, number, number]) => ({
      scenario: { ref: scenarioRef },
      category,
      description,
      amountMin: amounts[0],
      amountTarget: amounts[1],
      amountConservative: amounts[2],
      currency: "EUR",
      informationState: "estimate",
    });
    const batch = {
      format: "trip-planner-proposals",
      version: 1,
      note: "Olympics research session",
      items: [
        {
          op: "create_source",
          ref: "fares",
          reason: "Where the fares came from",
          data: { provider: "Fictional fare tracker", tier: 3, observedOn: "2026-10-01", url: "https://example.com/fares" },
        },
        { op: "create_competition", ref: "olympics", reason: "New candidate, host not announced", data: { name: "Fictional Choir Olympics 2028" } },
        {
          op: "create_scenario",
          ref: "olympics-scn",
          reason: "One scenario per candidate",
          data: { name: "Olympics 2028", competition: { ref: "olympics" } },
        },
        {
          op: "create_budget_line",
          reason: "Fare research for the Olympics",
          data: { ...line("olympics-scn", "B", "Olympics flights", [800, 900, 1100]), source: { ref: "fares" } },
        },
        { op: "create_budget_line", reason: "Typical lodging prices", data: line("olympics-scn", "C", "Olympics lodging", [400, 500, 650]) },
        { op: "create_budget_line", reason: "Meal estimate", data: line("olympics-scn", "E", "Olympics meals", [100, 120, 150]) },
        {
          op: "update_budget_line",
          target: flightDeposit.id,
          reason: "Fare dropped",
          changes: { amountTarget: { from: flightDeposit.amountTarget, to: 105 } },
        },
        {
          op: "update_budget_line",
          target: flightDeposit.id,
          reason: "Written against an old minimum",
          changes: { amountMin: { from: 50, to: 60 } },
        },
        { op: "create_scenario", ref: "abandoned", reason: "A second idea", data: { name: "Abandoned idea" } },
        { op: "create_budget_line", reason: "For the second idea", data: line("abandoned", "A", "Abandoned idea line", [1, 1, 1]) },
        {
          op: "create_location",
          ref: "olympics-village",
          reason: "A new place for the Olympics candidate",
          data: { name: "Olympics village" },
        },
        {
          op: "create_stay",
          reason: "Housing for the Olympics candidate -- nights don't match the travel window yet, on purpose",
          data: {
            scenario: { ref: "olympics-scn" },
            location: { ref: "olympics-village" },
            startDate: "2027-07-03",
            nights: 5,
            kind: "independent",
            informationState: "estimate",
          },
        },
        {
          op: "create_movement",
          reason: "Outbound leg for the Olympics candidate",
          data: {
            scenario: { ref: "olympics-scn" },
            sequence: 1,
            fromLocation: { id: home.id },
            toLocation: { ref: "olympics-village" },
            departDate: "2027-07-03",
            arriveDate: "2027-07-03",
            mode: "plane",
            informationState: "estimate",
          },
        },
      ],
    };

    await page.goto("/export");
    await page.getByRole("link", { name: "Import research" }).click();
    await expect(page).toHaveURL("/import");

    await page.getByLabel("Proposals to review").fill(JSON.stringify(batch, null, 2));
    await page.getByRole("button", { name: "Review proposals", exact: true }).click();
    await expect(page).toHaveURL(/\/import\/[0-9a-f-]{36}$/);
    batchUrl = new URL(page.url()).pathname;
  });

  await test.step("Overview says proposals are waiting, and nothing is written yet", async () => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "13 research proposals waiting for review" })).toBeVisible();
    await page.goto("/scenarios");
    await expect(scenarioCard(page, "Olympics 2028")).toHaveCount(0);
    await page.goto("/");
    await page.getByRole("link", { name: "13 research proposals waiting for review" }).click();
    await expect(page).toHaveURL("/import");
    await page.getByRole("link", { name: "Olympics research session" }).click();
    await expect(page).toHaveURL(batchUrl);
  });

  await test.step("the review shows current next to proposed, the source, and what's stale", async () => {
    await expect(proposalCard(page, 1).getByRole("link", { name: "https://example.com/fares" })).toBeVisible();
    await expect(proposalCard(page, 3).getByText("Waiting on item 2 (new competition)")).toBeVisible();
    await expect(proposalCard(page, 4).getByText(/Fictional fare tracker \(item 1 of this batch, pending\)/).first()).toBeVisible();

    const update = proposalCard(page, 7);
    await expect(update.getByText("Change budget line: Flight deposit")).toBeVisible();
    await expect(update.getByText("110 → 105")).toBeVisible();
    await expect(update.getByText("Reason: Fare dropped")).toBeVisible();

    const stale = proposalCard(page, 8);
    await expect(stale.getByText("Out of date")).toBeVisible();
    await expect(stale.getByText(/Changed since this was written: Minimum is now 90, the proposal expected 50/)).toBeVisible();
    // Reject-only: a stale proposal is never applied over the value that moved.
    await expect(stale.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  });

  await test.step("reject one budget line on its own, with a reason", async () => {
    const meals = proposalCard(page, 6);
    await meals.getByRole("button", { name: "Reject", exact: true }).click();
    await meals.getByLabel("Reason for rejecting this").fill("Not budgeting meals yet");
    await meals.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(proposalCard(page, 6).getByText("Rejected: Not budgeting meals yet")).toBeVisible();
  });

  await test.step("reject a scenario together with the line that depends on it", async () => {
    const abandoned = proposalCard(page, 9);
    await abandoned.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(abandoned.getByText(/One item depends on this: item 10 \(new budget line\)/)).toBeVisible();
    await abandoned.getByLabel("Reason for rejecting this").fill("Dropping this idea");
    await abandoned.getByLabel("Reject them too, with this reason").check();
    await abandoned.getByRole("button", { name: "Reject", exact: true }).click();

    await expect(proposalCard(page, 9).getByText("Rejected: Dropping this idea")).toBeVisible();
    await expect(proposalCard(page, 10).getByText("Rejected: Rejected with item 9, which it depends on: Dropping this idea")).toBeVisible();
  });

  await test.step("approve all ready: the chain goes through in one click, the stale one stays", async () => {
    await page.getByRole("button", { name: /Approve all ready/ }).click();
    await expect(page.getByRole("status")).toHaveText("Approved 9 items.");

    for (const n of [1, 2, 3, 4, 5, 7, 11, 12, 13]) {
      await expect(proposalCard(page, n).getByText("Approved -- written to your plan.")).toBeVisible();
    }
    await expect(proposalCard(page, 8).getByText("Out of date")).toBeVisible();
  });

  await test.step("reject the stale update", async () => {
    const stale = proposalCard(page, 8);
    await stale.getByRole("button", { name: "Reject", exact: true }).click();
    await stale.getByLabel("Reason for rejecting this").fill("Minimum moved; asking for a fresh proposal");
    await stale.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(proposalCard(page, 8).getByText("Rejected: Minimum moved; asking for a fresh proposal")).toBeVisible();
    // Nothing left pending: the batch-wide buttons go away.
    await expect(page.getByRole("button", { name: /Approve all ready/ })).toHaveCount(0);
  });

  // The import path checks a proposal against the form it would have
  // gone through (Zod validation) -- never against the 6.4 scenario
  // checks (stay-nights-match-window and friends), which stay warnings
  // everywhere else too. A stay whose nights don't fit the trip's
  // travel window must still approve; the mismatch should only show up
  // afterward, on the Scenario Overview, same as it would for a stay
  // entered by hand.
  await test.step("an import that produces a 6.4 warning still approves -- those checks are warnings, not blocks", async () => {
    const after = await (await page.request.get("/export/download")).json();
    const olympics = after.data.scenarios.find((s: { name: string }) => s.name === "Olympics 2028");
    const olympicsVillage = after.data.locations.find((l: { name: string }) => l.name === "Olympics village");
    expect(after.data.stays.some((s: { locationId: string }) => s.locationId === olympicsVillage?.id)).toBe(true);

    await page.goto(`/scenario?scenario=${olympics.id}`);
    await expect(page.getByText("Stays total 5 nights, but the trip's travel window is 11 nights.")).toBeVisible();
  });

  await test.step("what was approved is in the plan, and nothing else", async () => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /research proposals? waiting for review/ })).toHaveCount(0);

    await page.goto("/budget-lines");
    await expect(budgetLineRow(page, "Flight deposit").getByText("€105.00")).toBeVisible();

    await page.goto("/scenarios");
    await expect(scenarioCard(page, "Olympics 2028").getByText("Fictional Choir Olympics 2028")).toBeVisible();
    await expect(scenarioCard(page, "Abandoned idea")).toHaveCount(0);

    // The budget page's own scenario switcher; wait for its navigation
    // before looking for the lines.
    await page.goto("/budget-lines");
    await page.getByRole("link", { name: "Olympics 2028", exact: true }).click();
    await expect(page).toHaveURL(/[?&]scenario=[0-9a-f-]{36}/);
    await expect(budgetLineRow(page, "Olympics flights")).toBeVisible();
    await expect(budgetLineRow(page, "Olympics lodging")).toBeVisible();
    await expect(budgetLineRow(page, "Olympics meals")).toHaveCount(0);
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
    expect(exported.schemaVersion).toBe(7);
    expect(exported.data.trips[0]).toMatchObject({ departureDate: "2029-11-03", returnDate: "2029-11-14" });

    const cardiff = exported.data.locations.find((l: { name: string }) => l.name === "Cardiff");
    const home = exported.data.locations.find((l: { name: string }) => l.name === "Home");
    const exportedStay = exported.data.stays.find((stay: { locationId: string }) => stay.locationId === cardiff?.id);
    expect(exportedStay).toMatchObject({ nights: 11, kind: "festival" });
    expect(
      exported.data.movements.some(
        (movement: { fromLocationId: string; toLocationId: string }) =>
          movement.fromLocationId === home?.id && movement.toLocationId === cardiff?.id,
      ),
    ).toBe(true);
    const dateless = exported.data.competitions.find(
      (competition: { name: string }) => competition.name === "Global Choir Festival (host TBA)",
    );
    expect(dateless.startDate).toBeNull();
    expect(dateless.city).toBeNull();

    expect(
      exported.data.savingsEntries.some((entry: { note: string | null }) => entry.note === "For the export check"),
    ).toBe(true);
    expect(
      exported.data.payments.some((payment: { description: string }) => payment.description === "Registration fee"),
    ).toBe(true);
    const flightDeposit = exported.data.budgetLines.find(
      (line: { description: string }) => line.description === "Flight deposit",
    );
    expect(flightDeposit.confidence).toBe("medium");
    expect(
      exported.data.budgetLines.find((line: { description: string }) => line.description === "Registration fee")
        .confidence,
    ).toBeNull();
    expect(exported.data.changeLog.length).toBeGreaterThan(0);

    // The import: approved writes are Claude's, each with its proposal's
    // reason; every rejection is recorded with its own.
    type LogEntry = {
      tableName: string;
      action: string;
      actor: string;
      reason: string | null;
      newData: Record<string, unknown> | null;
    };
    const log: LogEntry[] = exported.data.changeLog;
    expect(
      log.some(
        (e) =>
          e.tableName === "budget_lines" &&
          e.action === "insert" &&
          e.actor === "claude" &&
          e.reason === "Fare research for the Olympics" &&
          e.newData?.description === "Olympics flights",
      ),
    ).toBe(true);
    expect(
      log.some(
        (e) =>
          e.tableName === "budget_lines" &&
          e.action === "update" &&
          e.actor === "claude" &&
          e.reason === "Fare dropped" &&
          Number(e.newData?.amount_target) === 105,
      ),
    ).toBe(true);
    expect(
      log.some((e) => e.tableName === "scenarios" && e.action === "insert" && e.actor === "claude" && e.reason === "One scenario per candidate"),
    ).toBe(true);
    for (const reason of ["Not budgeting meals yet", "Dropping this idea", "Minimum moved; asking for a fresh proposal"]) {
      expect(
        log.some((e) => e.tableName === "proposal_items" && e.action === "update" && e.actor === "app" && e.reason === reason),
      ).toBe(true);
    }
    // Never a Claude-originated write without a reason.
    expect(log.filter((e) => e.actor === "claude").every((e) => e.reason)).toBe(true);
    // Nothing from a rejected proposal was written.
    expect(exported.data.budgetLines.some((l: { description: string }) => l.description === "Olympics meals")).toBe(false);
    expect(exported.data.scenarios.some((s: { name: string }) => s.name === "Abandoned idea")).toBe(false);

    const proposals: { position: number; status: string; decisionReason: string | null }[] = exported.data.proposalItems;
    expect(proposals.filter((p) => p.status === "approved")).toHaveLength(9);
    expect(proposals.filter((p) => p.status === "rejected")).toHaveLength(4);
    expect(proposals.find((p) => p.position === 9)!.decisionReason).toBe(
      "Rejected with item 9, which it depends on: Dropping this idea",
    );
    expect(exported.data.proposalBatches[0].note).toBe("Olympics research session");
  });
});
