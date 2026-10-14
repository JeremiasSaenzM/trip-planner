import { expect, test } from "@playwright/test";

import { getLatestMagicLink } from "./mailpit";

// e2e-tests.yml creates this exact user via Supabase's admin API before
// the suite runs -- login requires shouldCreateUser: false, so it must
// already exist. One continuous test, not several: the PKCE session
// cookie set during login has to carry through every later step, which
// only holds if it's all the same Playwright page/context.
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e-test@example.com";

test("create trip -> competition -> scenario, starting from a signed-out, empty account", async ({ page }) => {
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
    await page.getByLabel("First festival day").fill("2027-07-06");
    await page.getByLabel("Last festival day").fill("2027-07-11");
    await page.getByLabel("Time zone").fill("Europe/London");
    await page.getByRole("button", { name: "Add competition" }).click();
    await expect(page.getByText("Create a scenario")).toBeVisible();
  });

  await test.step("create a scenario and reach the dashboard", async () => {
    await page.getByLabel("Name").fill("Llangollen 2027");
    await page.getByRole("button", { name: "Create scenario" }).click();
    await expect(page.getByText("Required monthly saving")).toBeVisible();
  });
});
