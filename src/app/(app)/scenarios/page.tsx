import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import { dataSource } from "@/lib/data";
import type { TripEvent, Scenario, Source, Trip } from "@/lib/data/types";
import { resolveTravelWindow } from "@/lib/domain/resolve-travel-window";

import { AddEventForm, CreateScenarioForm } from "../bootstrap-forms";
import { parseBasis } from "../dashboard-query";
import { Card, EmptyState } from "../dashboard-ui";
import { formatDate } from "../format";
import { INFO_STATE_LABELS } from "../info-state-labels";
import { sortScenarios } from "../scenario-order";
import {
  EventRowActions,
  ScenarioRowActions,
  ScenarioTravelWindowActions,
  TravelWindowActions,
  type ScenarioCascadeCounts,
} from "../scenarios-ui";

export const metadata: Metadata = { title: "Scenarios" };

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
// savings/rollup work, only the trip's events and scenarios plus
// what references each scenario (so the cards can say why a delete
// would be refused before you try).
async function ScenariosScreen({ searchParams }: { searchParams: PageProps<"/scenarios">["searchParams"] }) {
  await getCurrentUser();
  const { scenario: scenarioParam, basis: basisParam } = await searchParams;

  const [trips, events, scenarios, sources, budgetLines, payments, flightOptions, stays, movements] =
    await Promise.all([
      dataSource.getTrips(),
      dataSource.getEvents(),
      dataSource.getScenarios(),
      dataSource.getSources(),
      dataSource.getBudgetLines(),
      dataSource.getPayments(),
      dataSource.getFlightOptions(),
      dataSource.getStays(),
      dataSource.getMovements(),
    ]);

  const trip = trips[0];
  if (!trip) return <EmptyState>No trip yet. Start one from Overview.</EmptyState>;

  const tripEvents = [...events.filter((e) => e.tripId === trip.id)].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const tripScenarios = sortScenarios(scenarios.filter((s) => s.tripId === trip.id));

  // Same fallback rule as loadDashboardData: a missing or stale
  // ?scenario= means the first (oldest) one.
  const selected = tripScenarios.find((s) => s.id === scenarioParam) ?? tripScenarios[0];
  const basis = parseBasis(basisParam);

  // What delete_scenario_cascade would actually destroy: its own budget
  // lines, plus every payment that would go with them -- either because
  // it's attached to one of those lines, or because it carries this
  // scenario_id directly even though its own budget line is a shared
  // one (a scenario-specific payment on a trip-wide line survives that
  // line, but not the scenario it was scoped to).
  function cascadeCounts(scenario: Scenario): ScenarioCascadeCounts {
    const ownLineIds = new Set(
      budgetLines.filter((line) => line.scenarioId === scenario.id).map((line) => line.id),
    );
    const ownPayments = payments.filter(
      (payment) => payment.scenarioId === scenario.id || ownLineIds.has(payment.budgetLineId),
    );
    return {
      budgetLines: ownLineIds.size,
      payments: ownPayments.length,
      stays: stays.filter((stay) => stay.scenarioId === scenario.id).length,
      movements: movements.filter((movement) => movement.scenarioId === scenario.id).length,
      flightOptions: flightOptions.filter((option) => option.scenarioId === scenario.id).length,
    };
  }

  // What the plain delete_scenario guard would refuse over -- every
  // type it now checks, so this stays accurate after its stays/
  // movements fix (20261026090000).
  function references(scenario: Scenario): string[] {
    const counts = cascadeCounts(scenario);
    return [
      counts.budgetLines > 0 ? `${counts.budgetLines} budget line${counts.budgetLines === 1 ? "" : "s"}` : null,
      counts.payments > 0 ? `${counts.payments} payment${counts.payments === 1 ? "" : "s"}` : null,
      counts.flightOptions > 0
        ? `${counts.flightOptions} flight option${counts.flightOptions === 1 ? "" : "s"}`
        : null,
      counts.stays > 0 ? `${counts.stays} stay${counts.stays === 1 ? "" : "s"}` : null,
      counts.movements > 0 ? `${counts.movements} movement${counts.movements === 1 ? "" : "s"}` : null,
    ].filter((text): text is string => text !== null);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Travel window</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          The trip&apos;s default -- each scenario below can set its own instead.
        </p>
        <Card>
          <TravelWindowSummary trip={trip} sources={sources} />
          <TravelWindowActions trip={trip} sources={sources} />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Scenarios</h2>
        {tripScenarios.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No scenarios yet.</p>
        ) : (
          <div className="space-y-2">
            {tripScenarios.map((scenario) => {
              const event = tripEvents.find((e) => e.id === scenario.eventId) ?? null;
              const isSelected = scenario.id === selected?.id;
              const refs = references(scenario);
              return (
                <Card key={scenario.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{scenario.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {event ? event.name : "No event yet"}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {refs.length > 0 ? refs.join(" · ") : "Nothing recorded in this scenario yet"}
                      </p>
                      <ScenarioTravelWindowSummary scenario={scenario} trip={trip} sources={sources} />
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
                  <ScenarioRowActions
                    scenario={scenario}
                    events={tripEvents}
                    cascadeCounts={cascadeCounts(scenario)}
                  />
                  <ScenarioTravelWindowActions scenario={scenario} sources={sources} />
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Events</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Trip-wide: one event can feed several scenarios.
        </p>
        {tripEvents.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No events yet.</p>
        ) : (
          <div className="space-y-2">
            {tripEvents.map((event) => (
              <Card key={event.id}>
                <EventSummary
                  event={event}
                  usedBy={tripScenarios.filter((s) => s.eventId === event.id)}
                />
                <EventRowActions event={event} sources={sources} />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add</h2>
        <AddEventForm tripId={trip.id} />
        <CreateScenarioForm tripId={trip.id} events={tripEvents} />
      </section>
    </div>
  );
}

function EventSummary({ event, usedBy }: { event: TripEvent; usedBy: Scenario[] }) {
  const place = [event.city, event.country].filter(Boolean).join(", ");
  const dates =
    event.startDate && event.endDate
      ? `${formatDate(event.startDate)} – ${formatDate(event.endDate)} (${INFO_STATE_LABELS[event.datesState]})`
      : "Event dates not announced yet";

  return (
    <div className="min-w-0 space-y-0.5">
      <p className="font-medium">{event.name}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{place || "Host city not announced yet"}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{dates}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {usedBy.length > 0
          ? `Used by: ${usedBy.map((s) => s.name).join(", ")}`
          : "Not used by any scenario"}
      </p>
    </div>
  );
}

// This scenario's resolved travel window -- its own override, or the
// trip's default (resolveTravelWindow(), the same function
// dashboard-data.ts uses) -- always saying which one it is, so an
// override never looks the same as inheriting.
function ScenarioTravelWindowSummary({ scenario, trip, sources }: { scenario: Scenario; trip: Trip; sources: Source[] }) {
  const window = resolveTravelWindow(scenario, trip);
  const source = window.travelDatesSourceId ? sources.find((s) => s.id === window.travelDatesSourceId) : null;

  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      {window.departureDate && window.returnDate
        ? `${formatDate(window.departureDate)} – ${formatDate(window.returnDate)}`
        : "Travel window not set"}{" "}
      ({INFO_STATE_LABELS[window.travelDatesState]}
      {source ? ` · ${source.provider}` : ""}) --{" "}
      {window.origin === "scenario" ? "this scenario's own" : "from the trip"}
    </p>
  );
}

function TravelWindowSummary({ trip, sources }: { trip: Trip; sources: Source[] }) {
  const source = trip.travelDatesSourceId ? sources.find((s) => s.id === trip.travelDatesSourceId) : null;
  return (
    <div data-testid="travel-window" className="min-w-0 space-y-0.5">
      <p className="text-sm">
        Leave: {trip.departureDate ? formatDate(trip.departureDate) : "not set"} · Return:{" "}
        {trip.returnDate ? formatDate(trip.returnDate) : "not set"}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {INFO_STATE_LABELS[trip.travelDatesState]}
        {source ? ` · ${source.provider} (${formatDate(source.observedOn)})` : ""}
      </p>
      {!trip.departureDate && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Until a departure date is set, savings deadlines run to the event&apos;s first official day.
        </p>
      )}
    </div>
  );
}
