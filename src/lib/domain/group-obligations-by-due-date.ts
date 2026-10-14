import type { Basis } from "./types";

export type ObligationForGrouping = {
  description: string;
  amountTargetUsd: number;
  amountConservativeUsd: number;
  dueDate: string;
};

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
 */
export function groupObligationsByDueDate(
  obligations: ObligationForGrouping[],
  basis: Basis,
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
      amountUsd: group.reduce(
        (sum, o) => sum + (basis === "target" ? o.amountTargetUsd : o.amountConservativeUsd),
        0,
      ),
      description: group.length === 1 ? group[0].description : `${group.length} payments`,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
