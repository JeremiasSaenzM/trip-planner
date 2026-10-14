import { DateTime } from "luxon";

import { groupObligationsByDueDate, type ObligationForGrouping } from "./group-obligations-by-due-date";
import type { Basis } from "./types";

export type PhasedSavingsPhase = {
  description: string;
  /** YYYY-MM-DD. For a past-due deadline, equals toDate -- it isn't a
   * phase with a length, it's already behind asOfDate. */
  fromDate: string;
  /** YYYY-MM-DD, this deadline's own due date. */
  toDate: string;
  isPastDue: boolean;
  /** null for a past-due deadline -- it has no monthly rate, only a shortfall. */
  monthsInPhase: number | null;
  monthlySaving: number | null;
  /** The balance just before this deadline is paid -- the peak of the sawtooth. */
  balanceBeforePayment: number;
  /** The balance right after paying -- 0, or a surplus carried into the next phase. */
  balanceAfterPayment: number;
  /** Set only when isPastDue and available money didn't fully cover it. */
  shortfallNow: number | null;
};

export type BuildPhasedSavingsPlanInput = {
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

export type BuildPhasedSavingsPlanResult = {
  phases: PhasedSavingsPhase[];
};

function monthsBetween(fromDate: string, toDate: string): number {
  return Math.max(1, DateTime.fromISO(toDate).diff(DateTime.fromISO(fromDate), "months").months);
}

/**
 * "One phase at a time": each phase runs from the previous deadline
 * (today for the first) to the next one. The required monthly saving for
 * a phase bridges whatever gap is left between money already carried in
 * and that deadline's amount; once paid, the balance resets to zero plus
 * any surplus, which carries into the next phase. A past-due deadline
 * claims available money first (earliest due date first) but is reported
 * as a shortfall now, never as a monthly rate.
 */
export function buildPhasedSavingsPlan(input: BuildPhasedSavingsPlanInput): BuildPhasedSavingsPlanResult {
  const deadlines = groupObligationsByDueDate(input.obligations, input.basis, input.departureDate);

  let remaining = input.availableUsd;
  let phaseStart = input.asOfDate;
  const phases: PhasedSavingsPhase[] = [];

  for (const deadline of deadlines) {
    if (deadline.dueDate <= input.asOfDate) {
      const covered = Math.min(remaining, deadline.amountUsd);
      const shortfall = deadline.amountUsd - covered;
      remaining = remaining - covered;

      phases.push({
        description: deadline.description,
        fromDate: deadline.dueDate,
        toDate: deadline.dueDate,
        isPastDue: true,
        monthsInPhase: null,
        monthlySaving: null,
        balanceBeforePayment: deadline.amountUsd,
        balanceAfterPayment: remaining,
        shortfallNow: shortfall > 0 ? shortfall : null,
      });
      continue;
    }

    const months = monthsBetween(phaseStart, deadline.dueDate);
    const moneyCarriedIn = remaining;
    const monthlySaving = Math.max(0, (deadline.amountUsd - moneyCarriedIn) / months);
    const balanceAfterPayment = Math.max(0, moneyCarriedIn - deadline.amountUsd);

    phases.push({
      description: deadline.description,
      fromDate: phaseStart,
      toDate: deadline.dueDate,
      isPastDue: false,
      monthsInPhase: months,
      monthlySaving,
      balanceBeforePayment: deadline.amountUsd,
      balanceAfterPayment,
      shortfallNow: null,
    });

    remaining = balanceAfterPayment;
    phaseStart = deadline.dueDate;
  }

  return { phases };
}
