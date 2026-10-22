import { describe, expect, it } from "vitest";

import { findMovementsMissingBudgetLine } from "./find-movements-missing-budget-line";

describe("findMovementsMissingBudgetLine", () => {
  it("lists only the movements with no budget line yet", () => {
    const result = findMovementsMissingBudgetLine([
      { id: "m1", fromLocation: "Home", toLocation: "Madrid", budgetLineId: "b1" },
      { id: "m2", fromLocation: "Madrid", toLocation: "Home", budgetLineId: null },
    ]);
    expect(result).toEqual([{ id: "m2", fromLocation: "Madrid", toLocation: "Home" }]);
  });

  it("returns nothing when every movement is priced", () => {
    const result = findMovementsMissingBudgetLine([
      { id: "m1", fromLocation: "Home", toLocation: "Madrid", budgetLineId: "b1" },
    ]);
    expect(result).toEqual([]);
  });

  it("doesn't crash with no movements at all", () => {
    expect(findMovementsMissingBudgetLine([])).toEqual([]);
  });
});
