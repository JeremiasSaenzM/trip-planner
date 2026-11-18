import type { BudgetLine, FxRate, Payment, SavingsEntry, Scenario, Trip, TripEvent } from "@/lib/data/types";
import { buildObligations, type BuildObligationsResult } from "@/lib/domain/build-obligations";
import { calculateRequiredSavings, type CalculateRequiredSavingsResult } from "@/lib/domain/calculate-required-savings";
import { TRAVELLER_INCOME_CADENCE } from "@/lib/domain/income-cadence";
import { resolveDepartureDate, type ResolvedDeparture } from "@/lib/domain/resolve-departure-date";
import { resolveTravelWindow, type ResolvedTravelWindow } from "@/lib/domain/resolve-travel-window";

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
};

/**
 * One scenario's savings plan, from raw rows to the required-savings
 * schedule: scoping, the travel window, the departure date, the
 * obligations (departure rule and income rule) and the schedule built
 * from them.
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

  const savings =
    obligationsResult.status === "ready"
      ? calculateRequiredSavings({
          asOfDate,
          savingsEntries: [{ amountUsd: obligationsResult.availableUsd, recordedOn: asOfDate }],
          obligations: obligationsResult.obligations,
          incomeCadence: TRAVELLER_INCOME_CADENCE,
        })
      : null;

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
  };
}
