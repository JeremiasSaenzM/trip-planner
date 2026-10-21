import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import { dataSource } from "@/lib/data";
import type { AcceptanceStatus, Competition, Scenario } from "@/lib/data/types";

import { AddCompetitionForm, CreateScenarioForm } from "../bootstrap-forms";
import { parseBasis } from "../dashboard-query";
import { Card, EmptyState } from "../dashboard-ui";
import { formatDate } from "../format";
import { INFO_STATE_LABELS } from "../info-state-labels";
import { sortScenarios } from "../scenario-order";
import { CompetitionRowActions, ScenarioRowActions } from "../scenarios-ui";

export const metadata: Metadata = { title: "Scenarios" };

// Read-only here on purpose -- see update_competition's comment on why
// acceptance gets its own flow.
const ACCEPTANCE_LABELS: Record<AcceptanceStatus, string> = {
  pending: "Acceptance pending",
  accepted: "Accepted",
  declined: "Declined",
};

export default function ScenariosPage({ searchParams }: PageProps<"/scenarios">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Scenarios</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
        <ScenariosScreen searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// Not built on loadDashboardData(): this page doesn't need any of the
// savings/rollup work, only the trip's competitions and scenarios plus
// what references each scenario (so the cards can say why a delete
// would be refused before you try).
async function ScenariosScreen({ searchParams }: { searchParams: PageProps<"/scenarios">["searchParams"] }) {
  await getCurrentUser();
  const { scenario: scenarioParam, basis: basisParam } = await searchParams;

  const [trips, competitions, scenarios, sources, budgetLines, payments, flightOptions] = await Promise.all([
    dataSource.getTrips(),
    dataSource.getCompetitions(),
    dataSource.getScenarios(),
    dataSource.getSources(),
    dataSource.getBudgetLines(),
    dataSource.getPayments(),
    dataSource.getFlightOptions(),
  ]);

  const trip = trips[0];
  if (!trip) return <EmptyState>No trip yet. Start one from Overview.</EmptyState>;

  const tripCompetitions = [...competitions.filter((c) => c.tripId === trip.id)].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const tripScenarios = sortScenarios(scenarios.filter((s) => s.tripId === trip.id));

  // Same fallback rule as loadDashboardData: a missing or stale
  // ?scenario= means the first (oldest) one.
  const selected = tripScenarios.find((s) => s.id === scenarioParam) ?? tripScenarios[0];
  const basis = parseBasis(basisParam);

  function references(scenario: Scenario): string[] {
    const lines = budgetLines.filter((line) => line.scenarioId === scenario.id).length;
    const ownPayments = payments.filter((payment) => payment.scenarioId === scenario.id).length;
    const flights = flightOptions.filter((option) => option.scenarioId === scenario.id).length;
    return [
      lines > 0 ? `${lines} budget line${lines === 1 ? "" : "s"}` : null,
      ownPayments > 0 ? `${ownPayments} payment${ownPayments === 1 ? "" : "s"}` : null,
      flights > 0 ? `${flights} flight option${flights === 1 ? "" : "s"}` : null,
    ].filter((text): text is string => text !== null);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Scenarios</h2>
        {tripScenarios.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No scenarios yet.</p>
        ) : (
          <div className="space-y-2">
            {tripScenarios.map((scenario) => {
              const competition = tripCompetitions.find((c) => c.id === scenario.competitionId) ?? null;
              const isSelected = scenario.id === selected?.id;
              const refs = references(scenario);
              return (
                <Card key={scenario.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{scenario.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {competition ? competition.name : "No competition yet"}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {refs.length > 0 ? refs.join(" · ") : "Nothing recorded in this scenario yet"}
                      </p>
                    </div>
                    {isSelected ? (
                      <span className="shrink-0 rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-950">
                        Selected
                      </span>
                    ) : (
                      <Link
                        href={`/?scenario=${scenario.id}&basis=${basis}`}
                        className="shrink-0 text-sm font-medium underline"
                      >
                        Switch to
                      </Link>
                    )}
                  </div>
                  <ScenarioRowActions scenario={scenario} competitions={tripCompetitions} />
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Competitions</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Trip-wide: one competition can feed several scenarios.
        </p>
        {tripCompetitions.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No competitions yet.</p>
        ) : (
          <div className="space-y-2">
            {tripCompetitions.map((competition) => (
              <Card key={competition.id}>
                <CompetitionSummary
                  competition={competition}
                  usedBy={tripScenarios.filter((s) => s.competitionId === competition.id)}
                />
                <CompetitionRowActions competition={competition} sources={sources} />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add</h2>
        <AddCompetitionForm tripId={trip.id} />
        <CreateScenarioForm tripId={trip.id} competitions={tripCompetitions} />
      </section>
    </div>
  );
}

function CompetitionSummary({ competition, usedBy }: { competition: Competition; usedBy: Scenario[] }) {
  const place = [competition.city, competition.country].filter(Boolean).join(", ");
  const dates =
    competition.startDate && competition.endDate
      ? `${formatDate(competition.startDate)} – ${formatDate(competition.endDate)} (${INFO_STATE_LABELS[competition.datesState]})`
      : "Festival dates not announced yet";

  return (
    <div className="min-w-0 space-y-0.5">
      <p className="font-medium">{competition.name}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{place || "Host city not announced yet"}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{dates}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{ACCEPTANCE_LABELS[competition.acceptanceStatus]}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {usedBy.length > 0
          ? `Used by: ${usedBy.map((s) => s.name).join(", ")}`
          : "Not used by any scenario"}
      </p>
    </div>
  );
}
