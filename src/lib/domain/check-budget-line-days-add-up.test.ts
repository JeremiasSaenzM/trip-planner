import { describe, expect, it } from "vitest";

import { checkBudgetLineDaysAddUp } from "./check-budget-line-days-add-up";

const OUTBOUND = { sequence: 1, fromLocationId: "Home", toLocationId: "Away", departDate: "2027-07-04", arriveDate: "2027-07-04" };
const RETURN = { sequence: 2, fromLocationId: "Away", toLocationId: "Home", departDate: "2027-07-19", arriveDate: "2027-07-19" };

describe("checkBudgetLineDaysAddUp", () => {
  it("passes when category E's day-quantity lines sum to the days on the ground", () => {
    const result = checkBudgetLineDaysAddUp(
      [{ category: "E", quantity: 15, quantityUnit: "day" }],
      [OUTBOUND, RETURN],
    );
    expect(result).toEqual({ status: "ok" });
  });

  it("flags lines that don't sum to the days on the ground", () => {
    const result = checkBudgetLineDaysAddUp(
      [{ category: "E", quantity: 21, quantityUnit: "day" }],
      [OUTBOUND, RETURN],
    );
    expect(result).toEqual({ status: "mismatch", linesDays: 21, groundDays: 15 });
  });

  it("ignores a day quantity outside category E, and a line with no quantity", () => {
    const result = checkBudgetLineDaysAddUp(
      [
        { category: "F", quantity: 15, quantityUnit: "day" },
        { category: "E", quantity: null, quantityUnit: null },
      ],
      [OUTBOUND, RETURN],
    );
    expect(result).toEqual({ status: "mismatch", linesDays: 0, groundDays: 15 });
  });
});
