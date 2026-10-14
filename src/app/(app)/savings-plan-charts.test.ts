import { describe, expect, it } from "vitest";

import { buildParallelSavingsPlan } from "@/lib/domain/build-parallel-savings-plan";
import { buildPhasedSavingsPlan } from "@/lib/domain/build-phased-savings-plan";
import type { ObligationForGrouping } from "@/lib/domain/group-obligations-by-due-date";

import { buildParallelSawtoothData, buildPhasedSawtoothData } from "./savings-plan-charts";

function obligation(description: string, amountUsd: number, dueDate: string): ObligationForGrouping {
  return { description, amountTargetUsd: amountUsd, amountConservativeUsd: amountUsd, dueDate };
}

// Three deadlines, today being 2027-01-01. The gap between the first two
// (Jan 15 -> Jan 25) is under a month, same as between today and the
// first one -- the case where a period's months get clamped to a minimum
// of 1 even though its real span is shorter.
const THREE_DEADLINES_WITH_SHORT_GAP: ObligationForGrouping[] = [
  obligation("Deposit", 600, "2027-01-15"),
  obligation("Registration", 900, "2027-01-25"),
  obligation("Flight", 1200, "2027-06-01"),
];
const AS_OF_DATE = "2027-01-01";

describe("buildPhasedSawtoothData", () => {
  it("ends within $1 of zero after the final payment", () => {
    const plan = buildPhasedSavingsPlan({
      obligations: THREE_DEADLINES_WITH_SHORT_GAP,
      availableUsd: 0,
      asOfDate: AS_OF_DATE,
      basis: "target",
    });

    const data = buildPhasedSawtoothData(plan, 0, AS_OF_DATE);
    const finalBalance = data[data.length - 1].balance;

    expect(Math.abs(finalBalance)).toBeLessThan(1);
  });
});

describe("buildParallelSawtoothData", () => {
  it("ends within $1 of zero after the final payment", () => {
    const plan = buildParallelSavingsPlan({
      obligations: THREE_DEADLINES_WITH_SHORT_GAP,
      availableUsd: 0,
      asOfDate: AS_OF_DATE,
      basis: "target",
    });

    const data = buildParallelSawtoothData(plan, 0, AS_OF_DATE);
    const finalBalance = data[data.length - 1].balance;

    // This must hold on the *real* math, not because Math.max(0, ...)
    // floors a would-be-negative result to look like zero -- if the
    // uncovered final balance (before any clamping) isn't actually near
    // zero, that's a bug in how periods are built, not something this
    // test should paper over.
    expect(Math.abs(finalBalance)).toBeLessThan(1);
  });
});
