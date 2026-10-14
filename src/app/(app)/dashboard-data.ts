import "server-only";

import { dataSource } from "@/lib/data";
import type { Competition, OpenItem, Payment, Scenario, Trip } from "@/lib/data/types";
import { buildObligations, type BuiltObligation } from "@/lib/domain/build-obligations";
import { buildParallelSavingsPlan, type BuildParallelSavingsPlanResult } from "@/lib/domain/build-parallel-savings-plan";
import { buildPhasedSavingsPlan, type BuildPhasedSavingsPlanResult } from "@/lib/domain/build-phased-savings-plan";
import { calculateRequiredSavings, type CalculateRequiredSavingsResult } from "@/lib/domain/calculate-required-savings";
import { rollUpBudgetByScenario, type RollUpBudgetByScenarioResult } from "@/lib/domain/roll-up-budget-by-scenario";
import type { Basis } from "@/lib/domain/types";

export type { Basis };

export type DashboardData =
  | { status: "no_trip" }
  | { status: "no_scenario"; trip: Trip }
  | {
      status: "ready";
      trip: Trip;
      scenario: Scenario;
      scenarios: Scenario[];
      competition: Competition | null;
      basis: Basis;
      asOfDate: string;
      rollup: RollUpBudgetByScenarioResult;
      /** null when the scenario has no competition yet -- see noDepartureDate. */
      savings: CalculateRequiredSavingsResult | null;
      noDepartureDate: boolean;
      provisional: boolean;
      obligations: BuiltObligation[];
      /** Savings minus everything already paid. 0 when noDepartureDate
       * (buildObligations never ran, so there's nothing to report). */
      availableUsd: number;
      /** null when noDepartureDate -- there are no obligations to plan against. */
      phasedPlan: BuildPhasedSavingsPlanResult | null;
      parallelPlan: BuildParallelSavingsPlanResult | null;
      /** Scenario-scoped: this scenario's own payments plus the trip's shared ones. */
      payments: Payment[];
      /** Trip-scoped (open items aren't scenario-specific). */
      openItems: OpenItem[];
    };

// The one place every dashboard page (Overview, Payments, Deadlines)
// gets its data from. Resolves the current trip (the only one, for now
// -- CLAUDE.md's Phase 4 scope doesn't call for a trip switcher) and the
// selected scenario/basis, then runs the domain functions once so the
// three screens stay consistent with each other.
export async function loadDashboardData(params: {
  scenarioId?: string;
  basis?: string;
}): Promise<DashboardData> {
  const [trips, scenarios, competitions, budgetLines, payments, savingsEntries, rates, openItems] =
    await Promise.all([
      dataSource.getTrips(),
      dataSource.getScenarios(),
      dataSource.getCompetitions(),
      dataSource.getBudgetLines(),
      dataSource.getPayments(),
      dataSource.getSavingsEntries(),
      dataSource.getFxRates(),
      dataSource.getOpenItems(),
    ]);

  const trip = trips[0];
  if (!trip) return { status: "no_trip" };

  const tripScenarios = scenarios.filter((s) => s.tripId === trip.id);
  const scenario = tripScenarios.find((s) => s.id === params.scenarioId) ?? tripScenarios[0];
  if (!scenario) return { status: "no_scenario", trip };

  const basis: Basis = params.basis === "conservative" ? "conservative" : "target";
  const asOfDate = new Date().toISOString().slice(0, 10);

  const tripBudgetLines = budgetLines.filter((line) => line.tripId === trip.id);
  const scenarioBudgetLines = tripBudgetLines.filter(
    (line) => line.scenarioId === scenario.id || line.scenarioId === null,
  );

  // Trip-wide, for "already paid" -- a historical fact independent of
  // which scenario is selected. Scenario-scoped, for the obligations
  // this scenario actually needs funded.
  const tripPayments = payments.filter((payment) =>
    tripBudgetLines.some((line) => line.id === payment.budgetLineId),
  );
  const scenarioPayments = tripPayments.filter((payment) =>
    scenarioBudgetLines.some((line) => line.id === payment.budgetLineId),
  );

  const rollup = rollUpBudgetByScenario({
    tripId: trip.id,
    scenarioId: scenario.id,
    asOfDate,
    budgetLines: scenarioBudgetLines,
    rates,
  });

  const competition = scenario.competitionId
    ? competitions.find((c) => c.id === scenario.competitionId) ?? null
    : null;

  const tripOpenItems = openItems.filter((item) => item.tripId === trip.id);

  const obligationsResult = buildObligations({
    payments: scenarioPayments,
    allTripPayments: tripPayments,
    budgetLines: scenarioBudgetLines,
    savingsEntries: savingsEntries
      .filter((entry) => entry.tripId === trip.id)
      .map((entry) => ({ amountUsd: entry.amount, recordedOn: entry.recordedOn })),
    rates,
    departureDate: competition?.startDate ?? null,
    departureDateConfirmed: competition?.datesState === "confirmed",
    asOfDate,
  });

  if (obligationsResult.status === "no_departure_date") {
    return {
      status: "ready",
      trip,
      scenario,
      scenarios: tripScenarios,
      competition,
      basis,
      asOfDate,
      rollup,
      savings: null,
      noDepartureDate: true,
      provisional: false,
      obligations: [],
      availableUsd: 0,
      phasedPlan: null,
      parallelPlan: null,
      payments: scenarioPayments,
      openItems: tripOpenItems,
    };
  }

  const savings = calculateRequiredSavings({
    asOfDate,
    savingsEntries: [{ amountUsd: obligationsResult.availableUsd, recordedOn: asOfDate }],
    obligations: obligationsResult.obligations,
  });

  const phasedPlan = buildPhasedSavingsPlan({
    obligations: obligationsResult.obligations,
    availableUsd: obligationsResult.availableUsd,
    asOfDate,
    basis,
  });

  const parallelPlan = buildParallelSavingsPlan({
    obligations: obligationsResult.obligations,
    availableUsd: obligationsResult.availableUsd,
    asOfDate,
    basis,
  });

  return {
    status: "ready",
    trip,
    scenario,
    scenarios: tripScenarios,
    competition,
    basis,
    asOfDate,
    rollup,
    savings,
    noDepartureDate: false,
    provisional: obligationsResult.provisional,
    obligations: obligationsResult.obligations,
    availableUsd: obligationsResult.availableUsd,
    phasedPlan,
    parallelPlan,
    payments: scenarioPayments,
    openItems: tripOpenItems,
  };
}
