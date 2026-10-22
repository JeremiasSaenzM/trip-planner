import { defineConfig, devices } from "@playwright/test";

// Runs only in CI, against the local Supabase stack db-tests.yml already
// spins up (see .github/workflows/e2e-tests.yml) -- there is no second
// Supabase project to run this against safely, and no Docker on the dev
// machine to run it by hand either. See e2e/mailpit.ts for how login
// works with no real inbox to read.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // No test-level retries: the journey assumes an empty account, and a retry
  // reuses the same dirty database and app server, so it can only ever fail
  // for the wrong reason. Re-run the whole job instead -- that rebuilds the
  // stack from scratch and is a genuinely clean attempt.
  retries: 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
