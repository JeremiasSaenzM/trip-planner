"use client";

import { DateTime } from "luxon";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { BuildParallelSavingsPlanResult } from "@/lib/domain/build-parallel-savings-plan";

import { formatDate, formatUsd } from "./format";
import { ComparisonLegend } from "./scenario-comparison-chart";
import type { ScenarioComparisonLine } from "./scenario-savings";

// A YYYY-MM-DD value is a calendar date, not an instant -- always parse
// and format it pinned to "utc" so the result never depends on the
// server's or the browser's ambient time zone. See format.ts/format.test.ts.
function toTimestamp(date: string): number {
  return DateTime.fromISO(date, { zone: "utc" }).toMillis();
}

function formatDateTick(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: "utc" }).toFormat("MMM d");
}

function formatUsdTick(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

// See charts.tsx's own comment: Recharts hard-codes axis tick colors,
// which need to follow the theme instead.
const AXIS_TICK = { fontSize: 11, fill: "var(--chart-neutral)" };

export type SawtoothPoint = {
  timestamp: number;
  balance: number;
  isPeak: boolean;
  label: string | null;
  /** Peak labels can run long (e.g. "Before departure (9 items)"
   * including an amount) -- anchoring every label dead-center clips the
   * last one against the chart's right edge, since it's the point
   * closest to it. "end" for that point keeps the text growing leftward,
   * into the plot, instead of off the edge. */
  labelAnchor: "start" | "middle" | "end";
  monthlySaving: number;
};

function PeakDot(props: { cx?: number; cy?: number; payload?: SawtoothPoint }) {
  const { cx, cy, payload } = props;
  if (!payload?.isPeak || cx === undefined || cy === undefined) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3} fill="var(--chart-target)" />
      <text x={cx} y={cy - 8} textAnchor={payload.labelAnchor} fontSize={10} fill="var(--chart-neutral)">
        {payload.label}
      </text>
    </g>
  );
}

// The viewed scenario's own peaks keep their labels. Another scenario's
// peaks get a plain muted dot, no label: their labels would land on top
// of the viewed scenario's at shared deadlines.
function OtherPeakDot(props: { cx?: number; cy?: number; payload?: SawtoothPoint }) {
  const { cx, cy, payload } = props;
  if (!payload?.isPeak || cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={3} fill="var(--chart-neutral)" />;
}

// Reads the viewed scenario's own line ("Balance") -- with other
// scenarios on the chart, payload also holds their entries, and the
// tooltip stays what it was: this scenario's balance and saving rate.
function BalanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name?: string; payload: SawtoothPoint }[];
}) {
  const own = payload?.find((entry) => entry.name === "Balance");
  if (!active || !own) return null;
  const point = own.payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium">{formatDateTick(point.timestamp)}</p>
      <p>Balance: {formatUsdTick(point.balance)}</p>
      <p>Saving this period: {formatUsdTick(point.monthlySaving)}/month</p>
    </div>
  );
}

/**
 * Pure, so the "final balance ~0" invariant can be tested without
 * rendering. The combined balance across every open pot: it rises during
 * each period at that period's total monthly saving, then drops by that
 * period's own payment amount right on its due date -- intended to be
 * mathematically identical to the sum of every pot's own balance, since
 * each pot's monthly saving is exactly what's needed to reach its own
 * amount by its own due date (see build-parallel-savings-plan.test.ts's
 * total-saved invariant). The final Math.max(0, ...) exists only to keep
 * the line from dipping below zero on the chart -- it must never be the
 * thing that makes the final balance look like ~0; see
 * savings-plan-charts.test.ts.
 */
export function buildParallelSawtoothData(
  plan: BuildParallelSavingsPlanResult,
  availableUsd: number,
  asOfDate: string,
): SawtoothPoint[] {
  const openPots = plan.pots.filter((pot) => !pot.isPastDue);
  if (plan.periods.length === 0) return [];

  let balance = availableUsd;
  const data: SawtoothPoint[] = [
    {
      timestamp: toTimestamp(asOfDate),
      balance,
      isPeak: false,
      label: null,
      labelAnchor: "middle",
      monthlySaving: plan.periods[0].totalMonthlySaving,
    },
  ];
  openPots.forEach((pot, i) => {
    const period = plan.periods[i];
    balance += period.totalMonthlySaving * period.monthsInPeriod;
    data.push({
      timestamp: toTimestamp(pot.dueDate),
      balance,
      isPeak: true,
      label: `${pot.description} (${formatUsd(pot.amountUsd)})`,
      labelAnchor: i === openPots.length - 1 ? "end" : "middle",
      monthlySaving: period.totalMonthlySaving,
    });
    balance = Math.max(0, balance - pot.amountUsd);
    data.push({
      timestamp: toTimestamp(pot.dueDate),
      balance,
      isPeak: false,
      label: null,
      labelAnchor: "middle",
      monthlySaving: period.totalMonthlySaving,
    });
  });
  return data;
}

/**
 * Another scenario's line on this chart: exactly what this chart plots
 * for that scenario when it's the one being viewed -- the same
 * buildParallelSawtoothData() call on its own plan and money set aside,
 * nothing computed here. Empty when it has no plan.
 */
