import type { Basis } from "./types";

export type ObligationForGrouping = {
  description: string;
  amountMinimumUsd: number;
  amountTargetUsd: number;
  amountConservativeUsd: number;
  dueDate: string;
  /** Where it came from -- see BuiltObligation.origin. Optional so plain
   * obligations (tests, older callers) still group. */
  origin?: { kind: string };
};

/** An obligation's amount at the given basis. */
export function obligationAmount(
  obligation: Pick<ObligationForGrouping, "amountMinimumUsd" | "amountTargetUsd" | "amountConservativeUsd">,
  basis: Basis,
): number {
  switch (basis) {
    case "minimum":
      return obligation.amountMinimumUsd;
    case "target":
      return obligation.amountTargetUsd;
    case "conservative":
      return obligation.amountConservativeUsd;
  }
}

export type DeadlineGroup<T extends ObligationForGrouping = ObligationForGrouping> = {
  dueDate: string;
  amountUsd: number;
  description: string;
  /** Every obligation summed into amountUsd, in input order -- so a
   * caller can list what a deadline is made of, not just its total. */
  items: T[];
};

/**
 * Groups obligations sharing the same due date into one deadline, summing
 * their amounts (at the given basis) and combining their descriptions.
 * An unallocated remainder that's zero at this basis is left out.
 * Sorted ascending by due date -- the shared starting point for both
 * buildPhasedSavingsPlan() and buildParallelSavingsPlan().
 *
 * departureDate (optional) is purely a labeling hint: a group of several
 * obligations that all land on the departure date is buildObligations()'s
 * "due at departure" bundle (one per budget line with nothing else to pin
 * it to), so it reads as "Before departure (N items)" rather than the
 * generic "N payments". Pass the date that bundle is saved by --
 * BuildObligationsResult.departureSaveBy, the last income date before
 * leaving -- since that's the date its obligations carry.
 */
export function groupObligationsByDueDate<T extends ObligationForGrouping>(
  obligations: T[],
  basis: Basis,
  departureDate?: string | null,
): DeadlineGroup<T>[] {
  const byDate = new Map<string, T[]>();
  for (const obligation of obligations) {
    // A line's unallocated remainder is built once for all three bases,
    // so it can be zero at this one (its payments cover the minimum, not
    // the target). Nothing to save means nothing to list -- and no
    // deadline, if it was the only thing due that day.
    if (obligation.origin?.kind === "unallocated" && obligationAmount(obligation, basis) <= 0) continue;
    const group = byDate.get(obligation.dueDate) ?? [];
    group.push(obligation);
    byDate.set(obligation.dueDate, group);
  }

  return [...byDate.entries()]
    .map(([dueDate, group]) => ({
      dueDate,
      amountUsd: group.reduce((sum, o) => sum + obligationAmount(o, basis), 0),
      description:
        group.length === 1
          ? group[0].description
          : dueDate === departureDate
            ? `Before departure (${group.length} items)`
            : `${group.length} payments`,
      items: group,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
