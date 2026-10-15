import type { Metadata } from "next";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";

import { AddBudgetLineForm, BudgetLineList } from "../budget-line-write-ui";
import { Card, EmptyState } from "../dashboard-ui";
import { DashboardControls } from "../dashboard-controls";
import { loadDashboardData } from "../dashboard-data";
import { FxRatesSection } from "../fx-rate-write-ui";

export const metadata: Metadata = { title: "Budget lines" };

export default function BudgetLinesPage({ searchParams }: PageProps<"/budget-lines">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Budget lines</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
        <BudgetLinesScreen searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BudgetLinesScreen({
  searchParams,
}: {
  searchParams: PageProps<"/budget-lines">["searchParams"];
}) {
  await getCurrentUser();
  const { scenario: scenarioId, basis } = await searchParams;
  const data = await loadDashboardData({
    scenarioId: typeof scenarioId === "string" ? scenarioId : undefined,
    basis: typeof basis === "string" ? basis : undefined,
  });

  if (data.status === "no_trip") return <EmptyState>No trip yet.</EmptyState>;
  if (data.status === "no_scenario") return <EmptyState>No scenario yet for this trip.</EmptyState>;

  const { trip, scenario, budgetLines, sources, fxRates, missingFxRates } = data;

  return (
    <div className="space-y-6">
      <DashboardControls
        basePath="/budget-lines"
        scenarios={data.scenarios}
        activeScenarioId={data.scenario.id}
        basis={data.basis}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Budget lines</h2>
        <Card>
          <AddBudgetLineForm tripId={trip.id} scenarioId={scenario.id} sources={sources} />
        </Card>
        <BudgetLineList budgetLines={budgetLines} sources={sources} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">FX rates</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Trip-wide, not scoped to a scenario -- these are what converts every non-USD amount above into USD.
        </p>
        <FxRatesSection fxRates={fxRates} missingFxRates={missingFxRates} sources={sources} />
      </section>
    </div>
  );
}
