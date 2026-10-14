import { afterEach, describe, expect, it, vi } from "vitest";

import { rollUpBudgetByScenario } from "@/lib/domain/roll-up-budget-by-scenario";

import { demoDataSource } from "./demo";
import { budgetLines, savingsEntries } from "./fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
});

// These fixtures are never special-cased by domain code: they go through
// rollUpBudgetByScenario() exactly as real Supabase rows would, because
// BudgetLine/FxRate here are structurally compatible with its input
// types (same field names, same types, just a few extra columns).
describe("demo fixtures through the domain layer", () => {
  it("roll up cleanly, with every currency covered by a rate", async () => {
    const source = demoDataSource;
    const [lines, rates] = await Promise.all([source.getBudgetLines(), source.getFxRates()]);

    const result = rollUpBudgetByScenario({
      tripId: "20000000-0000-0000-0000-000000000001",
      scenarioId: "50000000-0000-0000-0000-000000000001",
      asOfDate: "2026-10-10",
      budgetLines: lines,
      rates,
    });

    expect(result.missingRates).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.totals.target).toBeGreaterThan(0);
  });

  it("use a mix of EUR, GBP and USD so conversion is visible", () => {
    const currencies = new Set(budgetLines.map((line) => line.currency));
    expect(currencies).toEqual(new Set(["EUR", "GBP", "USD"]));
  });

  it("record savings only in USD", () => {
    expect(savingsEntries.every((entry) => entry.currency === "USD")).toBe(true);
  });
});

describe("demoDataSource writes", () => {
  it("every create* method throws instead of writing to the fixtures", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    await expect(demoDataSource.createTrip({ name: "Test" })).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createCompetition({
        tripId: "20000000-0000-0000-0000-000000000001",
        name: "Test",
        city: "Test",
        country: "Test",
        startDate: "2027-01-01",
        endDate: "2027-01-02",
        timezone: "UTC",
        datesState: "pending",
      }),
    ).rejects.toThrow(/disabled in demo mode/);
    await expect(
      demoDataSource.createScenario({
        tripId: "20000000-0000-0000-0000-000000000001",
        name: "Test",
        includesExtension: false,
      }),
    ).rejects.toThrow(/disabled in demo mode/);
  });
});
