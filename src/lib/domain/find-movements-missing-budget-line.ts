export type MovementMissingBudgetLine = { id: string; fromLocation: string; toLocation: string };

/**
 * Check 5: every movement should have a cost line to price it into the
 * budget. Listed as a soft warning, same spirit as findMissingFxRates
 * -- a movement with no budget_line_id yet isn't wrong, just unpriced.
 */
export function findMovementsMissingBudgetLine(
  movements: { id: string; fromLocation: string; toLocation: string; budgetLineId: string | null }[],
): MovementMissingBudgetLine[] {
  return movements
    .filter((movement) => movement.budgetLineId === null)
    .map(({ id, fromLocation, toLocation }) => ({ id, fromLocation, toLocation }));
}
