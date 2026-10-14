import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // e2e/ holds Playwright specs, run by `playwright test`, not Vitest
    // -- they import "test"/"expect" from @playwright/test, which only
    // work inside Playwright's own runner.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
