import { DateTime } from "luxon";

import { groupObligationsByDueDate, type ObligationForGrouping } from "./group-obligations-by-due-date";
import type { Basis } from "./types";

export type SavingsPot = {
  description: string;
  dueDate: string;
  amountUsd: number;
  isPastDue: boolean;
  /** This pot's share of availableUsd -- earliest due date claims its
   * share first, same order as buildPhasedSavingsPlan. */
  availableShareUsd: number;
  /** null for a past-due pot -- it has no monthly rate, only a shortfall. */
  monthsFromToday: number | null;
  monthlySaving: number | null;
  /** Set only when isPastDue and its share didn't fully cover it. */
  shortfallNow: number | null;
};

export type ParallelSavingsPeriod = {
  /** YYYY-MM-DD. The first period starts today; each later one starts
   * the moment a pot closes. */
  fromDate: string;
  /** YYYY-MM-DD, the due date of the pot that closes at the end of this period. */
  toDate: string;
  /** The combined monthly saving across every pot still open during this period. */
  totalMonthlySaving: number;
  openPotCount: number;
  /** fromDate to toDate, in months (the same "shorter than a month counts
   * as 1" clamp as everywhere else) -- how long this period's rate applies. */
  monthsInPeriod: number;
};

export type BuildParallelSavingsPlanInput = {
  obligations: ObligationForGrouping[];
  /** Savings minus everything already paid -- same figure
   * buildObligations() produces, never a "savings capacity" guess. */
  availableUsd: number;
  asOfDate: string;
  basis: Basis;
  /** Labeling hint only, passed through to groupObligationsByDueDate() --
   * see its own doc comment. */
  departureDate?: string | null;
};

export type BuildParallelSavingsPlanResult = {
  pots: SavingsPot[];
  periods: ParallelSavingsPeriod[];
};

function monthsBetween(fromDate: string, toDate: string): number {
  return Math.max(1, DateTime.fromISO(toDate).diff(DateTime.fromISO(fromDate), "months").months);
}

/**
 * "One pot per payment": every deadline gets its own pot, and every pot
 * starts saving today. Available money is still claimed earliest-due-date
 * first (each pot's "share"), but each pot's monthly saving is spread
 * over the months from today to its own due date, not a shared phase. The
 * total monthly saving for a stretch of time is the sum of every pot that
 * hasn't closed (been paid) yet.
 */
export function buildParallelSavingsPlan(input: BuildParallelSavingsPlanInput): BuildParallelSavingsPlanResult {
  const deadlines = groupObligationsByDueDate(input.obligations, input.basis, input.departureDate);

  let remaining = input.availableUsd;
  const pots: SavingsPot[] = [];

  for (const deadline of deadlines) {
    const share = Math.min(remaining, deadline.amountUsd);
    remaining -= share;
    const isPastDue = deadline.dueDate <= input.asOfDate;

    if (isPastDue) {
      const shortfall = deadline.amountUsd - share;
      pots.push({
        description: deadline.description,
        dueDate: deadline.dueDate,
        amountUsd: deadline.amountUsd,
        isPastDue: true,
        availableShareUsd: share,
        monthsFromToday: null,
        monthlySaving: null,
        shortfallNow: shortfall > 0 ? shortfall : null,
      });
      continue;
    }

    const months = monthsBetween(input.asOfDate, deadline.dueDate);
    const monthlySaving = Math.max(0, (deadline.amountUsd - share) / months);

    pots.push({
      description: deadline.description,
      dueDate: deadline.dueDate,
      amountUsd: deadline.amountUsd,
      isPastDue: false,
      availableShareUsd: share,
      monthsFromToday: months,
      monthlySaving,
      shortfallNow: null,
    });
  }

  const openPots = pots.filter((pot) => !pot.isPastDue);
  const periodBoundaries = [input.asOfDate, ...openPots.map((pot) => pot.dueDate)];

  const periods: ParallelSavingsPeriod[] = openPots.map((pot, index) => {
    const periodStart = periodBoundaries[index];
    const stillOpen = openPots.filter((candidate) => candidate.dueDate >= pot.dueDate);
    // Each pot's own monthsFromToday is already clamped to a minimum of
    // 1 month. Re-deriving this period's length from a fresh
    // monthsBetween(periodStart, pot.dueDate) would clamp it *again*,
    // independently -- when two due dates are each under a month apart,
    // both periods round up to "1 month" even though together they can't
    // exceed the real elapsed time, double-counting the saving between
    // them. Taking the difference of the already-clamped cumulative
    // totals instead guarantees every pot's open periods sum to exactly
    // its own monthsFromToday, however short the gaps are.
    const previousMonthsFromToday = index > 0 ? openPots[index - 1].monthsFromToday ?? 0 : 0;
    return {
      fromDate: periodStart,
      toDate: pot.dueDate,
      totalMonthlySaving: stillOpen.reduce((sum, candidate) => sum + (candidate.monthlySaving ?? 0), 0),
      openPotCount: stillOpen.length,
      monthsInPeriod: (pot.monthsFromToday ?? 0) - previousMonthsFromToday,
    };
  });

  return { pots, periods };
}
