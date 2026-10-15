import type { Metadata } from "next";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";

import { AddCompetitionForm, CreateScenarioForm, CreateTripForm } from "./bootstrap-forms";
import { BudgetByCategoryChart, SavingsScheduleChart } from "./charts";
import { DashboardControls } from "./dashboard-controls";
import { loadDashboardData } from "./dashboard-data";
import { Card, CardLabel, Caveat, RangeFigure } from "./dashboard-ui";
import { formatUsd } from "./format";
import { ParallelSavingsChart, PhasedSavingsChart } from "./savings-plan-charts";
import { RecordSavingsEntryForm, SavingsEntryList } from "./savings-entries-ui";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <Suspense
        fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}
      >
        <Overview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Overview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await getCurrentUser();
  const { scenario: scenarioId, basis } = await searchParams;
  const data = await loadDashboardData({
    scenarioId: typeof scenarioId === "string" ? scenarioId : undefined,
    basis: typeof basis === "string" ? basis : undefined,
  });

  if (data.status === "no_trip") {
    return <CreateTripForm />;
  }
  if (data.status === "no_scenario") {
    return data.competitions.length === 0 ? (
      <AddCompetitionForm tripId={data.trip.id} />
    ) : (
      <CreateScenarioForm tripId={data.trip.id} competitions={data.competitions} />
    );
  }

  const {
    rollup,
    savings,
    provisional,
    noDepartureDate,
    availableUsd,
    obligations,
    phasedPlan,
    parallelPlan,
    competition,
    savingsEntries,
  } = data;
  const binding = savings?.bindingRequirement[data.basis] ?? null;

  return (
    <div className="space-y-6">
      <DashboardControls
        basePath="/"
        scenarios={data.scenarios}
        activeScenarioId={data.scenario.id}
        basis={data.basis}
      />

      {provisional && (
        <Caveat>
          The festival dates for this scenario aren&apos;t confirmed yet, so every savings figure below is
          provisional.
        </Caveat>
      )}

      {savings?.hasPastDueShortfall && (
        <Caveat tone="danger">
          A deadline has already passed unfunded: you&apos;re short{" "}
          {formatUsd(savings.shortfallNow[data.basis])} right now.
        </Caveat>
      )}

      {data.missingPaymentRates.length > 0 && (
        <Caveat>
          {data.missingPaymentRates.length} payment{data.missingPaymentRates.length === 1 ? "" : "s"} missing an
          FX rate, excluded from the figure below.
        </Caveat>
      )}

      <Card>
        <CardLabel>Required monthly saving ({data.basis})</CardLabel>
        {noDepartureDate ? (
          <p className="text-lg text-zinc-500 dark:text-zinc-400">No departure date yet.</p>
        ) : (
          <p data-testid="required-monthly-saving" className="text-3xl font-semibold tracking-tight">
            {formatUsd(binding ?? 0)}
          </p>
        )}
      </Card>

      <Card>
        <CardLabel>Money set aside</CardLabel>
        <p data-testid="available-balance" className="mt-1 text-3xl font-semibold tracking-tight">
          {formatUsd(availableUsd)}
        </p>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Available, after what&apos;s already been paid.
        </p>
        <RecordSavingsEntryForm tripId={data.trip.id} />
        <div className="mt-4">
          <SavingsEntryList entries={savingsEntries} />
        </div>
      </Card>

      <Card>
        <CardLabel>Trip cost range</CardLabel>
        <div className="mt-1 flex items-start gap-4">
          <RangeFigure label="Min" value={rollup.totals.min} />
          <RangeFigure label="Target" value={rollup.totals.target} emphasize testId="trip-cost-range-target" />
          <RangeFigure label="Conservative" value={rollup.totals.conservative} />
        </div>
        {rollup.missingRates.length > 0 && (
          <Caveat>
            {rollup.missingRates.length} budget line{rollup.missingRates.length === 1 ? "" : "s"} missing an FX
            rate, excluded from these totals.
          </Caveat>
        )}
      </Card>

      <Card>
        <CardLabel>
          {rollup.allConfirmed ? "All budget lines confirmed" : "Budget still has estimates"}
        </CardLabel>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {Object.entries(rollup.statesPresent)
            .filter(([, count]) => count > 0)
            .map(([state, count]) => `${count} ${state}`)
            .join(", ") || "No budget lines yet."}
        </p>
      </Card>

      <Card>
        <CardLabel>Budget by category</CardLabel>
        <BudgetByCategoryChart byCategory={rollup.byCategory} />
      </Card>

      {savings && binding !== null && (
        <Card>
          <CardLabel>Savings schedule</CardLabel>
          <SavingsScheduleChart
            schedule={savings.schedule}
            obligations={obligations}
            availableUsd={availableUsd}
            bindingRequirementUsd={binding}
            asOfDate={data.asOfDate}
            basis={data.basis}
            departureDate={competition?.startDate ?? null}
          />
        </Card>
      )}

      {phasedPlan && (
        <Card>
          <CardLabel>One phase at a time</CardLabel>
          <PhasedSavingsChart plan={phasedPlan} availableUsd={availableUsd} asOfDate={data.asOfDate} />
        </Card>
      )}

      {parallelPlan && (
        <Card>
          <CardLabel>One pot per payment</CardLabel>
          <ParallelSavingsChart plan={parallelPlan} availableUsd={availableUsd} asOfDate={data.asOfDate} />
        </Card>
      )}
    </div>
  );
}

