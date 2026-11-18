import type { BudgetLine, FxRate, Movement, Payment, SavingsEntry, Scenario, Trip, TripEvent } from "@/lib/data/types";
import { countNightsInBeds } from "@/lib/domain/build-itinerary-timeline";
import { buildDeadlinePots, type DeadlinePot } from "@/lib/domain/build-deadline-pots";
import { buildObligations, type BuildObligationsResult } from "@/lib/domain/build-obligations";
import { buildParallelSavingsPlan, type BuildParallelSavingsPlanResult } from "@/lib/domain/build-parallel-savings-plan";
import { calculateRequiredSavings, type CalculateRequiredSavingsResult } from "@/lib/domain/calculate-required-savings";
import { cumulativeRequiredSeries, type CumulativeRequiredPoint } from "@/lib/domain/cumulative-required-series";
import { TRAVELLER_INCOME_CADENCE } from "@/lib/domain/income-cadence";
import { resolveDepartureDate, type ResolvedDeparture } from "@/lib/domain/resolve-departure-date";
import { resolveTravelWindow, type ResolvedTravelWindow } from "@/lib/domain/resolve-travel-window";
import type { Basis } from "@/lib/domain/types";

export type ScenarioSavingsInput = {
  trip: Trip;
  scenario: Scenario;
  /** Every one of these unscoped -- this function does the trip and
   * scenario scoping itself, so no caller can scope them differently. */
  events: TripEvent[];
  budgetLines: BudgetLine[];
  payments: Payment[];
  savingsEntries: SavingsEntry[];
  rates: FxRate[];
  /** The basis every pot is sized at -- the page's own basis. */
  basis: Basis;
  asOfDate: string;
};

export type ScenarioSavings = {
  event: TripEvent | null;
  travelWindow: ResolvedTravelWindow;
  departure: ResolvedDeparture | null;
  tripBudgetLines: BudgetLine[];
  /** This scenario's own lines plus the trip's shared (scenario-less) ones. */
  scenarioBudgetLines: BudgetLine[];
  tripPayments: Payment[];
  scenarioPayments: Payment[];
  tripSavingsEntries: SavingsEntry[];
  obligationsResult: BuildObligationsResult;
  /** null when obligationsResult has no departure date to save toward. */
  savings: CalculateRequiredSavingsResult | null;
  /** Every saving deadline with what's in it, at input.basis
   * (buildDeadlinePots()). null when there's no departure date. */
  pots: DeadlinePot[] | null;
  /** "One pot per payment" at input.basis. null when there's no departure date. */
  parallelPlan: BuildParallelSavingsPlanResult | null;
};

/**
 * One scenario's savings plan, from raw rows to everything the savings
 * views draw: scoping, the travel window, the departure date, the
 * obligations (departure rule and income rule), and the schedule, the
 * deadline pots and the one-pot-per-payment plan built from them.
 *
 * The one place that happens. The dashboard calls it for the scenario
 * being viewed, and the scenario comparison chart calls it once for
 * every scenario of the trip -- the same function both times, so a line
 * on the comparison chart can't be computed differently from the
 * savings view of that same scenario.
 */
export function buildScenarioSavings(input: ScenarioSavingsInput): ScenarioSavings {
  const { trip, scenario, asOfDate } = input;

  const tripBudgetLines = input.budgetLines.filter((line) => line.tripId === trip.id);
  const scenarioBudgetLines = tripBudgetLines.filter(
    (line) => line.scenarioId === scenario.id || line.scenarioId === null,
  );

  // Trip-wide, for "already paid" -- a historical fact independent of
  // which scenario is selected. Scenario-scoped, for the obligations
  // this scenario actually needs funded.
  const tripPayments = input.payments.filter((payment) =>
    tripBudgetLines.some((line) => line.id === payment.budgetLineId),
  );
  const scenarioPayments = tripPayments.filter((payment) =>
    scenarioBudgetLines.some((line) => line.id === payment.budgetLineId),
  );
  const tripSavingsEntries = input.savingsEntries.filter((entry) => entry.tripId === trip.id);

  const event = scenario.eventId ? input.events.find((e) => e.id === scenario.eventId) ?? null : null;
  const travelWindow = resolveTravelWindow(scenario, trip);
  const departure = resolveDepartureDate({
    windowDepartureDate: travelWindow.departureDate,
    windowTravelDatesState: travelWindow.travelDatesState,
    windowOrigin: travelWindow.origin,
    eventStartDate: event?.startDate ?? null,
    eventDatesState: event?.datesState ?? null,
  });

  const obligationsResult = buildObligations({
    payments: scenarioPayments,
    allTripPayments: tripPayments,
    budgetLines: scenarioBudgetLines,
    savingsEntries: tripSavingsEntries.map((entry) => ({ amountUsd: entry.amount, recordedOn: entry.recordedOn })),
    rates: input.rates,
    departureDate: departure?.date ?? null,
    departureDateConfirmed: departure?.confirmed ?? false,
    incomeCadence: TRAVELLER_INCOME_CADENCE,
    asOfDate,
  });

  if (obligationsResult.status !== "ready") {
    return {
      event,
      travelWindow,
      departure,
      tripBudgetLines,
      scenarioBudgetLines,
      tripPayments,
      scenarioPayments,
      tripSavingsEntries,
      obligationsResult,
      savings: null,
      pots: null,
      parallelPlan: null,
    };
  }

  const savings = calculateRequiredSavings({
    asOfDate,
    savingsEntries: [{ amountUsd: obligationsResult.availableUsd, recordedOn: asOfDate }],
    obligations: obligationsResult.obligations,
    incomeCadence: TRAVELLER_INCOME_CADENCE,
  });

  const parallelPlan = buildParallelSavingsPlan({
    obligations: obligationsResult.obligations,
    availableUsd: obligationsResult.availableUsd,
    asOfDate,
    basis: input.basis,
    incomeCadence: TRAVELLER_INCOME_CADENCE,
    departureDate: obligationsResult.departureSaveBy,
  });

  const pots = buildDeadlinePots({
    obligations: obligationsResult.obligations,
    basis: input.basis,
    asOfDate,
    departureDate: obligationsResult.departureDate,
    availableUsd: obligationsResult.availableUsd,
  });

  return {
    event,
    travelWindow,
    departure,
    tripBudgetLines,
    scenarioBudgetLines,
    tripPayments,
    scenarioPayments,
    tripSavingsEntries,
    obligationsResult,
    savings,
    pots,
    parallelPlan,
  };
}

