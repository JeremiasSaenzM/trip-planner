import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import type { BudgetLine, Competition, Trip } from "@/lib/data/types";
import type { InfoState } from "@/lib/domain/types";

import { CATEGORY_LABELS } from "../category-labels";
import { CONFIDENCE_LABELS, CONFIDENCE_NOT_ASSESSED } from "../confidence-labels";
import { BASIS_LABELS, DashboardControls } from "../dashboard-controls";
import { loadDashboardData } from "../dashboard-data";
import { Card, CardLabel, Caveat, EmptyState, noDepartureReason, RangeFigure } from "../dashboard-ui";
import { DeadlinePotList } from "../deadline-pots-ui";
import { formatDate, formatUsd } from "../format";
import { INFO_STATE_LABELS } from "../info-state-labels";
import { departureAnchorText } from "../pot-item-text";
import { summarizeBudgetEvidence } from "../scenario-evidence";
import { SOURCE_TIER_LABELS } from "../source-labels";

export const metadata: Metadata = { title: "Scenario overview" };

// One page that answers "what am I looking at?" for the selected
// scenario. Built only from data the app already stores, through the
// same loadDashboardData() every other page uses -- and wherever
// something isn't stored, it says so rather than filling the gap. That
// absence is information too.
export default function ScenarioOverviewPage({ searchParams }: PageProps<"/scenario">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Scenario overview</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
        <ScenarioOverview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ScenarioOverview({ searchParams }: { searchParams: PageProps<"/scenario">["searchParams"] }) {
  await getCurrentUser();
  const { scenario: scenarioId, basis } = await searchParams;
  const data = await loadDashboardData({
    scenarioId: typeof scenarioId === "string" ? scenarioId : undefined,
    basis: typeof basis === "string" ? basis : undefined,
  });

  if (data.status === "no_trip") return <EmptyState>No trip yet. Start one from Overview.</EmptyState>;
  if (data.status === "no_scenario") return <EmptyState>No scenario yet for this trip.</EmptyState>;

  const { trip, scenario, competition, rollup, savings, departure, pots, budgetLines, sources } = data;
  const binding = savings?.bindingRequirement[data.basis] ?? null;
  const evidence = summarizeBudgetEvidence(budgetLines, sources);

  return (
    <div className="space-y-6">
      <DashboardControls
        basePath="/scenario"
        scenarios={data.scenarios}
        activeScenarioId={scenario.id}
        basis={data.basis}
      />

      <section aria-labelledby="what-this-is" className="space-y-2">
        <h2 id="what-this-is" className="text-lg font-semibold">
          What this is
        </h2>
        <Card>
          <p data-testid="scenario-name" className="text-lg font-semibold">
            {scenario.name}
          </p>
          <dl className="mt-3 space-y-3 text-sm">
            <Fact label="Competition">
              {competition ? competition.name : <Missing>No competition linked to this scenario</Missing>}
            </Fact>
            {competition && (
              <>
                <Fact label="Host">
                  <HostText competition={competition} />
                </Fact>
                <Fact label="Festival dates">
                  {competition.startDate && competition.endDate ? (
                    <>
                      {formatDate(competition.startDate)} – {formatDate(competition.endDate)}{" "}
                      <InfoStateBadge state={competition.datesState} />
                    </>
                  ) : (
                    <Missing>Not announced yet</Missing>
                  )}
                </Fact>
              </>
            )}
            <Fact label="Travel window">
              <TravelWindowText trip={trip} />
            </Fact>
            <Fact label="Notes">
              {scenario.notes ? (
                <span className="whitespace-pre-line">{scenario.notes}</span>
              ) : (
                <Missing>No notes recorded for this scenario -- the routing isn&apos;t described anywhere yet</Missing>
              )}
            </Fact>
          </dl>
        </Card>
      </section>

      <section aria-labelledby="the-money" className="space-y-2">
        <h2 id="the-money" className="text-lg font-semibold">
          The money
        </h2>
        <Card>
          <div className="flex items-start gap-4">
            <RangeFigure label="Minimum" value={rollup.totals.min} emphasize={data.basis === "minimum"} />
            <RangeFigure label="Target" value={rollup.totals.target} emphasize={data.basis === "target"} />
            <RangeFigure
              label="Conservative"
              value={rollup.totals.conservative}
              emphasize={data.basis === "conservative"}
            />
          </div>
          {rollup.missingRates.length > 0 && (
            <Caveat>
              {rollup.missingRates.length} budget line{rollup.missingRates.length === 1 ? "" : "s"} missing an FX
              rate, excluded from these totals.
            </Caveat>
          )}
          <div className="mt-4">
            <CardLabel>Required monthly saving</CardLabel>
            {binding === null ? (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {noDepartureReason(competition)}, so there&apos;s no savings requirement to compute.
              </p>
            ) : (
              <p data-testid="scenario-required-saving" className="text-2xl font-semibold tracking-tight">
                {formatUsd(binding)}
                <span className="ml-1 text-sm font-normal text-zinc-500 dark:text-zinc-400">/month</span>
              </p>
            )}
            <p data-testid="selected-basis" className="text-xs text-zinc-500 dark:text-zinc-400">
              Showing the {BASIS_LABELS[data.basis]} basis.
              {data.provisional ? " Provisional: the departure date isn't confirmed." : ""}
            </p>
          </div>
        </Card>
      </section>

      <section aria-labelledby="when-money-is-needed" className="space-y-2">
        <h2 id="when-money-is-needed" className="text-lg font-semibold">
          When money is needed
        </h2>
        <Card>
          {pots && departure ? (
            <>
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{departureAnchorText(departure)}</p>
              <DeadlinePotList pots={pots} departure={departure} basis={data.basis} />
            </>
          ) : (
            <Missing>
              {noDepartureReason(competition)}, so there are no deadlines to save toward.{" "}
              <Link href={`/scenarios?scenario=${scenario.id}&basis=${data.basis}`} className="underline">
                Set the trip&apos;s travel window
              </Link>
            </Missing>
          )}
        </Card>
      </section>

      <section aria-labelledby="built-on" className="space-y-2">
        <h2 id="built-on" className="text-lg font-semibold">
          What this is built on
        </h2>
        <Card>
          {budgetLines.length === 0 ? (
            <Missing>No budget lines in this scenario yet.</Missing>
          ) : (
            <div className="space-y-4 text-sm">
              {evidence.sourced.length === 0 ? (
                <Missing>None of this scenario&apos;s budget lines has a source.</Missing>
              ) : (
                <ul data-testid="sourced-lines" className="space-y-2">
                  {evidence.sourced.map(({ line, source }) => (
                    <li key={line.id}>
                      <p className="font-medium">{lineName(line)}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {source.provider} · Tier {source.tier} ({SOURCE_TIER_LABELS[source.tier]}) · observed{" "}
                        {formatDate(source.observedOn)}
                        {source.url ? (
                          <>
                            {" · "}
                            <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                              {source.url}
                            </a>
                          </>
                        ) : (
                          " · no link recorded"
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div data-testid="unsourced-lines">
                <p className="font-medium">
                  {evidence.unsourced.length === 0
                    ? "Every budget line has a source."
                    : `${evidence.unsourced.length} budget line${evidence.unsourced.length === 1 ? " has" : "s have"} no source:`}
                </p>
                {evidence.unsourced.length > 0 && <LineNames lines={evidence.unsourced} />}
              </div>
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="uncertain" className="space-y-2">
        <h2 id="uncertain" className="text-lg font-semibold">
          What&apos;s uncertain
        </h2>
        <Card>
          {budgetLines.length === 0 ? (
            <Missing>No budget lines in this scenario yet.</Missing>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <CardLabel>By information state</CardLabel>
                <ul data-testid="lines-by-state" className="mt-1 space-y-1">
                  {evidence.byState.map((group) => (
                    <li key={group.state}>
                      <InfoStateBadge state={group.state} /> {group.lines.length}:{" "}
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {group.lines.map(lineName).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <CardLabel>By confidence</CardLabel>
                <ul data-testid="lines-by-confidence" className="mt-1 space-y-1">
                  {evidence.byConfidence.map((group) => (
                    <li key={group.confidence ?? "not-assessed"}>
                      {group.confidence ? CONFIDENCE_LABELS[group.confidence] : CONFIDENCE_NOT_ASSESSED}:{" "}
                      {group.lines.length}
                    </li>
                  ))}
                </ul>
              </div>
              <div data-testid="low-confidence-lines">
                <p className="font-medium">
                  {evidence.lowConfidence.length === 0
                    ? "No budget line is rated Low confidence."
                    : `Low confidence (${evidence.lowConfidence.length}):`}
                </p>
                {evidence.lowConfidence.length > 0 && <LineNames lines={evidence.lowConfidence} />}
              </div>
              <div>
                <p className="font-medium">
                  {evidence.unsourced.length === 0 ? "Every line has a source." : `No source (${evidence.unsourced.length}):`}
                </p>
                {evidence.unsourced.length > 0 && <LineNames lines={evidence.unsourced} />}
              </div>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function lineName(line: BudgetLine): string {
  return `${line.description} (${line.category} ${CATEGORY_LABELS[line.category]})`;
}

function LineNames({ lines }: { lines: BudgetLine[] }) {
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
      {lines.map((line) => (
        <li key={line.id}>{lineName(line)}</li>
      ))}
    </ul>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

// Something the app doesn't have stored, said plainly instead of guessed.
function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-zinc-500 italic dark:text-zinc-400">{children}</span>;
}

function InfoStateBadge({ state }: { state: InfoState }) {
  const tone =
    state === "confirmed"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : state === "conflicting"
        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return (
    <span data-testid="info-state-badge" className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {INFO_STATE_LABELS[state]}
    </span>
  );
}

function HostText({ competition }: { competition: Competition }) {
  const place = [competition.venue, competition.city, competition.country].filter(Boolean).join(", ");
  return place ? <>{place}</> : <Missing>Host not announced yet</Missing>;
}

function TravelWindowText({ trip }: { trip: Trip }) {
  if (!trip.departureDate && !trip.returnDate) {
    return <Missing>Not set -- savings deadlines run to the festival&apos;s first official day</Missing>;
  }
  return (
    <>
      Leave {trip.departureDate ? formatDate(trip.departureDate) : <Missing>not set</Missing>} · return{" "}
      {trip.returnDate ? formatDate(trip.returnDate) : <Missing>not set</Missing>}{" "}
      <InfoStateBadge state={trip.travelDatesState} />
    </>
  );
}
