import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { calculateRequiredSavings, cumulativeAt, requiredMonthlyAt } from "./calculate-required-savings";
import { TRAVELLER_INCOME_CADENCE } from "./income-cadence";
import { BASES } from "./types";

describe("calculateRequiredSavings", () => {
  it("makes the binding monthly requirement higher than total/months when an early payment is large", () => {
    const result = calculateRequiredSavings({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
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
      incomeCadence: TRAVELLER_INCOME_CADENCE,
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
      incomeCadence: TRAVELLER_INCOME_CADENCE,
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
    const result = calculateRequiredSavings({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [],
    });
    expect(result.schedule).toEqual([]);
    expect(result.bindingRequirement).toEqual({ minimum: 0, target: 0, conservative: 0 });
    expect(result.hasPastDueShortfall).toBe(false);
  });

  it("clamps months-until to 1 for a deadline less than a month away, instead of inflating the requirement", () => {
    const result = calculateRequiredSavings({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [{ dueDate: "2026-01-10", amountMinimumUsd: 300, amountTargetUsd: 300, amountConservativeUsd: 300 }],
    });
    expect(result.schedule[0].monthsUntil).toBe(1);
    expect(result.schedule[0].requiredMonthlyTarget).toBe(300);
  });

  it("divides by the income dates left before a deadline, never by fractional months", () => {
    // 20 Oct 2026 to 30 Jun 2028: 20.33 months on the calendar, but 21
    // month-end paydays (31 Oct 2026 ... 30 Jun 2028) to save from.
    const result = calculateRequiredSavings({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      asOfDate: "2026-10-20",
      savingsEntries: [],
      obligations: [{ dueDate: "2028-06-30", amountMinimumUsd: 2100, amountTargetUsd: 2100, amountConservativeUsd: 2100 }],
    });
    expect(result.schedule[0].monthsUntil).toBe(21);
    expect(result.schedule[0].requiredMonthlyTarget).toBe(100);

    const fractionalMonths = DateTime.fromISO("2028-06-30").diff(DateTime.fromISO("2026-10-20"), "months").months;
    expect(fractionalMonths).toBeCloseTo(20.33, 2);
    expect(result.schedule[0].requiredMonthlyTarget!).toBeLessThan(2100 / fractionalMonths);
  });

  it("counts only the paydays before a deadline that falls mid-month", () => {
    // 1 Jan to 15 Feb: only 31 January's income arrives in time.
    const result = calculateRequiredSavings({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations: [{ dueDate: "2026-02-15", amountMinimumUsd: 300, amountTargetUsd: 300, amountConservativeUsd: 300 }],
    });
    expect(result.schedule[0].monthsUntil).toBe(1);
    expect(result.schedule[0].requiredMonthlyTarget).toBe(300);
  });
});

describe("calculateRequiredSavings at the minimum basis", () => {
  const obligations = [
    { dueDate: "2026-02-01", amountMinimumUsd: 400, amountTargetUsd: 600, amountConservativeUsd: 700 },
    { dueDate: "2027-01-01", amountMinimumUsd: 1800, amountTargetUsd: 2400, amountConservativeUsd: 2600 },
  ];

  it("computes its own cumulative, remaining and monthly figures, alongside target and conservative", () => {
    const result = calculateRequiredSavings({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
      asOfDate: "2026-01-01",
      savingsEntries: [],
      obligations,
    });
    const [first, second] = result.schedule;
    expect(first).toMatchObject({ cumulativeMinimum: 400, remainingMinimum: 400, requiredMonthlyMinimum: 400 });
    expect(second).toMatchObject({ cumulativeMinimum: 2200, remainingMinimum: 2200 });
    expect(second.requiredMonthlyMinimum).toBeCloseTo(2200 / 12, 5);
    expect(result.bindingRequirement).toEqual({ minimum: 400, target: 600, conservative: 700 });
  });

  it("nets money already saved off the minimum too", () => {
    const result = calculateRequiredSavings({
      incomeCadence: TRAVELLER_INCOME_CADENCE,
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
      incomeCadence: TRAVELLER_INCOME_CADENCE,
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
    const [first] = calculateRequiredSavings({ incomeCadence: TRAVELLER_INCOME_CADENCE, asOfDate: "2026-01-01", savingsEntries: [], obligations }).schedule;
    expect(BASES.map((basis) => cumulativeAt(first, basis))).toEqual([400, 600, 700]);
    expect(BASES.map((basis) => requiredMonthlyAt(first, basis))).toEqual([400, 600, 700]);
  });
});
