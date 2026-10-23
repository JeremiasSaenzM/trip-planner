import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import type { BudgetLine, Competition, Movement, Trip } from "@/lib/data/types";
import type { InfoState } from "@/lib/domain/types";

import { countDaysOnGround, type ItineraryDay } from "@/lib/domain/build-itinerary-timeline";

import { CATEGORY_LABELS } from "../category-labels";
import { CONFIDENCE_LABELS, CONFIDENCE_NOT_ASSESSED } from "../confidence-labels";
import { BASIS_LABELS, DashboardControls } from "../dashboard-controls";
import { loadDashboardData, type DashboardData } from "../dashboard-data";
import { Card, CardLabel, Caveat, EmptyState, noDepartureReason, RangeFigure } from "../dashboard-ui";
import { DeadlinePotList } from "../deadline-pots-ui";
import { formatDate, formatUsd } from "../format";
import { INFO_STATE_LABELS } from "../info-state-labels";
import { AddMovementForm, AddStayForm, MovementList, StayList } from "../itinerary-write-ui";
import { MOVEMENT_MODE_LABELS } from "../itinerary-labels";
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

      <section aria-labelledby="itinerary" className="space-y-2">
        <h2 id="itinerary" className="text-lg font-semibold">
          Itinerary
        </h2>
        <Card>
          <ItineraryChecks data={data} />
          <div className="mt-4">
            <CardLabel>Night by night</CardLabel>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{daysAwayText(data.movements)}</p>
            <ItineraryStrip days={data.itineraryTimeline} />
          </div>
        </Card>

        <Card>
          <CardLabel>Stays</CardLabel>
          <div className="mt-2">
            <StayList stays={data.stays} budgetLines={data.budgetLines} sources={data.sources} />
          </div>
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <AddStayForm scenarioId={scenario.id} budgetLines={data.budgetLines} sources={data.sources} />
          </div>
        </Card>

        <Card>
          <CardLabel>Movements</CardLabel>
          <div className="mt-2">
            <MovementList movements={data.movements} budgetLines={data.budgetLines} sources={data.sources} />
          </div>
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <AddMovementForm scenarioId={scenario.id} budgetLines={data.budgetLines} sources={data.sources} />
          </div>
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
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{departureAnchorText(departure, data.departureSaveBy)}</p>
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