export type ScenarioComparisonLine = {
  scenarioId: string;
  name: string;
  /** The scenario the page is showing -- emphasised; every other line is context. */
  isViewed: boolean;
  /** The resolved travel window (resolveTravelWindow()): the scenario's
   * own when it set one, else the trip's. Both null when neither has one. */
  departureDate: string | null;
  returnDate: string | null;
  /** countNightsInBeds() over this scenario's own movements -- the same
   * count the stay-nights check uses. null when the window isn't set. */
  nightsInBeds: number | null;
  /** cumulativeRequiredSeries() of this scenario's schedule, at the basis
   * the page is showing. Empty when there's no line to draw (see noLineReason). */
  points: CumulativeRequiredPoint[];
  noLineReason: "no_departure_date" | "nothing_due" | null;
  /** This scenario's deadline pots, at the page's basis: exactly the
   * dueDate and amountUsd of buildScenarioSavings()'s own pots -- the
   * same list the "When money is needed" view shows. Saving deadlines,
   * after the departure clamp and the income rule, not payment due
   * dates. Empty when there's no departure date. */
  pots: { dueDate: string; amountUsd: number }[];
  /** Payments or budget lines left out of this scenario's figures for
   * want of an FX rate -- a line drawn without them sits too low. */
  missingRateCount: number;
};

/**
 * One entry per scenario of the trip, for the two scenario comparison
 * charts: the cumulative amount that must be saved by each date
 * (points), and how much each saving deadline holds (pots).
 *
 * Every entry -- the viewed scenario's and every other one -- is
 * buildScenarioSavings(), the same call the page's own savings views are
 * drawn from, at one shared basis; points go through
 * cumulativeRequiredSeries() exactly as the savings schedule chart's do,
 * and pots are copied field for field. Nothing here computes a figure
 * of its own.
 */
export function buildScenarioComparison(
  input: Omit<ScenarioSavingsInput, "scenario"> & {
    /** The trip's scenarios, in display order -- any of another trip's are ignored. */
    scenarios: Scenario[];
    viewedScenarioId: string;
    movements: Movement[];
  },
): ScenarioComparisonLine[] {
  return input.scenarios
    .filter((scenario) => scenario.tripId === input.trip.id)
    .map((scenario) => {
      const plan = buildScenarioSavings({ ...input, scenario });
      const nights = countNightsInBeds({
        movements: input.movements.filter((movement) => movement.scenarioId === scenario.id),
        departureDate: plan.travelWindow.departureDate,
        returnDate: plan.travelWindow.returnDate,
      });
      const points = plan.savings ? cumulativeRequiredSeries(plan.savings.schedule, input.basis, input.asOfDate) : [];

      return {
        scenarioId: scenario.id,
        name: scenario.name,
        isViewed: scenario.id === input.viewedScenarioId,
        departureDate: plan.travelWindow.departureDate,
        returnDate: plan.travelWindow.returnDate,
        nightsInBeds: nights.status === "ok" ? nights.nights : null,
        points,
        noLineReason: plan.savings === null ? "no_departure_date" : points.length === 0 ? "nothing_due" : null,
        pots: (plan.pots ?? []).map((pot) => ({ dueDate: pot.dueDate, amountUsd: pot.amountUsd })),
        missingRateCount: plan.obligationsResult.missingRates.length,
      };
    });
}
