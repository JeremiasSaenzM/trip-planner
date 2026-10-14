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
};

export type BuildParallelSavingsPlanInput = {
  obligations: ObligationForGrouping[];
  /** Savings minus everything already paid -- same figure
   * buildObligations() produces, never a "savings capacity" guess. */
  availableUsd: number;
  asOfDate: string;
  basis: Basis;
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
  const deadlines = groupObligationsByDueDate(input.obligations, input.basis);

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
    return {
      fromDate: periodStart,
      toDate: pot.dueDate,
      totalMonthlySaving: stillOpen.reduce((sum, candidate) => sum + (candidate.monthlySaving ?? 0), 0),
      openPotCount: stillOpen.length,
    };
  });

  return { pots, periods };
}
