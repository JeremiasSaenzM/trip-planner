import { describe, expect, it } from "vitest";

import { checkBudgetLineMatchesStay } from "./check-budget-line-matches-stay";

describe("checkBudgetLineMatchesStay", () => {
  it("passes when a night-quantity line matches its linked stay exactly", () => {
    const result = checkBudgetLineMatchesStay(
      [{ id: "s1", nights: 13, budgetLineId: "l1" }],
      [{ id: "l1", description: "Paris nights", quantity: 13, quantityUnit: "night" }],
    );
    expect(result).toEqual([]);
  });

  it("flags a line whose quantity no longer matches the stay it's linked to", () => {
    const result = checkBudgetLineMatchesStay(
      [{ id: "s1", nights: 14, budgetLineId: "l1" }],
      [{ id: "l1", description: "Paris nights", quantity: 13, quantityUnit: "night" }],
    );
    expect(result).toEqual([
      { budgetLineId: "l1", description: "Paris nights", quantity: 13, stayId: "s1", stayNights: 14 },
    ]);
  });

  it("is exempt when the stay has no linked line, the line has no quantity, or the quantity is by day", () => {
    expect(checkBudgetLineMatchesStay([{ id: "s1", nights: 5, budgetLineId: null }], [])).toEqual([]);
    expect(
      checkBudgetLineMatchesStay(
        [{ id: "s1", nights: 5, budgetLineId: "l1" }],
        [{ id: "l1", description: "Flat lodging", quantity: null, quantityUnit: null }],
      ),
    ).toEqual([]);
    expect(
      checkBudgetLineMatchesStay(
        [{ id: "s1", nights: 5, budgetLineId: "l1" }],
        [{ id: "l1", description: "Food", quantity: 5, quantityUnit: "day" }],
      ),
    ).toEqual([]);
  });
});
