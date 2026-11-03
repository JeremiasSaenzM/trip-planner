import { describe, expect, it } from "vitest";

import { checkBudgetLineNightsAddUp } from "./check-budget-line-nights-add-up";
import { resolveTravelWindow, type TravelWindowFields } from "./resolve-travel-window";

describe("checkBudgetLineNightsAddUp", () => {
  it("reports unknown when the trip's travel window isn't set", () => {
    const result = checkBudgetLineNightsAddUp({
      budgetLines: [{ quantity: 11, quantityUnit: "night" }],
      movements: [],
      departureDate: null,
      returnDate: "2027-07-13",
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
      departureDate: "2027-07-04",
      returnDate: "2027-07-15",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("flags lines that don't sum to the window", () => {
    const result = checkBudgetLineNightsAddUp({
      budgetLines: [{ quantity: 21, quantityUnit: "night" }],
      movements: [],
      departureDate: "2027-07-04",
      returnDate: "2027-07-15",
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
      departureDate: "2027-07-04",
      returnDate: "2027-07-15",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("subtracts a night spent on an overnight movement before comparing", () => {
    const result = checkBudgetLineNightsAddUp({
      budgetLines: [{ quantity: 11, quantityUnit: "night" }],
      movements: [
        { sequence: 1, fromLocationId: "Home", toLocationId: "Away", departDate: "2027-07-02", arriveDate: "2027-07-03" },
      ],
      departureDate: "2027-07-02",
      returnDate: "2027-07-14",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("uses an overriding scenario's own window, not the trip's, once resolved", () => {
    const trip: TravelWindowFields = {
      departureDate: "2027-07-04",
      returnDate: "2027-07-15",
      travelDatesState: "estimate",
      travelDatesSourceId: null,
    };
    const scenario: TravelWindowFields = {
      departureDate: "2027-07-04",
      returnDate: "2027-07-12",
      travelDatesState: "estimate",
      travelDatesSourceId: null,
    };
    const window = resolveTravelWindow(scenario, trip);
    expect(window.origin).toBe("scenario");

    // Matches the scenario's shorter 8-night window, not the trip's
    // 11-night one -- if this read trip.returnDate directly instead of
    // the resolved window, it would report a mismatch instead.
    const result = checkBudgetLineNightsAddUp({
      budgetLines: [{ quantity: 8, quantityUnit: "night" }],
      movements: [],
      departureDate: window.departureDate,
      returnDate: window.returnDate,
    });
    expect(result).toEqual({ status: "ok" });
  });
});
