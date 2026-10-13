import { convertToUsd, type FxRate } from "./convert-to-usd";
import type { BudgetCategory, InfoState, RateKind } from "./types";

const ALL_CATEGORIES: BudgetCategory[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const ALL_INFO_STATES: InfoState[] = [
  "confirmed",
  "estimate",
  "assumption",
  "decision",
  "pending",
  "historical",
  "conflicting",
];

export type BudgetLineForRollup = {
  tripId: string;
  scenarioId: string | null;
  category: BudgetCategory;
  amountMin: number;
  amountTarget: number;
  amountConservative: number;
  currency: string;
  informationState: InfoState;
};

export type RollUpBudgetByScenarioInput = {
  tripId: string;
  scenarioId: string;
  asOfDate: string;
  budgetLines: BudgetLineForRollup[];
  rates: FxRate[];
};

export type CategoryTotals = { min: number; target: number; conservative: number };

export type MissingRate = { category: BudgetCategory; currency: string; rateKind: RateKind };

export type RollUpBudgetByScenarioResult = {
  totals: CategoryTotals;
  byCategory: Record<BudgetCategory, CategoryTotals>;
  statesPresent: Record<InfoState, number>;
  allConfirmed: boolean;
  /** Every line a rate couldn't be found for -- that line's contribution
   * is excluded from totals, never silently dropped without a trace. */
  missingRates: MissingRate[];
  complete: boolean;
};

/**
 * Rolls up a scenario's budget lines (its own plus the trip's shared,
 * scenario_id = null, lines -- never another trip's shared lines) into
 * USD totals. min/target convert at the planning_base rate,
 * conservative at planning_conservative, matching the planning-vs-
 * financial-safety-test split in CLAUDE.md.
 */
export function rollUpBudgetByScenario(input: RollUpBudgetByScenarioInput): RollUpBudgetByScenarioResult {
  const totals: CategoryTotals = { min: 0, target: 0, conservative: 0 };
  const byCategory = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [category, { min: 0, target: 0, conservative: 0 }]),
  ) as Record<BudgetCategory, CategoryTotals>;
  const statesPresent = Object.fromEntries(ALL_INFO_STATES.map((state) => [state, 0])) as Record<
    InfoState,
    number
  >;
  const missingRates: MissingRate[] = [];

  const includedLines = input.budgetLines.filter(
    (line) => line.tripId === input.tripId && (line.scenarioId === input.scenarioId || line.scenarioId === null),
  );

  for (const line of includedLines) {
    statesPresent[line.informationState] += 1;

    const minUsd = convertToUsd({
      amount: line.amountMin,
      currency: line.currency,
      rateKind: "planning_base",
      rates: input.rates,
      asOfDate: input.asOfDate,
    });
    const targetUsd = convertToUsd({
      amount: line.amountTarget,
      currency: line.currency,
      rateKind: "planning_base",
      rates: input.rates,
      asOfDate: input.asOfDate,
    });
    const conservativeUsd = convertToUsd({
      amount: line.amountConservative,
      currency: line.currency,
      rateKind: "planning_conservative",
      rates: input.rates,
      asOfDate: input.asOfDate,
    });

    if (minUsd === null || targetUsd === null) {
      missingRates.push({ category: line.category, currency: line.currency, rateKind: "planning_base" });
    } else {
      totals.min += minUsd.amountUsd;
      totals.target += targetUsd.amountUsd;
      byCategory[line.category].min += minUsd.amountUsd;
      byCategory[line.category].target += targetUsd.amountUsd;
    }

    if (conservativeUsd === null) {
      missingRates.push({ category: line.category, currency: line.currency, rateKind: "planning_conservative" });
    } else {
      totals.conservative += conservativeUsd.amountUsd;
      byCategory[line.category].conservative += conservativeUsd.amountUsd;
    }
  }

  return {
    totals,
    byCategory,
    statesPresent,
    allConfirmed: includedLines.length > 0 && includedLines.every((line) => line.informationState === "confirmed"),
    missingRates,
    complete: missingRates.length === 0,
  };
}
