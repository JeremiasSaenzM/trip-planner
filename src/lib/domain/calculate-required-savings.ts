import { DateTime } from "luxon";

import type { Basis } from "./types";

export type Obligation = {
  amountMinimumUsd: number;
  amountTargetUsd: number;
  amountConservativeUsd: number;
  /** YYYY-MM-DD. Payments plus one synthetic "everything else, due at
   * departure" entry are expected to be composed by the caller -- this
   * function just takes whatever obligations it's given. */
  dueDate: string;
};

export type SavingsEntry = {
  amountUsd: number;
  /** YYYY-MM-DD */
  recordedOn: string;
};

export type CalculateRequiredSavingsInput = {
  obligations: Obligation[];
  savingsEntries: SavingsEntry[];
  /** YYYY-MM-DD, "today" */
  asOfDate: string;
};

export type ScheduleEntry = {
  dueDate: string;
  cumulativeMinimum: number;
  cumulativeTarget: number;
  cumulativeConservative: number;
  remainingMinimum: number;
  remainingTarget: number;
  remainingConservative: number;
  /** null for a past-due deadline -- dividing by "months until" makes no sense once it's already due. */
  monthsUntil: number | null;
  requiredMonthlyMinimum: number | null;
  requiredMonthlyTarget: number | null;
  requiredMonthlyConservative: number | null;
  isPastDue: boolean;
};

export type CalculateRequiredSavingsResult = {
  schedule: ScheduleEntry[];
  /** The maximum required-monthly figure across future deadlines only -- a past-due deadline doesn't have a "monthly" rate, it has a shortfall. */
  bindingRequirement: Record<Basis, number>;
  /** What's owed right now across every deadline that has already passed. */
  shortfallNow: Record<Basis, number>;
  hasPastDueShortfall: boolean;
};

/** A schedule entry's cumulative amount due at the given basis. */
export function cumulativeAt(entry: ScheduleEntry, basis: Basis): number {
  switch (basis) {
    case "minimum":
      return entry.cumulativeMinimum;
    case "target":
      return entry.cumulativeTarget;
    case "conservative":
      return entry.cumulativeConservative;
  }
}

/** A schedule entry's required monthly saving at the given basis (null when past due). */
export function requiredMonthlyAt(entry: ScheduleEntry, basis: Basis): number | null {
  switch (basis) {
    case "minimum":
      return entry.requiredMonthlyMinimum;
    case "target":
      return entry.requiredMonthlyTarget;
    case "conservative":
      return entry.requiredMonthlyConservative;
  }
}

/**
 * Required monthly saving, at each basis, per deadline: cumulative
 * amount due by then, minus money already saved, divided by the months
 * until then. Never takes a "savings capacity" input -- only what's
 * already been set aside.
 */
export function calculateRequiredSavings(input: CalculateRequiredSavingsInput): CalculateRequiredSavingsResult {
  const asOf = DateTime.fromISO(input.asOfDate);
  const saved = input.savingsEntries
    .filter((entry) => entry.recordedOn <= input.asOfDate)
    .reduce((sum, entry) => sum + entry.amountUsd, 0);

  const deadlines = [...new Set(input.obligations.map((obligation) => obligation.dueDate))].sort();

  const schedule: ScheduleEntry[] = deadlines.map((dueDate) => {
    const dueSoFar = input.obligations.filter((obligation) => obligation.dueDate <= dueDate);
    const cumulativeMinimum = dueSoFar.reduce((sum, o) => sum + o.amountMinimumUsd, 0);
    const cumulativeTarget = dueSoFar.reduce((sum, o) => sum + o.amountTargetUsd, 0);
    const cumulativeConservative = dueSoFar.reduce((sum, o) => sum + o.amountConservativeUsd, 0);
    const remainingMinimum = Math.max(0, cumulativeMinimum - saved);
    const remainingTarget = Math.max(0, cumulativeTarget - saved);
    const remainingConservative = Math.max(0, cumulativeConservative - saved);
    const isPastDue = dueDate <= input.asOfDate;

    if (isPastDue) {
      return {
        dueDate,
        cumulativeMinimum,
        cumulativeTarget,
        cumulativeConservative,
        remainingMinimum,
        remainingTarget,
        remainingConservative,
        monthsUntil: null,
        requiredMonthlyMinimum: null,
        requiredMonthlyTarget: null,
        requiredMonthlyConservative: null,
        isPastDue: true,
      };
    }

    const exactMonths = DateTime.fromISO(dueDate).diff(asOf, "months").months;
    const monthsUntil = Math.max(1, exactMonths);

    return {
      dueDate,
      cumulativeMinimum,
      cumulativeTarget,
      cumulativeConservative,
      remainingMinimum,
      remainingTarget,
      remainingConservative,
      monthsUntil,
      requiredMonthlyMinimum: remainingMinimum / monthsUntil,
      requiredMonthlyTarget: remainingTarget / monthsUntil,
      requiredMonthlyConservative: remainingConservative / monthsUntil,
      isPastDue: false,
    };
  });

  const futureEntries = schedule.filter((entry) => !entry.isPastDue);
  const bindingAt = (basis: Basis) =>
    futureEntries.reduce((max, entry) => Math.max(max, requiredMonthlyAt(entry, basis) ?? 0), 0);
  const bindingRequirement = {
    minimum: bindingAt("minimum"),
    target: bindingAt("target"),
    conservative: bindingAt("conservative"),
  };

  const pastDueEntries = schedule.filter((entry) => entry.isPastDue);
  const latestPastDue = pastDueEntries.at(-1);
  const shortfallNow = {
    minimum: latestPastDue?.remainingMinimum ?? 0,
    target: latestPastDue?.remainingTarget ?? 0,
    conservative: latestPastDue?.remainingConservative ?? 0,
  };

  return {
    schedule,
    bindingRequirement,
    shortfallNow,
    hasPastDueShortfall: shortfallNow.minimum > 0 || shortfallNow.target > 0 || shortfallNow.conservative > 0,
  };
}
