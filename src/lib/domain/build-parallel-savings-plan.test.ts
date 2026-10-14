import { describe, expect, it } from "vitest";

import { buildParallelSavingsPlan } from "./build-parallel-savings-plan";
import type { ObligationForGrouping } from "./group-obligations-by-due-date";

function obligation(description: string, amountUsd: number, dueDate: string): ObligationForGrouping {
  return { description, amountTargetUsd: amountUsd, amountConservativeUsd: amountUsd, dueDate };
}

const THREE_DEADLINES: ObligationForGrouping[] = [
  obligation("Registration", 600, "2027-03-01"),
  obligation("Flight", 900, "2027-06-01"),
  obligation("Hotel", 1200, "2027-10-01"),
];

describe("buildParallelSavingsPlan", () => {
  it("gives every deadline its own pot, saving from today to its own due date", () => {
    const result = buildParallelSavingsPlan({
      obligations: THREE_DEADLINES,
      availableUsd: 0,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    expect(result.pots.map((p) => ({ months: p.monthsFromToday, saving: p.monthlySaving }))).toEqual([
      { months: 2, saving: 300 },
      { months: 5, saving: 180 },
      { months: 9, saving: 1200 / 9 },
    ]);

    // Each period's total is the sum of every pot not yet closed -- a
    // step down each time a pot's own deadline passes.
    expect(result.periods.map((p) => p.openPotCount)).toEqual([3, 2, 1]);
    expect(result.periods[0].totalMonthlySaving).toBeCloseTo(300 + 180 + 1200 / 9, 5);
    expect(result.periods[1].totalMonthlySaving).toBeCloseTo(180 + 1200 / 9, 5);
    expect(result.periods[2].totalMonthlySaving).toBeCloseTo(1200 / 9, 5);
  });

  it("gives the first pot's full share of available money before later pots get any", () => {
    const result = buildParallelSavingsPlan({
      obligations: THREE_DEADLINES,
      availableUsd: 2000,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    const [registration, flight, hotel] = result.pots;
    expect(registration).toMatchObject({ availableShareUsd: 600, monthlySaving: 0 });
    expect(flight).toMatchObject({ availableShareUsd: 900, monthlySaving: 0 });
    expect(hotel.availableShareUsd).toBe(500); // 2000 - 600 - 900 left over
    expect(hotel.monthlySaving).toBeCloseTo(700 / 9, 5);
  });

  it("clamps a pot shorter than a month to 1 month", () => {
    const result = buildParallelSavingsPlan({
      obligations: [obligation("Deposit", 300, "2027-01-10")],
      availableUsd: 0,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    expect(result.pots[0]).toMatchObject({ monthsFromToday: 1, monthlySaving: 300 });
  });

  it("reports a past-due pot as a shortfall, excluded from the open-pot periods", () => {
    const result = buildParallelSavingsPlan({
      obligations: [obligation("Overdue deposit", 500, "2027-01-01"), obligation("Flight", 300, "2027-04-01")],
      availableUsd: 200,
      asOfDate: "2027-02-01",
      basis: "target",
    });

    const [overdue, flight] = result.pots;
    expect(overdue).toMatchObject({ isPastDue: true, monthsFromToday: null, monthlySaving: null, shortfallNow: 300 });
    expect(flight).toMatchObject({ availableShareUsd: 0, monthsFromToday: 2, monthlySaving: 150 });
    expect(result.periods).toEqual([
      { fromDate: "2027-02-01", toDate: "2027-04-01", totalMonthlySaving: 150, openPotCount: 1 },
    ]);
  });

  it("satisfies total saved + available money = total needed, with no unresolved shortfall", () => {
    const availableUsd = 0;
    const result = buildParallelSavingsPlan({
      obligations: THREE_DEADLINES,
      availableUsd,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    const totalSaved = result.pots.reduce((sum, p) => sum + (p.monthlySaving ?? 0) * (p.monthsFromToday ?? 0), 0);
    const totalNeeded = THREE_DEADLINES.reduce((sum, o) => sum + o.amountTargetUsd, 0);

    expect(totalSaved + availableUsd).toBeCloseTo(totalNeeded, 5);
  });
});
