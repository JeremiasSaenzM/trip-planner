import { describe, expect, it } from "vitest";

import { groupObligationsByDueDate, obligationAmount } from "./group-obligations-by-due-date";

describe("groupObligationsByDueDate", () => {
  it("returns an empty array for no obligations", () => {
    expect(groupObligationsByDueDate([], "target")).toEqual([]);
  });

  it("sums same-due-date obligations and combines their descriptions", () => {
    const result = groupObligationsByDueDate(
      [
        { description: "Flight", amountMinimumUsd: 400, amountTargetUsd: 400, amountConservativeUsd: 450, dueDate: "2027-03-01" },
        { description: "Hotel deposit", amountMinimumUsd: 100, amountTargetUsd: 100, amountConservativeUsd: 120, dueDate: "2027-03-01" },
      ],
      "target",
    );
    expect(result).toMatchObject([{ dueDate: "2027-03-01", amountUsd: 500, description: "2 payments" }]);
    // The group keeps what it's made of, in input order.
    expect(result[0].items.map((item) => item.description)).toEqual(["Flight", "Hotel deposit"]);
  });

  it("labels a multi-item group on the departure date as 'Before departure', not '2 payments'", () => {
    const result = groupObligationsByDueDate(
      [
        { description: "Food", amountMinimumUsd: 200, amountTargetUsd: 200, amountConservativeUsd: 280, dueDate: "2027-07-05" },
        { description: "Insurance", amountMinimumUsd: 40, amountTargetUsd: 40, amountConservativeUsd: 45, dueDate: "2027-07-05" },
      ],
      "target",
      "2027-07-05",
    );
    expect(result[0].description).toBe("Before departure (2 items)");
  });

  it("still says '2 payments' for a same-date group that isn't the departure date", () => {
    const result = groupObligationsByDueDate(
      [
        { description: "Food", amountMinimumUsd: 200, amountTargetUsd: 200, amountConservativeUsd: 280, dueDate: "2027-07-05" },
        { description: "Insurance", amountMinimumUsd: 40, amountTargetUsd: 40, amountConservativeUsd: 45, dueDate: "2027-07-05" },
      ],
      "target",
      "2027-09-01", // departure isn't this group's date
    );
    expect(result[0].description).toBe("2 payments");
  });

  it("sorts ascending by due date and resolves the requested basis", () => {
    const result = groupObligationsByDueDate(
      [
        { description: "Later", amountMinimumUsd: 100, amountTargetUsd: 100, amountConservativeUsd: 150, dueDate: "2027-06-01" },
        { description: "Earlier", amountMinimumUsd: 200, amountTargetUsd: 200, amountConservativeUsd: 250, dueDate: "2027-01-01" },
      ],
      "conservative",
    );
    expect(result.map((g) => g.dueDate)).toEqual(["2027-01-01", "2027-06-01"]);
    expect(result[0]).toMatchObject({ dueDate: "2027-01-01", amountUsd: 250, description: "Earlier" });
  });
});

describe("groupObligationsByDueDate at the minimum basis", () => {
  it("sums each group's minimum amounts", () => {
    const result = groupObligationsByDueDate(
      [
        { description: "Flight", amountMinimumUsd: 350, amountTargetUsd: 400, amountConservativeUsd: 450, dueDate: "2027-03-01" },
        { description: "Hotel deposit", amountMinimumUsd: 80, amountTargetUsd: 100, amountConservativeUsd: 120, dueDate: "2027-03-01" },
        { description: "Meals", amountMinimumUsd: 150, amountTargetUsd: 200, amountConservativeUsd: 280, dueDate: "2027-07-05" },
      ],
      "minimum",
    );
    expect(result).toMatchObject([
      { dueDate: "2027-03-01", amountUsd: 430, description: "2 payments" },
      { dueDate: "2027-07-05", amountUsd: 150, description: "Meals" },
    ]);
  });

  it("obligationAmount picks the field for each basis", () => {
    const obligation = { amountMinimumUsd: 1, amountTargetUsd: 2, amountConservativeUsd: 3 };
    expect(obligationAmount(obligation, "minimum")).toBe(1);
    expect(obligationAmount(obligation, "target")).toBe(2);
    expect(obligationAmount(obligation, "conservative")).toBe(3);
  });
});
