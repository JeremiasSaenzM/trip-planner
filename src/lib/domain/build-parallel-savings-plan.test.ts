import { describe, expect, it } from "vitest";

import { buildParallelSavingsPlan } from "./build-parallel-savings-plan";
import type { ObligationForGrouping } from "./group-obligations-by-due-date";
import { TRAVELLER_INCOME_CADENCE } from "./income-cadence";

function obligation(description: string, amountUsd: number, dueDate: string): ObligationForGrouping {
  return { description, amountMinimumUsd: amountUsd, amountTargetUsd: amountUsd, amountConservativeUsd: amountUsd, dueDate };
}

const THREE_DEADLINES: ObligationForGrouping[] = [
  obligation("Registration", 600, "2027-03-01"),
  obligation("Flight", 900, "2027-06-01"),
  obligation("Hotel", 1200, "2027-10-01"),
];

describe("buildParallelSavingsPlan", () => {
  it("gives every deadline its own pot, saving from today to its own due date", () => {
    const result = buildParallelSavingsPlan({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
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
    // step down each time a pot's own deadline passes. Periods are the
    // gaps BETWEEN deadlines (2, then 3, then 4 months), not each pot's
    // own months-from-today (2, 5, 9).
    expect(result.periods.map((p) => p.openPotCount)).toEqual([3, 2, 1]);
    expect(result.periods.map((p) => p.monthsInPeriod)).toEqual([2, 3, 4]);
    expect(result.periods[0].totalMonthlySaving).toBeCloseTo(300 + 180 + 1200 / 9, 5);
    expect(result.periods[1].totalMonthlySaving).toBeCloseTo(180 + 1200 / 9, 5);
    expect(result.periods[2].totalMonthlySaving).toBeCloseTo(1200 / 9, 5);
  });

  it("gives the first pot's full share of available money before later pots get any", () => {
    const result = buildParallelSavingsPlan({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
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
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      obligations: [obligation("Deposit", 300, "2027-01-10")],
      availableUsd: 0,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    expect(result.pots[0]).toMatchObject({ monthsFromToday: 1, monthlySaving: 300 });
  });

  it("reports a past-due pot as a shortfall, excluded from the open-pot periods", () => {
    const result = buildParallelSavingsPlan({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      obligations: [obligation("Overdue deposit", 500, "2027-01-01"), obligation("Flight", 300, "2027-04-01")],
      availableUsd: 200,
      asOfDate: "2027-02-01",
      basis: "target",
    });

    const [overdue, flight] = result.pots;
    expect(overdue).toMatchObject({ isPastDue: true, monthsFromToday: null, monthlySaving: null, shortfallNow: 300 });
    expect(flight).toMatchObject({ availableShareUsd: 0, monthsFromToday: 2, monthlySaving: 150 });
    expect(result.periods).toEqual([
      { fromDate: "2027-02-01", toDate: "2027-04-01", totalMonthlySaving: 150, openPotCount: 1, monthsInPeriod: 2 },
    ]);
  });

  it("satisfies total saved + available money = total needed, with no unresolved shortfall", () => {
    const availableUsd = 0;
    const result = buildParallelSavingsPlan({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      obligations: THREE_DEADLINES,
      availableUsd,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    const totalSaved = result.pots.reduce((sum, p) => sum + (p.monthlySaving ?? 0) * (p.monthsFromToday ?? 0), 0);
    const totalNeeded = THREE_DEADLINES.reduce((sum, o) => sum + o.amountTargetUsd, 0);

    expect(totalSaved + availableUsd).toBeCloseTo(totalNeeded, 5);
  });

  it("still satisfies total saved + available money = total needed when two deadlines are under a month apart", () => {
    // Deposit and Registration are 10 days apart, and Deposit is only 14
    // days out from today -- both periods would clamp to "1 month" if
    // computed independently, which used to double-count the overlap.
    const availableUsd = 0;
    const obligations: ObligationForGrouping[] = [
      obligation("Deposit", 600, "2027-01-15"),
      obligation("Registration", 900, "2027-01-25"),
      obligation("Flight", 1200, "2027-06-01"),
    ];
    const result = buildParallelSavingsPlan({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      obligations,
      availableUsd,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    const totalSavedViaPeriods = result.periods.reduce(
      (sum, period) => sum + period.totalMonthlySaving * period.monthsInPeriod,
      0,
    );
    const totalNeeded = obligations.reduce((sum, o) => sum + o.amountTargetUsd, 0);

    expect(totalSavedViaPeriods + availableUsd).toBeCloseTo(totalNeeded, 5);
  });
});

describe("buildParallelSavingsPlan at the minimum basis", () => {
  it("sizes every pot at its minimum amount", () => {
    const obligations: ObligationForGrouping[] = [
      { description: "Registration", amountMinimumUsd: 400, amountTargetUsd: 600, amountConservativeUsd: 700, dueDate: "2027-03-01" },
      { description: "Flight", amountMinimumUsd: 500, amountTargetUsd: 900, amountConservativeUsd: 1000, dueDate: "2027-06-01" },
    ];
    const result = buildParallelSavingsPlan({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      obligations,
      availableUsd: 100,
      asOfDate: "2027-01-01",
      basis: "minimum",
    });
    expect(result.pots.map((p) => ({ amount: p.amountUsd, share: p.availableShareUsd, saving: p.monthlySaving }))).toEqual([
      { amount: 400, share: 100, saving: 150 },
      { amount: 500, share: 0, saving: 100 },
    ]);
  });
});
