import { countDaysOnGround, type TimelineMovement } from "./build-itinerary-timeline";
import type { BudgetCategory, QuantityUnit } from "./types";

export type BudgetLineDaysCheckResult = { status: "ok" } | { status: "mismatch"; linesDays: number; groundDays: number };

/**
 * Food is priced per day on the ground, not per night in a bed, so it
 * gets its own count rather than reusing countNightsInBeds() --
 * countDaysOnGround() instead, the same count the night-by-night
 * strip's "N days on the ground" line already shows. Scoped to
 * category E: a day-quantity line in another category (there's no
 * reason for one yet) isn't this check's business.
 */
export function checkBudgetLineDaysAddUp(
  budgetLines: { category: BudgetCategory; quantity: number | null; quantityUnit: QuantityUnit | null }[],
  movements: TimelineMovement[],
): BudgetLineDaysCheckResult {
  const linesDays = budgetLines
    .filter((line) => line.category === "E" && line.quantityUnit === "day" && line.quantity !== null)
    .reduce((total, line) => total + (line.quantity as number), 0);

  const groundDays = countDaysOnGround(movements);

  if (linesDays === groundDays) return { status: "ok" };
  return { status: "mismatch", linesDays, groundDays };
}
