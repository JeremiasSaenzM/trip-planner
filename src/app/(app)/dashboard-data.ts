import "server-only";

import { dataSource } from "@/lib/data";
import type { BudgetLine, Competition, FxRate, OpenItem, Payment, SavingsEntry, Scenario, Source, Trip } from "@/lib/data/types";
import { buildObligations, type BuiltObligation, type MissingObligationRate } from "@/lib/domain/build-obligations";
import { buildParallelSavingsPlan, type BuildParallelSavingsPlanResult } from "@/lib/domain/build-parallel-savings-plan";
import { buildPhasedSavingsPlan, type BuildPhasedSavingsPlanResult } from "@/lib/domain/build-phased-savings-plan";
import { calculateRequiredSavings, type CalculateRequiredSavingsResult } from "@/lib/domain/calculate-required-savings";
import { findMissingFxRates, type MissingFxRate } from "@/lib/domain/find-missing-fx-rates";
import { rollUpBudgetByScenario, type RollUpBudgetByScenarioResult } from "@/lib/domain/roll-up-budget-by-scenario";
import type { Basis } from "@/lib/domain/types";

import { parseBasis } from "./dashboard-query";
import { sortScenarios } from "./scenario-order";

export type { Basis };

export type DashboardData =
  | { status: "no_trip" }
  | { status: "no_scenario"; trip: Trip; competitions: Competition[] }
  | {
      status: "ready";
      trip: Trip;
      scenario: Scenario;
      scenarios: Scenario[];
      competition: Competition | null;
      basis: Basis;
      asOfDate: string;
      rollup: RollUpBudgetByScenarioResult;
      /** null when noDepartureDate. */
      savings: CalculateRequiredSavingsResult | null;
      /** The scenario has no competition, or its competition has no
       * festival dates yet -- either way there's no deadline to save
       * toward, so no savings requirement can be computed. Pages must
       * say so in words, never show it as $0. */
      noDepartureDate: boolean;
      provisional: boolean;
      obligations: BuiltObligation[];
      /** Savings minus everything already paid -- computed even when
       * noDepartureDate, since it doesn't depend on a date. */
      availableUsd: number;
      /** null when noDepartureDate -- there are no obligations to plan against. */
      phasedPlan: BuildPhasedSavingsPlanResult | null;
      parallelPlan: BuildParallelSavingsPlanResult | null;
      /** Scenario-scoped: this scenario's own payments plus the trip's shared ones. */
      payments: Payment[];
      /** Trip-wide, every scenario -- for the "does any other payment
       * still reference this budget line" check before deleting one
       * (see payment-actions.ts). */
      tripPayments: Payment[];
      /** Scenario-scoped, same rule as payments -- the "add a payment"
       * form's existing-budget-line picker. */
      budgetLines: BudgetLine[];
      /** Trip-scoped (open items aren't scenario-specific). */
      openItems: OpenItem[];
      /** Trip-scoped (money set aside isn't scenario-specific either). */
      savingsEntries: SavingsEntry[];
      /** Payments buildObligations() couldn't convert to USD (no
       * matching fx_rate) -- excluded from every savings figure above,
       * same as rollup.missingRates is for budget lines. When
       * noDepartureDate, only already-paid amounts can be missing one. */
      missingPaymentRates: MissingObligationRate[];
      /** Global -- sources have no trip_id of their own (see
       * supabase/migrations/20261012130400_sources.sql). */
      sources: Source[];
      /** Global, same reasoning as sources. */
      fxRates: FxRate[];
      /** Trip-wide (every scenario's budget lines, plus every scenario's
       * payments) -- the Budget Lines page's FX section renders this
       * directly, see findMissingFxRates(). */
      missingFxRates: MissingFxRate[];
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
  const [trips, scenarios, competitions, budgetLines, payments, savingsEntries, rates, openItems, sources] =
    await Promise.all([
      dataSource.getTrips(),
      dataSource.getScenarios(),
      dataSource.getCompetitions(),
      dataSource.getBudgetLines(),
      dataSource.getPayments(),
      dataSource.getSavingsEntries(),
      dataSource.getFxRates(),
      dataSource.getOpenItems(),
      dataSource.getSources(),
    ]);

  const trip = trips[0];
  if (!trip) return { status: "no_trip" };

  const tripCompetitions = competitions.filter((c) => c.tripId === trip.id);

  const tripScenarios = sortScenarios(scenarios.filter((s) => s.tripId === trip.id));
  const scenario = tripScenarios.find((s) => s.id === params.scenarioId) ?? tripScenarios[0];
  if (!scenario) return { status: "no_scenario", trip, competitions: tripCompetitions };

  const basis = parseBasis(params.basis);
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

  const missingFxRates = findMissingFxRates({
    currencies: [...tripBudgetLines.map((line) => line.currency), ...tripPayments.map((payment) => payment.currency)],
    rates,
    asOfDate,
  });

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
  const tripSavingsEntries = savingsEntries.filter((entry) => entry.tripId === trip.id);

  const obligationsResult = buildObligations({
    payments: scenarioPayments,
    allTripPayments: tripPayments,
    budgetLines: scenarioBudgetLines,
    savingsEntries: tripSavingsEntries.map((entry) => ({ amountUsd: entry.amount, recordedOn: entry.recordedOn })),
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
      availableUsd: obligationsResult.availableUsd,
      phasedPlan: null,
      parallelPlan: null,
      payments: scenarioPayments,
      tripPayments,
      budgetLines: scenarioBudgetLines,
      openItems: tripOpenItems,
      savingsEntries: tripSavingsEntries,
      missingPaymentRates: obligationsResult.missingRates,
      sources,
      fxRates: rates,
      missingFxRates,
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
    departureDate: competition?.startDate ?? null,
  });

  const parallelPlan = buildParallelSavingsPlan({
    obligations: obligationsResult.obligations,
    availableUsd: obligationsResult.availableUsd,
    asOfDate,
    basis,
    departureDate: competition?.startDate ?? null,
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
    tripPayments,
    budgetLines: scenarioBudgetLines,
    openItems: tripOpenItems,
    savingsEntries: tripSavingsEntries,
    missingPaymentRates: obligationsResult.missingRates,
    sources,
    fxRates: rates,
    missingFxRates,
  };
}
