import { describe, expect, it } from "vitest";

import { checkBudgetLineNightsAddUp } from "./check-budget-line-nights-add-up";

describe("checkBudgetLineNightsAddUp", () => {
  it("reports unknown when the trip's travel window isn't set", () => {
    const result = checkBudgetLineNightsAddUp({
      budgetLines: [{ quantity: 11, quantityUnit: "night" }],
      movements: [],
      tripDepartureDate: null,
      tripReturnDate: "2027-07-13",
    });
    expect(result).toEqual({ status: "unknown" });
  });

  it("passes when the night-quantity lines sum to the nights in beds", () => {
    const result = checkBudgetLineNightsAddUp({
      budgetLines: [
        { quantity: 6, quantityUnit: "night" },
        { quantity: 5, quantityUnit: "night" },
      ],
      movements: [],
      tripDepartureDate: "2027-07-04",
      tripReturnDate: "2027-07-15",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("flags lines that don't sum to the window", () => {
    const result = checkBudgetLineNightsAddUp({
      budgetLines: [{ quantity: 21, quantityUnit: "night" }],
      movements: [],
      tripDepartureDate: "2027-07-04",
      tripReturnDate: "2027-07-15",
    });
    expect(result).toEqual({ status: "mismatch", linesNights: 21, bedsNights: 11 });
  });

  it("ignores lines with no quantity, or a quantity by day/person/item", () => {
    const result = checkBudgetLineNightsAddUp({
      budgetLines: [
        { quantity: null, quantityUnit: null },
        { quantity: 15, quantityUnit: "day" },
        { quantity: 11, quantityUnit: "night" },
      ],
      movements: [],
      tripDepartureDate: "2027-07-04",
      tripReturnDate: "2027-07-15",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("subtracts a night spent on an overnight movement before comparing", () => {
    const result = checkBudgetLineNightsAddUp({
      budgetLines: [{ quantity: 11, quantityUnit: "night" }],
      movements: [
        { sequence: 1, fromLocation: "Home", toLocation: "Away", departDate: "2027-07-02", arriveDate: "2027-07-03" },
      ],
      tripDepartureDate: "2027-07-02",
      tripReturnDate: "2027-07-14",
    });
    expect(result).toEqual({ status: "ok" });
  });
});
