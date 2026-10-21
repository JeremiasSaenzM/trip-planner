import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { calculateRequiredSavings, cumulativeAt, requiredMonthlyAt } from "./calculate-required-savings";
import { BASES } from "./types";

describe("calculateRequiredSavings", () => {
  it("makes the binding monthly requirement higher than total/months when an early payment is large", () => {
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [
        { dueDate: "2026-02-01", amountMinimumUsd: 600, amountTargetUsd: 600, amountConservativeUsd: 600 },
        { dueDate: "2027-01-01", amountMinimumUsd: 2400, amountTargetUsd: 2400, amountConservativeUsd: 2400 },
      ],
    });
    // naive total/months would be 3000/12 = 250
    expect(result.bindingRequirement.target).toBeGreaterThan(250);
    expect(result.bindingRequirement.target).toBe(600);
  });

  it("drops the first deadline's requirement to zero once savings cover it, while the second still needs funding", () => {
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [{ amountUsd: 600, recordedOn: "2026-01-01" }],
      obligations: [
        { dueDate: "2026-02-01", amountMinimumUsd: 600, amountTargetUsd: 600, amountConservativeUsd: 600 },
        { dueDate: "2027-01-01", amountMinimumUsd: 2400, amountTargetUsd: 2400, amountConservativeUsd: 2400 },
      ],
    });
    const [first, second] = result.schedule;
    expect(first.requiredMonthlyTarget).toBe(0);
    expect(second.requiredMonthlyTarget).toBe(200);
    expect(result.bindingRequirement.target).toBe(200);
  });

  it("treats a past-due deadline as a shortfall, not a monthly rate, and excludes it from bindingRequirement", () => {
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [{ dueDate: "2025-12-01", amountMinimumUsd: 500, amountTargetUsd: 500, amountConservativeUsd: 550 }],
    });
    expect(result.schedule[0].isPastDue).toBe(true);
    expect(result.schedule[0].requiredMonthlyTarget).toBeNull();
    expect(result.shortfallNow).toEqual({ minimum: 500, target: 500, conservative: 550 });
    expect(result.hasPastDueShortfall).toBe(true);
    expect(result.bindingRequirement).toEqual({ minimum: 0, target: 0, conservative: 0 });
  });

  it("returns an empty schedule and zeroed requirements when there are no obligations", () => {
    const result = calculateRequiredSavings({ asOfDate: "2026-01-01", savingsEntries: [], obligations: [] });
    expect(result.schedule).toEqual([]);
    expect(result.bindingRequirement).toEqual({ minimum: 0, target: 0, conservative: 0 });
    expect(result.hasPastDueShortfall).toBe(false);
  });

  it("clamps months-until to 1 for a deadline less than a month away, instead of inflating the requirement", () => {
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [{ dueDate: "2026-01-10", amountMinimumUsd: 300, amountTargetUsd: 300, amountConservativeUsd: 300 }],
    });
    expect(result.schedule[0].monthsUntil).toBe(1);
    expect(result.schedule[0].requiredMonthlyTarget).toBe(300);
  });

  it("uses the real fractional months-until for a deadline more than a month away (no clamping)", () => {
    const expectedMonths = DateTime.fromISO("2026-02-15").diff(DateTime.fromISO("2026-01-01"), "months").months;
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [{ dueDate: "2026-02-15", amountMinimumUsd: 300, amountTargetUsd: 300, amountConservativeUsd: 300 }],
    });
    expect(result.schedule[0].monthsUntil).toBeCloseTo(expectedMonths, 5);
    expect(result.schedule[0].monthsUntil).toBeGreaterThan(1);
    expect(result.schedule[0].requiredMonthlyTarget).toBeCloseTo(300 / expectedMonths, 5);
  });
});

describe("calculateRequiredSavings at the minimum basis", () => {
  const obligations = [
    { dueDate: "2026-02-01", amountMinimumUsd: 400, amountTargetUsd: 600, amountConservativeUsd: 700 },
    { dueDate: "2027-01-01", amountMinimumUsd: 1800, amountTargetUsd: 2400, amountConservativeUsd: 2600 },
  ];

  it("computes its own cumulative, remaining and monthly figures, alongside target and conservative", () => {
    const result = calculateRequiredSavings({ asOfDate: "2026-01-01", savingsEntries: [], obligations });
    const [first, second] = result.schedule;
    expect(first).toMatchObject({ cumulativeMinimum: 400, remainingMinimum: 400, requiredMonthlyMinimum: 400 });
    expect(second).toMatchObject({ cumulativeMinimum: 2200, remainingMinimum: 2200 });
    expect(second.requiredMonthlyMinimum).toBeCloseTo(2200 / 12, 5);
    expect(result.bindingRequirement).toEqual({ minimum: 400, target: 600, conservative: 700 });
  });

  it("nets money already saved off the minimum too", () => {
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [{ amountUsd: 400, recordedOn: "2026-01-01" }],
      obligations,
    });
    expect(result.schedule[0].requiredMonthlyMinimum).toBe(0);
    expect(result.schedule[1].requiredMonthlyMinimum).toBeCloseTo(1800 / 12, 5);
    expect(result.bindingRequirement.minimum).toBeCloseTo(1800 / 12, 5);
  });

  it("reports a past-due shortfall at the minimum, not a monthly rate", () => {
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [{ amountUsd: 450, recordedOn: "2025-11-01" }],
      obligations: [{ dueDate: "2025-12-01", amountMinimumUsd: 500, amountTargetUsd: 600, amountConservativeUsd: 650 }],
    });
    expect(result.schedule[0].requiredMonthlyMinimum).toBeNull();
    expect(result.shortfallNow).toEqual({ minimum: 50, target: 150, conservative: 200 });
    expect(result.bindingRequirement.minimum).toBe(0);
    expect(result.hasPastDueShortfall).toBe(true);
  });

  it("reads each basis off a schedule entry with cumulativeAt/requiredMonthlyAt", () => {
    const [first] = calculateRequiredSavings({ asOfDate: "2026-01-01", savingsEntries: [], obligations }).schedule;
    expect(BASES.map((basis) => cumulativeAt(first, basis))).toEqual([400, 600, 700]);
    expect(BASES.map((basis) => requiredMonthlyAt(first, basis))).toEqual([400, 600, 700]);
  });
});
