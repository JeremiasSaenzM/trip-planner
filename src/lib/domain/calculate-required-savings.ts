import { DateTime } from "luxon";

export type Obligation = {
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
  cumulativeTarget: number;
  cumulativeConservative: number;
  remainingTarget: number;
  remainingConservative: number;
  /** null for a past-due deadline -- dividing by "months until" makes no sense once it's already due. */
  monthsUntil: number | null;
  requiredMonthlyTarget: number | null;
  requiredMonthlyConservative: number | null;
  isPastDue: boolean;
};

export type CalculateRequiredSavingsResult = {
  schedule: ScheduleEntry[];
  /** The maximum required-monthly figure across future deadlines only -- a past-due deadline doesn't have a "monthly" rate, it has a shortfall. */
  bindingRequirement: { target: number; conservative: number };
  /** What's owed right now across every deadline that has already passed. */
  shortfallNow: { target: number; conservative: number };
  hasPastDueShortfall: boolean;
};

/**
 * Required monthly saving, target and conservative, per deadline:
 * cumulative amount due by then, minus money already saved, divided by
 * the months until then. Never takes a "savings capacity" input --
 * only what's already been set aside.
 */
export function calculateRequiredSavings(input: CalculateRequiredSavingsInput): CalculateRequiredSavingsResult {
  const asOf = DateTime.fromISO(input.asOfDate);
  const saved = input.savingsEntries
    .filter((entry) => entry.recordedOn <= input.asOfDate)
    .reduce((sum, entry) => sum + entry.amountUsd, 0);

  const deadlines = [...new Set(input.obligations.map((obligation) => obligation.dueDate))].sort();

  const schedule: ScheduleEntry[] = deadlines.map((dueDate) => {
    const dueSoFar = input.obligations.filter((obligation) => obligation.dueDate <= dueDate);
    const cumulativeTarget = dueSoFar.reduce((sum, o) => sum + o.amountTargetUsd, 0);
    const cumulativeConservative = dueSoFar.reduce((sum, o) => sum + o.amountConservativeUsd, 0);
    const remainingTarget = Math.max(0, cumulativeTarget - saved);
    const remainingConservative = Math.max(0, cumulativeConservative - saved);
    const isPastDue = dueDate <= input.asOfDate;

    if (isPastDue) {
      return {
        dueDate,
        cumulativeTarget,
        cumulativeConservative,
        remainingTarget,
        remainingConservative,
        monthsUntil: null,
        requiredMonthlyTarget: null,
        requiredMonthlyConservative: null,
        isPastDue: true,
      };
    }

    const exactMonths = DateTime.fromISO(dueDate).diff(asOf, "months").months;
    const monthsUntil = Math.max(1, exactMonths);

    return {
      dueDate,
      cumulativeTarget,
      cumulativeConservative,
      remainingTarget,
      remainingConservative,
      monthsUntil,
      requiredMonthlyTarget: remainingTarget / monthsUntil,
      requiredMonthlyConservative: remainingConservative / monthsUntil,
      isPastDue: false,
    };
  });

  const futureEntries = schedule.filter((entry) => !entry.isPastDue);
  const bindingRequirement = {
    target: futureEntries.reduce((max, entry) => Math.max(max, entry.requiredMonthlyTarget ?? 0), 0),
    conservative: futureEntries.reduce((max, entry) => Math.max(max, entry.requiredMonthlyConservative ?? 0), 0),
  };

  const pastDueEntries = schedule.filter((entry) => entry.isPastDue);
  const latestPastDue = pastDueEntries.at(-1);
  const shortfallNow = {
    target: latestPastDue?.remainingTarget ?? 0,
    conservative: latestPastDue?.remainingConservative ?? 0,
  };

  return {
    schedule,
    bindingRequirement,
    shortfallNow,
    hasPastDueShortfall: shortfallNow.target > 0 || shortfallNow.conservative > 0,
  };
}
