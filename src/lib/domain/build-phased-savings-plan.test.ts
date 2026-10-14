import { describe, expect, it } from "vitest";

import { buildPhasedSavingsPlan } from "./build-phased-savings-plan";
import type { ObligationForGrouping } from "./group-obligations-by-due-date";

function obligation(description: string, amountUsd: number, dueDate: string): ObligationForGrouping {
  return { description, amountTargetUsd: amountUsd, amountConservativeUsd: amountUsd, dueDate };
}

const THREE_DEADLINES: ObligationForGrouping[] = [
  obligation("Registration", 600, "2027-03-01"),
  obligation("Flight", 900, "2027-06-01"),
  obligation("Hotel", 1200, "2027-10-01"),
];

describe("buildPhasedSavingsPlan", () => {
  it("computes each phase's monthly saving from the previous deadline to the next", () => {
    const result = buildPhasedSavingsPlan({
      obligations: THREE_DEADLINES,
      availableUsd: 600,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    expect(result.phases.map((p) => ({ months: p.monthsInPhase, saving: p.monthlySaving }))).toEqual([
      { months: 2, saving: 0 }, // fully covered by available money, no saving needed
      { months: 3, saving: 300 },
      { months: 4, saving: 300 },
    ]);
  });

  it("carries the surplus forward when available money exceeds the first payment", () => {
    const result = buildPhasedSavingsPlan({
      obligations: THREE_DEADLINES,
      availableUsd: 2000,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    const [first, second, third] = result.phases;
    expect(first).toMatchObject({ monthlySaving: 0, balanceAfterPayment: 1400 });
    expect(second).toMatchObject({ monthlySaving: 0, balanceAfterPayment: 500 });
    expect(third).toMatchObject({ monthlySaving: 175, balanceAfterPayment: 0 });
  });

  it("clamps a phase shorter than a month to 1 month", () => {
    const result = buildPhasedSavingsPlan({
      obligations: [obligation("Deposit", 300, "2027-01-10")],
      availableUsd: 0,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    expect(result.phases[0]).toMatchObject({ monthsInPhase: 1, monthlySaving: 300 });
  });

  it("reports a past-due deadline as a shortfall, not a monthly rate, without disturbing later phases", () => {
    const result = buildPhasedSavingsPlan({
      obligations: [obligation("Overdue deposit", 500, "2027-01-01"), obligation("Flight", 300, "2027-04-01")],
      availableUsd: 200,
      asOfDate: "2027-02-01",
      basis: "target",
    });

    const [overdue, flight] = result.phases;
    expect(overdue).toMatchObject({
      isPastDue: true,
      monthsInPhase: null,
      monthlySaving: null,
      shortfallNow: 300,
      balanceAfterPayment: 0,
    });
    // The past-due entry consumed all 200 available; the flight phase
    // still runs from asOfDate (not from the overdue deadline's date).
    expect(flight).toMatchObject({ fromDate: "2027-02-01", monthsInPhase: 2, monthlySaving: 150 });
  });

  it("satisfies total saved + available money = total needed, with no unresolved shortfall", () => {
    const availableUsd = 600;
    const result = buildPhasedSavingsPlan({
      obligations: THREE_DEADLINES,
      availableUsd,
      asOfDate: "2027-01-01",
      basis: "target",
    });

    const totalSaved = result.phases.reduce((sum, p) => sum + (p.monthlySaving ?? 0) * (p.monthsInPhase ?? 0), 0);
    const totalNeeded = THREE_DEADLINES.reduce((sum, o) => sum + o.amountTargetUsd, 0);

    expect(totalSaved + availableUsd).toBeCloseTo(totalNeeded, 5);
  });
});
