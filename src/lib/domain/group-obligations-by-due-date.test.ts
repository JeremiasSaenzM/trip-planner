import { describe, expect, it } from "vitest";

import { groupObligationsByDueDate } from "./group-obligations-by-due-date";

describe("groupObligationsByDueDate", () => {
  it("returns an empty array for no obligations", () => {
    expect(groupObligationsByDueDate([], "target")).toEqual([]);
  });

  it("sums same-due-date obligations and combines their descriptions", () => {
    const result = groupObligationsByDueDate(
      [
        { description: "Flight", amountTargetUsd: 400, amountConservativeUsd: 450, dueDate: "2027-03-01" },
        { description: "Hotel deposit", amountTargetUsd: 100, amountConservativeUsd: 120, dueDate: "2027-03-01" },
      ],
      "target",
    );
    expect(result).toEqual([{ dueDate: "2027-03-01", amountUsd: 500, description: "2 payments" }]);
  });

  it("sorts ascending by due date and resolves the requested basis", () => {
    const result = groupObligationsByDueDate(
      [
        { description: "Later", amountTargetUsd: 100, amountConservativeUsd: 150, dueDate: "2027-06-01" },
        { description: "Earlier", amountTargetUsd: 200, amountConservativeUsd: 250, dueDate: "2027-01-01" },
      ],
      "conservative",
    );
    expect(result.map((g) => g.dueDate)).toEqual(["2027-01-01", "2027-06-01"]);
    expect(result[0]).toEqual({ dueDate: "2027-01-01", amountUsd: 250, description: "Earlier" });
  });
});
