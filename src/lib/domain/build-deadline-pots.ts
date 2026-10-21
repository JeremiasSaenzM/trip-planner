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
  /** YYYY-MM-DD, when the money in this pot is needed by. */
  dueDate: string;
  amountUsd: number;
  isPastDue: boolean;
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
 */
export function buildDeadlinePots(input: {
  obligations: BuiltObligation[];
  basis: Basis;
  asOfDate: string;
}): DeadlinePot[] {
  return groupObligationsByDueDate(input.obligations, input.basis).map((group) => ({
    dueDate: group.dueDate,
    amountUsd: group.amountUsd,
    isPastDue: group.dueDate <= input.asOfDate,
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
  }));
}
