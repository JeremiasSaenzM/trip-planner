import type { QuantityUnit } from "./types";

export type BudgetLineStayMismatch = {
  budgetLineId: string;
  description: string;
  quantity: number;
  stayId: string;
  stayNights: number;
};

/**
 * The strongest of the 6.4b checks, because it's exact: a budget line
 * linked to a stay and priced by the night ("Paris nights (13)") must
 * carry the same number that stay actually has. A line with no
 * quantity, or one priced by day/person/item, isn't this check's
 * business -- only a night-quantity line pointed at by a stay.
 */
export function checkBudgetLineMatchesStay(
  stays: { id: string; nights: number; budgetLineId: string | null }[],
  budgetLines: { id: string; description: string; quantity: number | null; quantityUnit: QuantityUnit | null }[],
): BudgetLineStayMismatch[] {
  const mismatches: BudgetLineStayMismatch[] = [];

  for (const stay of stays) {
    if (!stay.budgetLineId) continue;
    const line = budgetLines.find((candidate) => candidate.id === stay.budgetLineId);
    if (!line || line.quantityUnit !== "night" || line.quantity === null) continue;
    if (line.quantity !== stay.nights) {
      mismatches.push({
        budgetLineId: line.id,
        description: line.description,
        quantity: line.quantity,
        stayId: stay.id,
        stayNights: stay.nights,
      });
    }
  }

  return mismatches;
}