// The five Phase 6.4 checks -- warnings, never blocks. "unknown" (the
// trip's travel window or the competition's festival dates aren't set
// yet) is stated plainly rather than as a Caveat: there's nothing wrong
// to flag, just nothing to compare against yet.
function ItineraryChecks({ data }: { data: Extract<DashboardData, { status: "ready" }> }) {
  const {
    stayNightsCheck,
    festivalStayCoverage,
    pathContinuityIssues,
    unaccountedNights,
    movementsMissingBudgetLine,
    budgetLineMatchesStay,
    budgetLineNightsAddUp,
    budgetLineDaysAddUp,
  } = data;

  const nothingToReport =
    stayNightsCheck.status !== "mismatch" &&
    festivalStayCoverage.status !== "gap" &&
    pathContinuityIssues.length === 0 &&
    unaccountedNights.length === 0 &&
    movementsMissingBudgetLine.length === 0 &&
    budgetLineMatchesStay.length === 0 &&
    budgetLineNightsAddUp.status !== "mismatch" &&
    budgetLineDaysAddUp.status !== "mismatch";

  return (
    <div className="space-y-2">
      {stayNightsCheck.status === "unknown" && (
        <Missing>Travel window not set -- can&apos;t check whether the stays&apos; nights add up.</Missing>
      )}
      {stayNightsCheck.status === "mismatch" && (
        <Caveat>
          Stays total {stayNightsCheck.staysNights} night{stayNightsCheck.staysNights === 1 ? "" : "s"}, but the
          trip&apos;s travel window is {stayNightsCheck.windowNights} night
          {stayNightsCheck.windowNights === 1 ? "" : "s"}.
        </Caveat>
      )}
      {festivalStayCoverage.status === "unknown" && (
        <Missing>Festival dates not set -- can&apos;t check festival-stay coverage.</Missing>
      )}
      {festivalStayCoverage.status === "gap" && (
        <Caveat>
          No festival-kind stay covers {festivalStayCoverage.uncoveredNights.length} night
          {festivalStayCoverage.uncoveredNights.length === 1 ? "" : "s"}:{" "}
          {festivalStayCoverage.uncoveredNights.map((date) => formatDate(date)).join(", ")}.
        </Caveat>
      )}
      {pathContinuityIssues.length > 0 && (
        <Caveat>
          {pathContinuityIssues.length} movement{pathContinuityIssues.length === 1 ? "" : "s"} in this scenario don&apos;t
          connect to the one before: {" "}
          {pathContinuityIssues
            .map(
              (issue) =>
                `#${issue.sequence} starts from ${issue.actualFromLocation}, not ${issue.expectedFromLocation}`,
            )
            .join("; ")}
          .
        </Caveat>
      )}
      {unaccountedNights.length > 0 && (
        <Caveat>
          {unaccountedNights.length} night{unaccountedNights.length === 1 ? "" : "s"} with no stay recorded:{" "}
          {unaccountedNights.map((night) => `${formatDate(night.date)} (${night.requiredLocation})`).join(", ")}.
        </Caveat>
      )}
      {movementsMissingBudgetLine.length > 0 && (
        <Caveat>
          {movementsMissingBudgetLine.length} movement{movementsMissingBudgetLine.length === 1 ? "" : "s"} with no
          budget line yet: {movementsMissingBudgetLine.map((m) => `${m.fromLocation} → ${m.toLocation}`).join(", ")}.
        </Caveat>
      )}
      {budgetLineMatchesStay.length > 0 && (
        <Caveat>
          {budgetLineMatchesStay.length} budget line{budgetLineMatchesStay.length === 1 ? "" : "s"} priced by the
          night don&apos;t match the stay they&apos;re linked to:{" "}
          {budgetLineMatchesStay
            .map((mismatch) => `"${mismatch.description}" (${mismatch.quantity}) vs. ${mismatch.stayNights} nights`)
            .join(", ")}
          .
        </Caveat>
      )}
      {budgetLineNightsAddUp.status === "unknown" && (
        <Missing>Travel window not set -- can&apos;t check whether the night-priced budget lines add up.</Missing>
      )}
      {budgetLineNightsAddUp.status === "mismatch" && (
        <Caveat>
          Night-priced budget lines total {budgetLineNightsAddUp.linesNights} night
          {budgetLineNightsAddUp.linesNights === 1 ? "" : "s"}, but there are {budgetLineNightsAddUp.bedsNights} night
          {budgetLineNightsAddUp.bedsNights === 1 ? "" : "s"} in beds.
        </Caveat>
      )}
      {budgetLineDaysAddUp.status === "mismatch" && (
        <Caveat>
          Food (category E) budget lines priced by the day total {budgetLineDaysAddUp.linesDays} day
          {budgetLineDaysAddUp.linesDays === 1 ? "" : "s"}, but there are {budgetLineDaysAddUp.groundDays} day
          {budgetLineDaysAddUp.groundDays === 1 ? "" : "s"} on the ground.
        </Caveat>
      )}
      {nothingToReport &&
        stayNightsCheck.status !== "unknown" &&
        festivalStayCoverage.status !== "unknown" &&
        budgetLineNightsAddUp.status !== "unknown" && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Every itinerary check passes.</p>
        )}
    </div>
  );
}

// Generated, never typed in -- buildItineraryTimeline() walks the
// movement chain once; this just renders what comes back.
function ItineraryStrip({ days }: { days: ItineraryDay<Movement>[] }) {
  if (days.length === 0) {
    return <Missing>No movements recorded yet, so there&apos;s nothing to walk night by night.</Missing>;
  }

  return (
    <ol data-testid="itinerary-strip" className="mt-2 space-y-1.5 text-sm">
      {days.map((day) => (
        <li key={day.date}>
          <span className="font-medium">{formatDate(day.date)}</span>
          {day.movements.length > 0 && (
            <span className="text-zinc-600 dark:text-zinc-400">
              {" — "}
              {day.movements.map((movement, index) => (
                <span key={movement.id}>
                  {index > 0 ? " → " : ""}
                  {movement.fromLocation} → {movement.toLocation} ({MOVEMENT_MODE_LABELS[movement.mode]})
                </span>
              ))}
            </span>
          )}
          <span className="ml-1 text-zinc-500 dark:text-zinc-400">
            {day.night.type === "at" && `Night: ${day.night.location}.`}
            {day.night.type === "in_transit" && "Night: overnight travel."}
            {day.night.type === "home" && "Home."}
          </span>
        </li>
      ))}
    </ol>
  );
}

// So the food budget line (category E) can be eyeballed against it --
// deliberately counted here, not parsed out of a description (CLAUDE.md).
// countDaysOnGround() is also what checkBudgetLineDaysAddUp compares
// category E's day-quantity lines to, so this text and that check can
// never disagree about what "days on the ground" means.
function daysAwayText(movements: Movement[]): string {
  const daysAway = countDaysOnGround(movements);
  return `${daysAway} day${daysAway === 1 ? "" : "s"} on the ground.`;
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