export function comparisonSawtooth(line: ScenarioComparisonLine, asOfDate: string): SawtoothPoint[] {
  return line.parallelPlan ? buildParallelSawtoothData(line.parallelPlan, line.availableUsd, asOfDate) : [];
}

// Other scenarios' lines: the neutral colour, thinner, each with its own
// dash, so the viewed scenario's line -- drawn exactly as it always was --
// stays the one that reads first. A scenario keeps its dash by its place
// in the trip's scenario order, whichever one is being viewed.
const OTHER_DASHES = ["6 4", "2 3", "10 3 2 3", "1 4"];

function otherLineStyle(index: number) {
  return { stroke: "var(--chart-neutral)", strokeWidth: 1.5, strokeDasharray: OTHER_DASHES[index % OTHER_DASHES.length] };
}

function byDeadlineDetail(line: ScenarioComparisonLine): string {
  if (line.parallelPlan === null) return "no line: no departure date to save toward";
  if (line.parallelPlan.periods.length === 0) return "no line: no upcoming deadlines";
  const count = line.parallelPlan.periods.length;
  return `${count} upcoming deadline${count === 1 ? "" : "s"}`;
}

/**
 * "One pot per payment": this scenario's combined balance across every
 * open pot over time. Given comparison (the trip's scenarios, when it
 * has two or more), every other scenario's line is drawn on the same
 * chart -- the same chart, the same axes, nothing else changed -- with a
 * legend under it saying what each scenario is.
 */
export function ParallelSavingsChart({
  plan,
  availableUsd,
  asOfDate,
  comparison,
}: {
  /** The viewed scenario's own plan -- null when it has no departure date. */
  plan: BuildParallelSavingsPlanResult | null;
  availableUsd: number;
  asOfDate: string;
  comparison?: ScenarioComparisonLine[];
}) {
  const hasOwnLine = plan !== null && plan.periods.length > 0;
  const others = (comparison ?? [])
    .map((line, index) => ({ line, index, data: comparisonSawtooth(line, asOfDate) }))
    .filter(({ line, data }) => !line.isViewed && data.length > 0);

  const legend = comparison && (
    <ComparisonLegend
      lines={comparison}
      swatch={(line, index) => (
        <svg width="28" height="10" aria-hidden="true" className="mt-1.5 shrink-0">
          <line
            x1="1"
            y1="5"
            x2="27"
            y2="5"
            {...(line.isViewed ? { stroke: "var(--chart-target)", strokeWidth: 2 } : otherLineStyle(index))}
          />
        </svg>
      )}
      detail={byDeadlineDetail}
    />
  );

  if (!hasOwnLine && others.length === 0) {
    return (
      <div data-testid="one-pot-per-payment">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming deadlines to plan a pot for yet.</p>
        {legend}
      </div>
    );
  }

  const data = hasOwnLine ? buildParallelSawtoothData(plan, availableUsd, asOfDate) : [];

  return (
    <div data-testid="one-pot-per-payment">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatDateTick}
            tick={AXIS_TICK}
            stroke="var(--chart-grid)"
          />
          <YAxis tick={AXIS_TICK} stroke="var(--chart-grid)" width={44} tickFormatter={formatUsdTick} />
          <Tooltip content={<BalanceTooltip />} />
          {/* Others first, so the viewed scenario's line is drawn on top. */}
          {others.map(({ line, index, data: otherData }) => (
            <Line
              key={line.scenarioId}
              data={otherData}
              type="linear"
              dataKey="balance"
              name={line.name}
              {...otherLineStyle(index)}
              dot={<OtherPeakDot />}
            />
          ))}
          {hasOwnLine && (
            <Line
              type="linear"
              dataKey="balance"
              name="Balance"
              stroke="var(--chart-target)"
              strokeWidth={2}
              dot={<PeakDot />}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {!hasOwnLine && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          This scenario has no upcoming deadlines yet -- only the trip&apos;s other scenarios are drawn.
        </p>
      )}
      {legend}
      {hasOwnLine && <ParallelSavingsList pastDue={plan.pots.filter((pot) => pot.isPastDue)} periods={plan.periods} />}
    </div>
  );
}

function ParallelSavingsList({
  pastDue,
  periods,
}: {
  pastDue: BuildParallelSavingsPlanResult["pots"];
  periods: BuildParallelSavingsPlanResult["periods"];
}) {
  return (
    <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
      {pastDue.map((pot, i) =>
        pot.shortfallNow === null ? (
          <li key={`past-${i}`}>
            {formatDate(pot.dueDate)} · from money already set aside · {pot.description}
          </li>
        ) : (
          <li key={`past-${i}`} className="text-red-700 dark:text-red-400">
            Overdue since {formatDate(pot.dueDate)} · short {formatUsd(pot.shortfallNow)} now · {pot.description}
          </li>
        ),
      )}
      {periods.map((period, i) => (
        <li key={i}>
          {formatDate(period.fromDate)} → {formatDate(period.toDate)} ·{" "}
          {period.monthsInPeriod === 0
            ? "same date window"
            : `save ${formatUsd(period.totalMonthlySaving)}/month`}{" "}
          ({period.openPotCount} pot{period.openPotCount === 1 ? "" : "s"})
        </li>
      ))}
    </ul>
  );
}
