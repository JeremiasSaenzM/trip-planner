import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import { dataSource } from "@/lib/data";

import { AddCompetitionForm, CreateScenarioForm, CreateTripForm } from "./bootstrap-forms";
import { BudgetByCategoryChart, SavingsScheduleChart } from "./charts";
import { DashboardControls } from "./dashboard-controls";
import { loadDashboardData } from "./dashboard-data";
import { Card, CardLabel, Caveat, noDepartureReason, RangeFigure } from "./dashboard-ui";
import { DeadlinePotList } from "./deadline-pots-ui";
import { formatUsd } from "./format";
import { departureAnchorText } from "./pot-item-text";
import { ParallelSavingsChart } from "./savings-plan-charts";
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
  const [data, proposalItems] = await Promise.all([
    loadDashboardData({
      scenarioId: typeof scenarioId === "string" ? scenarioId : undefined,
      basis: typeof basis === "string" ? basis : undefined,
    }),
    dataSource.getProposalItems(),
  ]);
  const pendingProposals = proposalItems.filter((item) => item.status === "pending").length;

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
    parallelPlan,
    competition,
    savingsEntries,
    departure,
    travelWindowIssues,
    pots,
  } = data;
  const binding = savings?.bindingRequirement[data.basis] ?? null;

  return (
    <div className="space-y-6">
      {pendingProposals > 0 && (
        <Caveat>
          <Link href="/import" className="font-medium underline">
            {pendingProposals} research proposal{pendingProposals === 1 ? "" : "s"} waiting for review
          </Link>
          {" "}-- nothing from them is in these figures until you approve it.
        </Caveat>
      )}

      <DashboardControls
        basePath="/"
        scenarios={data.scenarios}
        activeScenarioId={data.scenario.id}
        basis={data.basis}
      />

      {/* One quiet line, not a Caveat box: nothing is wrong, it's a
          reminder of what this view is. 07 §7: Target is the planning
          reference, Conservative the financial-safety test. */}
      {data.basis === "minimum" && (
        <p data-testid="minimum-basis-note" className="text-xs text-zinc-600 dark:text-zinc-400">
          Minimum is the floor of what&apos;s been observed, not a savings plan -- plan on Target, test against
          Conservative.
        </p>
      )}

      {provisional && departure && (
        <Caveat>
          {departure.source === "trip"
            ? "Your departure date isn't confirmed yet"
            : "The festival dates for this scenario aren't confirmed yet"}
          , so every savings figure below is provisional.
        </Caveat>
      )}

      {travelWindowIssues.includes("leaves_too_late") && (
        <Caveat tone="danger">
          Your departure date is on or after the festival&apos;s first day -- you need to be there before it begins.
        </Caveat>
      )}
      {travelWindowIssues.includes("returns_too_early") && (
        <Caveat tone="danger">
          Your return date is on or before the festival&apos;s final day -- you can only leave once it has ended.
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
          // Never $0 here: that would read as "nothing to save", when the
          // truth is "can't say yet".
          <p data-testid="no-savings-requirement" className="mt-1 text-base text-zinc-600 dark:text-zinc-400">
            {noDepartureReason(competition)}, so there&apos;s no savings requirement to compute.{" "}
            <Link href={`/scenarios?scenario=${data.scenario.id}&basis=${data.basis}`} className="underline">
              Set the trip&apos;s travel window
            </Link>
          </p>
        ) : (
          <>
            <p data-testid="required-monthly-saving" className="text-3xl font-semibold tracking-tight">
              {formatUsd(binding ?? 0)}
            </p>
            {departure && (
              <p data-testid="departure-anchor" className="text-xs text-zinc-500 dark:text-zinc-400">
                {departureAnchorText(departure, data.departureSaveBy)}
              </p>
            )}
          </>
        )}
      </Card>

      {pots && departure && (
        <Card>
          <CardLabel>When money is needed</CardLabel>
          <div className="mt-2">
            <DeadlinePotList pots={pots} departure={departure} basis={data.basis} />
          </div>
        </Card>
      )}

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
        <BudgetByCategoryChart byCategory={rollup.byCategory} basis={data.basis} />
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
            departureSaveBy={data.departureSaveBy}
          />
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

