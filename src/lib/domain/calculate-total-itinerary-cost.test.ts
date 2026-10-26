import { describe, expect, it } from "vitest";

import { calculateTotalItineraryCost } from "./calculate-total-itinerary-cost";
import type { FxRate } from "./convert-to-usd";

const RATES: FxRate[] = [
  { currency: "EUR", rateKind: "planning_base", rateToUsd: 1.1, rateDate: "2026-10-01" },
  { currency: "EUR", rateKind: "planning_conservative", rateToUsd: 1.0, rateDate: "2026-10-01" },
];

describe("calculateTotalItineraryCost", () => {
  it("is just the flight cost when nothing is linked as route-caused", () => {
    const result = calculateTotalItineraryCost({
      effectiveFlightCostAmount: 1622,
      effectiveFlightCostCurrency: "USD",
      linkedBudgetLineIds: [],
      budgetLines: [],
      basis: "target",
      rates: RATES,
      asOfDate: "2026-10-26",
    });
    expect(result).toEqual({ amountUsd: 1622, complete: true, missingBudgetLineCount: 0 });
  });

  it("adds every distinct route-caused budget line once, converted at the basis's own rate kind", () => {
    const result = calculateTotalItineraryCost({
      effectiveFlightCostAmount: 1000,
      effectiveFlightCostCurrency: "USD",
      // Two movements link to the same line -- counted once.
      linkedBudgetLineIds: ["line-1", "line-1"],
      budgetLines: [
        { id: "line-1", amountMin: 50, amountTarget: 100, amountConservative: 150, currency: "EUR" },
      ],
      basis: "target",
      rates: RATES,
      asOfDate: "2026-10-26",
    });
    expect(result).toEqual({ amountUsd: 1000 + 100 * 1.1, complete: true, missingBudgetLineCount: 0 });
  });

  it("uses the conservative rate kind, not planning_base, at the conservative basis", () => {
    const result = calculateTotalItineraryCost({
      effectiveFlightCostAmount: 1000,
      effectiveFlightCostCurrency: "USD",
      linkedBudgetLineIds: ["line-1"],
      budgetLines: [
        { id: "line-1", amountMin: 50, amountTarget: 100, amountConservative: 150, currency: "EUR" },
      ],
      basis: "conservative",
      rates: RATES,
      asOfDate: "2026-10-26",
    });
    expect(result.amountUsd).toBe(1000 + 150 * 1.0);
  });

  it("is incomplete, not silently short, when a linked movement has no budget line yet", () => {
    const result = calculateTotalItineraryCost({
      effectiveFlightCostAmount: 1000,
      effectiveFlightCostCurrency: "USD",
      linkedBudgetLineIds: [null],
      budgetLines: [],
      basis: "target",
      rates: RATES,
      asOfDate: "2026-10-26",
    });
    expect(result).toEqual({ amountUsd: 1000, complete: false, missingBudgetLineCount: 1 });
  });

  it("is incomplete when no fx rate covers the flight's own currency", () => {
    const result = calculateTotalItineraryCost({
      effectiveFlightCostAmount: 1000,
      effectiveFlightCostCurrency: "GBP",
      linkedBudgetLineIds: [],
      budgetLines: [],
      basis: "target",
      rates: RATES,
      asOfDate: "2026-10-26",
    });
    expect(result.complete).toBe(false);
    expect(result.amountUsd).toBe(0);
  });
});
