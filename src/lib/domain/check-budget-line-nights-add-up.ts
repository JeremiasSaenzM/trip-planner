import { countNightsInBeds, type TimelineMovement } from "./build-itinerary-timeline";
import type { QuantityUnit } from "./types";

export type BudgetLineNightsCheckInput = {
  budgetLines: { quantity: number | null; quantityUnit: QuantityUnit | null }[];
  movements: TimelineMovement[];
  tripDepartureDate: string | null;
  tripReturnDate: string | null;
};

export type BudgetLineNightsCheckResult =
  | { status: "unknown" }
  | { status: "ok" }
  | { status: "mismatch"; linesNights: number; bedsNights: number };

/**
 * The scenario-wide version of checkBudgetLineMatchesStay: every
 * night-quantity line's count, summed, has to equal the nights the
 * itinerary actually puts in beds -- countNightsInBeds(), the same
 * function checkStayNightsMatchWindow and checkNightsAccountedFor use,
 * never a separate count of its own.
 */
export function checkBudgetLineNightsAddUp(input: BudgetLineNightsCheckInput): BudgetLineNightsCheckResult {
  const beds = countNightsInBeds({
    movements: input.movements,
    tripDepartureDate: input.tripDepartureDate,
    tripReturnDate: input.tripReturnDate,
  });
  if (beds.status === "unknown") return { status: "unknown" };

  const linesNights = input.budgetLines
    .filter((line) => line.quantityUnit === "night" && line.quantity !== null)
    .reduce((total, line) => total + (line.quantity as number), 0);

  if (linesNights === beds.nights) return { status: "ok" };
  return { status: "mismatch", linesNights, bedsNights: beds.nights };
}
