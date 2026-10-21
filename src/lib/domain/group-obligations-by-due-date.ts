import type { Basis } from "./types";

export type ObligationForGrouping = {
  description: string;
  amountMinimumUsd: number;
  amountTargetUsd: number;
  amountConservativeUsd: number;
  dueDate: string;
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

export type DeadlineGroup = {
  dueDate: string;
  amountUsd: number;
  description: string;
};

/**
 * Groups obligations sharing the same due date into one deadline, summing
 * their amounts (at the given basis) and combining their descriptions.
 * Sorted ascending by due date -- the shared starting point for both
 * buildPhasedSavingsPlan() and buildParallelSavingsPlan().
 *
 * departureDate (optional) is purely a labeling hint: a group of several
 * obligations that all land on the departure date is buildObligations()'s
 * "due at departure" bundle (one per budget line with nothing else to pin
 * it to), so it reads as "Before departure (N items)" rather than the
 * generic "N payments".
 */
export function groupObligationsByDueDate(
  obligations: ObligationForGrouping[],
  basis: Basis,
  departureDate?: string | null,
): DeadlineGroup[] {
  const byDate = new Map<string, ObligationForGrouping[]>();
  for (const obligation of obligations) {
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
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
