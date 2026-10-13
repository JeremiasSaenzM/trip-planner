import { describe, expect, it } from "vitest";
import { rollUpBudgetByScenario, type BudgetLineForRollup } from "./roll-up-budget-by-scenario";
import type { FxRate } from "./convert-to-usd";

const rates: FxRate[] = [
  { currency: "GBP", rateKind: "planning_base", rateToUsd: 1.3, rateDate: "2026-10-01" },
  { currency: "GBP", rateKind: "planning_conservative", rateToUsd: 1.35, rateDate: "2026-10-01" },
  { currency: "EUR", rateKind: "planning_base", rateToUsd: 1.1, rateDate: "2026-10-01" },
  { currency: "EUR", rateKind: "planning_conservative", rateToUsd: 1.15, rateDate: "2026-10-01" },
  // no GBP planning_conservative is intentionally present above; this
  // second set omits it to test the missing-rate case separately.
];

const ratesMissingGbpConservative: FxRate[] = rates.filter(
  (rate) => !(rate.currency === "GBP" && rate.rateKind === "planning_conservative"),
);

function line(overrides: Partial<BudgetLineForRollup>): BudgetLineForRollup {
  return {
    tripId: "trip-1",
    scenarioId: "scenario-1",
    category: "A",
    amountMin: 100,
    amountTarget: 100,
    amountConservative: 100,
    currency: "USD",
    informationState: "confirmed",
    ...overrides,
  };
}

describe("rollUpBudgetByScenario", () => {
  it("converts and sums mixed GBP/EUR/USD lines correctly", () => {
    const result = rollUpBudgetByScenario({
      tripId: "trip-1",
      scenarioId: "scenario-1",
      asOfDate: "2026-10-05",
      rates,
      budgetLines: [
        line({ category: "A", amountMin: 100, amountTarget: 100, amountConservative: 100, currency: "USD" }),
        line({ category: "B", amountMin: 100, amountTarget: 100, amountConservative: 100, currency: "GBP" }),
        line({ category: "C", amountMin: 100, amountTarget: 100, amountConservative: 100, currency: "EUR" }),
      ],
    });
    // USD: 100/100/100, GBP: 130/130/135, EUR: 110/110/115
    expect(result.totals).toEqual({ min: 340, target: 340, conservative: 350 });
    expect(result.complete).toBe(true);
  });

  it("excludes a line's contribution (per field) when its rate is missing, and records it in missingRates", () => {
    const result = rollUpBudgetByScenario({
      tripId: "trip-1",
      scenarioId: "scenario-1",
      asOfDate: "2026-10-05",
      rates: ratesMissingGbpConservative,
      budgetLines: [line({ category: "B", amountMin: 100, amountTarget: 100, amountConservative: 100, currency: "GBP" })],
    });
    // min/target still convert fine via planning_base
    expect(result.totals.min).toBe(130);
    expect(result.totals.target).toBe(130);
    // conservative has no rate -- excluded, not silently summed as 0
    expect(result.totals.conservative).toBe(0);
    expect(result.missingRates).toEqual([{ category: "B", currency: "GBP", rateKind: "planning_conservative" }]);
    expect(result.complete).toBe(false);
  });

  it("includes a shared line (scenario_id null) from the same trip", () => {
    const result = rollUpBudgetByScenario({
      tripId: "trip-1",
      scenarioId: "scenario-1",
      asOfDate: "2026-10-05",
      rates,
      budgetLines: [line({ scenarioId: null, amountMin: 50, amountTarget: 50, amountConservative: 50 })],
    });
    expect(result.totals).toEqual({ min: 50, target: 50, conservative: 50 });
  });

  it("excludes a shared line (scenario_id null) from a different trip", () => {
    const result = rollUpBudgetByScenario({
      tripId: "trip-1",
      scenarioId: "scenario-1",
      asOfDate: "2026-10-05",
      rates,
      budgetLines: [line({ tripId: "trip-2", scenarioId: null, amountMin: 50, amountTarget: 50, amountConservative: 50 })],
    });
    expect(result.totals).toEqual({ min: 0, target: 0, conservative: 0 });
  });

  it("excludes a line belonging to a different scenario in the same trip", () => {
    const result = rollUpBudgetByScenario({
      tripId: "trip-1",
      scenarioId: "scenario-1",
      asOfDate: "2026-10-05",
      rates,
      budgetLines: [line({ scenarioId: "scenario-2" })],
    });
    expect(result.totals).toEqual({ min: 0, target: 0, conservative: 0 });
  });

  it("reflects the weakest information state present via statesPresent, and allConfirmed only when every included line is confirmed", () => {
    const result = rollUpBudgetByScenario({
      tripId: "trip-1",
      scenarioId: "scenario-1",
      asOfDate: "2026-10-05",
      rates,
      budgetLines: [line({ informationState: "confirmed" }), line({ informationState: "estimate" })],
    });
    expect(result.statesPresent.confirmed).toBe(1);
    expect(result.statesPresent.estimate).toBe(1);
    expect(result.allConfirmed).toBe(false);
  });

  it("returns all-zero totals and allConfirmed:false for an empty set of budget lines", () => {
    const result = rollUpBudgetByScenario({
      tripId: "trip-1",
      scenarioId: "scenario-1",
      asOfDate: "2026-10-05",
      rates,
      budgetLines: [],
    });
    expect(result.totals).toEqual({ min: 0, target: 0, conservative: 0 });
    expect(result.allConfirmed).toBe(false);
    expect(result.complete).toBe(true);
  });
});
