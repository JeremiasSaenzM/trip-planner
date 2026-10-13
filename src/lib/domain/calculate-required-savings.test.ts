import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { calculateRequiredSavings } from "./calculate-required-savings";

describe("calculateRequiredSavings", () => {
  it("makes the binding monthly requirement higher than total/months when an early payment is large", () => {
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [
        { dueDate: "2026-02-01", amountTargetUsd: 600, amountConservativeUsd: 600 },
        { dueDate: "2027-01-01", amountTargetUsd: 2400, amountConservativeUsd: 2400 },
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
        { dueDate: "2026-02-01", amountTargetUsd: 600, amountConservativeUsd: 600 },
        { dueDate: "2027-01-01", amountTargetUsd: 2400, amountConservativeUsd: 2400 },
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
      obligations: [{ dueDate: "2025-12-01", amountTargetUsd: 500, amountConservativeUsd: 550 }],
    });
    expect(result.schedule[0].isPastDue).toBe(true);
    expect(result.schedule[0].requiredMonthlyTarget).toBeNull();
    expect(result.shortfallNow).toEqual({ target: 500, conservative: 550 });
    expect(result.hasPastDueShortfall).toBe(true);
    expect(result.bindingRequirement).toEqual({ target: 0, conservative: 0 });
  });

  it("returns an empty schedule and zeroed requirements when there are no obligations", () => {
    const result = calculateRequiredSavings({ asOfDate: "2026-01-01", savingsEntries: [], obligations: [] });
    expect(result.schedule).toEqual([]);
    expect(result.bindingRequirement).toEqual({ target: 0, conservative: 0 });
    expect(result.hasPastDueShortfall).toBe(false);
  });

  it("clamps months-until to 1 for a deadline less than a month away, instead of inflating the requirement", () => {
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [{ dueDate: "2026-01-10", amountTargetUsd: 300, amountConservativeUsd: 300 }],
    });
    expect(result.schedule[0].monthsUntil).toBe(1);
    expect(result.schedule[0].requiredMonthlyTarget).toBe(300);
  });

  it("uses the real fractional months-until for a deadline more than a month away (no clamping)", () => {
    const expectedMonths = DateTime.fromISO("2026-02-15").diff(DateTime.fromISO("2026-01-01"), "months").months;
    const result = calculateRequiredSavings({
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [{ dueDate: "2026-02-15", amountTargetUsd: 300, amountConservativeUsd: 300 }],
    });
    expect(result.schedule[0].monthsUntil).toBeCloseTo(expectedMonths, 5);
    expect(result.schedule[0].monthsUntil).toBeGreaterThan(1);
    expect(result.schedule[0].requiredMonthlyTarget).toBeCloseTo(300 / expectedMonths, 5);
  });
});
