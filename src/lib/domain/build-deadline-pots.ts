import { obligationTiming, type BuiltObligation, type ObligationTiming } from "./build-obligations";
import { groupObligationsByDueDate, obligationAmount } from "./group-obligations-by-due-date";
import type { Basis } from "./types";

export type DeadlinePotItem = {
  description: string;
  /** At the selected basis, converted -- these sum to the pot's amountUsd. */
  amountUsd: number;
  /** In its own currency, at the selected basis -- see BuiltObligation.originalAmounts. */
  originalAmount: number;
  originalCurrency: string;
  /** The payment's own due date, null when it had none. */
  originalDueDate: string | null;
  timing: ObligationTiming;
  /** Only for an unallocated remainder: its line has payments, they just
   * don't cover all of it. False for everything else. */
  partlyCovered: boolean;
};

export type DeadlinePot = {
  /** YYYY-MM-DD, when the money in this pot has to be saved by: a
   * traveller's income date (see BuiltObligation.dueDate). */
  dueDate: string;
  /** YYYY-MM-DD, sorted: the days money in this pot is actually owed,
   * when that's later than dueDate -- what the income rule moved here
   * from. Empty when everything in it is owed on dueDate itself. */
  owedLaterOn: string[];
  /** Something in this pot is owed at departure (undated, unallocated,
   * due after leaving, or due on the day itself). */
  includesDeparture: boolean;
  amountUsd: number;
  isPastDue: boolean;
  /** Only for a past-due pot: how much of it the money already set aside
   * doesn't cover, taking pots in date order. null when it's covered --
   * then it's simply paid from savings, not a failure. */
  shortfallNow: number | null;
  items: DeadlinePotItem[];
};

// Inside one pot: what's genuinely due that day first, then what was
// moved there and why -- so the reasons read in a stable order.
const TIMING_ORDER: Record<ObligationTiming, number> = {
  on_date: 0,
  moved_to_departure: 1,
  undated: 2,
  unallocated: 3,
};

/**
 * Every deadline the savings plan saves toward, each listing the
 * individual obligations it's made of and how each one got there
 * (obligationTiming()). Built from the exact same obligations
 * calculateRequiredSavings() and the phased/parallel plans use, so the
 * list can never disagree with the headline figure about what's in it.
 *
 * Pots are keyed by saving deadline (an income date), so payments owed
 * on 30 June, 1 July and 2 July share one 30 June pot under month-end
 * income -- each item still carries its own originalDueDate.
 */
export function buildDeadlinePots(input: {
  obligations: BuiltObligation[];
  basis: Basis;
  asOfDate: string;
  /** The trip's departure date (not its saving deadline) -- to mark the pot that holds it. */
  departureDate: string;
  /** Money already set aside, net of what's been paid -- covers past-due pots first. */
  availableUsd: number;
}): DeadlinePot[] {
  let remaining = input.availableUsd;
  return groupObligationsByDueDate(input.obligations, input.basis).map((group) => {
    const isPastDue = group.dueDate <= input.asOfDate;
    let shortfallNow: number | null = null;
    if (isPastDue) {
      const covered = Math.max(0, Math.min(remaining, group.amountUsd));
      remaining -= covered;
      shortfallNow = group.amountUsd - covered > 0 ? group.amountUsd - covered : null;
    }
    return {
      dueDate: group.dueDate,
      owedLaterOn: [...new Set(group.items.map((o) => o.owedDate))].filter((d) => d !== group.dueDate).sort(),
      includesDeparture: group.items.some((o) => o.owedDate === input.departureDate),
      amountUsd: group.amountUsd,
      isPastDue,
      shortfallNow,
      items: group.items
        .map((obligation) => ({
          description: obligation.description,
          amountUsd: obligationAmount(obligation, input.basis),
          originalAmount: obligation.originalAmounts[input.basis],
          originalCurrency: obligation.originalCurrency,
          originalDueDate: obligation.originalDueDate,
          timing: obligationTiming(obligation),
          partlyCovered: obligation.origin.kind === "unallocated" && obligation.origin.partlyCovered,
        }))
        .sort(
          (a, b) =>
            TIMING_ORDER[a.timing] - TIMING_ORDER[b.timing] ||
            (a.originalDueDate ?? "").localeCompare(b.originalDueDate ?? "") ||
            a.description.localeCompare(b.description),
        ),
    };
  });
}
