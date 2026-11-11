import { convertToUsd, type FxRate } from "./convert-to-usd";
import type { Basis, RateKind } from "./types";

export type TotalItineraryCostBudgetLine = {
  id: string;
  amountMin: number;
  amountTarget: number;
  amountConservative: number;
  currency: string;
};

export type TotalItineraryCostInput = {
  effectiveFlightCostAmount: number;
  effectiveFlightCostCurrency: string;
  /** Every route-caused link's own budgetLineId -- build with
   * selectRouteCausedBudgetLineIds below, which already excludes a
   * flight leg's own link (that one means "this movement IS the
   * ticket," not "caused by it," and its budget line is the fare,
   * already inside effectiveFlightCostAmount). A link with no budget
   * line yet is null, counted below rather than silently skipped.
   * Route-causation is only ever an explicit link, never guessed at
   * (20261028090000's own reasoning): "unavoidable route-caused costs"
   * means exactly these, nothing inferred from timing or location. */
  linkedBudgetLineIds: (string | null)[];
  budgetLines: TotalItineraryCostBudgetLine[];
  basis: Basis;
  rates: FxRate[];
  asOfDate: string;
};

export type RouteCausedLink = {
  flightOptionId: string | null;
  budgetLineId: string | null;
};

export type RouteCausedMovementLink = RouteCausedLink & {
  /** True when this movement IS the flight itself -- the itinerary
   * entry and the ticket restating each other (Movement.flightOptionId's
   * own doc comment: set "on the flight leg itself ... or on a
   * movement that only exists because of that ticket" -- the same
   * column, two readings). Never route-caused: its budget line is the
   * fare, already inside effectiveFlightCostAmount. Resolved by the
   * caller from the movement's own mode (mode === "plane") -- this
   * function only ever sees the resolved flag, same as
   * calculateOnwardTravelMinutes taking resolved zones rather than
   * looking locations up itself. */
  isFlightLeg: boolean;
};

/**
 * Which linked movements/stays count as route-caused, for the
 * flightOptionId being costed -- everything else calculateTotalItineraryCost
 * needs is already resolved at this point (the basis, the budget
 * lines, the fx rates). Split out as its own function so this
 * selection is exercised directly: the production bug this guards
 * against was exactly this step adding a flight leg's own link
 * (the fare) back in as if it were a separate route-caused cost.
 */
export function selectRouteCausedBudgetLineIds(input: {
  flightOptionId: string;
  movements: RouteCausedMovementLink[];
  stays: RouteCausedLink[];
}): (string | null)[] {
  return [
    ...input.movements
      .filter((movement) => movement.flightOptionId === input.flightOptionId && !movement.isFlightLeg)
      .map((movement) => movement.budgetLineId),
    ...input.stays
      .filter((stay) => stay.flightOptionId === input.flightOptionId)
      .map((stay) => stay.budgetLineId),
  ];
}

export type TotalItineraryCostResult = {
  amountUsd: number;
  /** false when a link has no budget line yet, a linked line's id
   * doesn't resolve, or a rate was missing for the flight cost or for
   * one of the route-caused lines -- amountUsd is still a best-effort
   * figure, just not the final word. */
  complete: boolean;
  missingBudgetLineCount: number;
};

function rateKindForBasis(basis: Basis): RateKind {
  return basis === "conservative" ? "planning_conservative" : "planning_base";
}

function amountAtBasis(line: TotalItineraryCostBudgetLine, basis: Basis): number {
  if (basis === "minimum") return line.amountMin;
  if (basis === "conservative") return line.amountConservative;
  return line.amountTarget;
}

/**
 * Total Itinerary Cost = Effective Flight Cost + unavoidable
 * route-caused costs (ground transport, forced extra nights). Each
 * route-caused budget line counted once even when several movements or
 * stays link to the same one -- a shared line double-counted would
 * overstate the route's own cost.
 */
export function calculateTotalItineraryCost(input: TotalItineraryCostInput): TotalItineraryCostResult {
  const rateKind = rateKindForBasis(input.basis);
  let amountUsd = 0;
  let complete = true;

  const efc = convertToUsd({
    amount: input.effectiveFlightCostAmount,
    currency: input.effectiveFlightCostCurrency,
    rateKind,
    rates: input.rates,
    asOfDate: input.asOfDate,
  });
  if (efc === null) {
    complete = false;
  } else {
    amountUsd += efc.amountUsd;
  }

  const missingBudgetLineCount = input.linkedBudgetLineIds.filter((id) => id === null).length;
  if (missingBudgetLineCount > 0) complete = false;

  const uniqueIds = [...new Set(input.linkedBudgetLineIds.filter((id): id is string => id !== null))];
  for (const id of uniqueIds) {
    const line = input.budgetLines.find((candidate) => candidate.id === id);
    if (!line) {
      complete = false;
      continue;
    }
    const converted = convertToUsd({
      amount: amountAtBasis(line, input.basis),
      currency: line.currency,
      rateKind,
      rates: input.rates,
      asOfDate: input.asOfDate,
    });
    if (converted === null) {
      complete = false;
      continue;
    }
    amountUsd += converted.amountUsd;
  }

  return { amountUsd, complete, missingBudgetLineCount };
}
