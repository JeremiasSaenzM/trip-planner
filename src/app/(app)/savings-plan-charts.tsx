"use client";

import { DateTime } from "luxon";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DeadlinePot } from "@/lib/domain/build-deadline-pots";
import type { BuildParallelSavingsPlanResult, ParallelSavingsPeriod } from "@/lib/domain/build-parallel-savings-plan";

import { formatDate, formatUsd } from "./format";
import { potItemText } from "./pot-item-text";
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

// Other scenarios on the comparison canvas: the same line and dots as
// the viewed one, faded.
const MUTED_OPACITY = 0.4;

// See charts.tsx's own comment: Recharts hard-codes axis tick colors,
// which need to follow the theme instead.
const AXIS_TICK = { fontSize: 11, fill: "var(--chart-neutral)" };

export type SawtoothPoint = {
  timestamp: number;
  balance: number;
  isPeak: boolean;
  monthlySaving: number;
};

// A dot at each peak -- the moment a deadline's pot is paid out -- and
// no text: what each deadline holds is in the list under the chart,
// which has room for it. Text on the plot collided with itself, ran off
// the right edge, and on the comparison canvas collided across
// scenarios too.
// muted: another scenario's peaks on the comparison canvas, faded.
// Unset on the per-scenario chart.
function PeakDot(props: { cx?: number; cy?: number; payload?: SawtoothPoint; muted?: boolean }) {
  const { cx, cy, payload, muted } = props;
  if (!payload?.isPeak || cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={3} fill="var(--chart-target)" opacity={muted ? MUTED_OPACITY : undefined} />;
}

// seriesName: on the comparison canvas, which series to read -- the
// viewed scenario's. Unset on the per-scenario chart, which has one.
function BalanceTooltip({
  active,
  payload,
  seriesName,
}: {
  active?: boolean;
  payload?: { name?: string; payload: SawtoothPoint }[];
  seriesName?: string;
}) {
  const entry = seriesName === undefined ? payload?.[0] : payload?.find((item) => item.name === seriesName);
  if (!active || !entry) return null;
  const point = entry.payload;
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
      monthlySaving: period.totalMonthlySaving,
    });
    balance = Math.max(0, balance - pot.amountUsd);
    data.push({
      timestamp: toTimestamp(pot.dueDate),
      balance,
      isPeak: false,
      monthlySaving: period.totalMonthlySaving,
    });
  });
  return data;
}

export function ParallelSavingsChart({
  plan,
  pots,
  availableUsd,
  asOfDate,
}: {
  plan: BuildParallelSavingsPlanResult;
  /** buildDeadlinePots() on the same obligations and basis as plan --
   * what the list under the chart names each deadline's payments from. */
  pots: DeadlinePot[];
  availableUsd: number;
  asOfDate: string;
}) {
  const pastDue = plan.pots.filter((pot) => pot.isPastDue);

  if (plan.periods.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming deadlines to plan a pot for yet.</p>;
  }

  const data = buildParallelSawtoothData(plan, availableUsd, asOfDate);

  return (
    <div>
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
          <Line
            type="linear"
            dataKey="balance"
            name="Balance"
            stroke="var(--chart-target)"
            strokeWidth={2}
            dot={<PeakDot />}
          />
        </LineChart>
      </ResponsiveContainer>
      <ParallelSavingsList pastDue={pastDue} rows={buildPeriodRows(plan.periods, pots)} />
    </div>
  );
}

export type PeriodRow = {
  period: ParallelSavingsPeriod;
  /** The deadline this period ends at: buildDeadlinePots()'s pot for
   * period.toDate. null only if the two builders ever disagree about
   * which deadlines exist -- scenario-comparison.test.ts fails if they do. */
  pot: DeadlinePot | null;
};

/**
 * Pairs each saving period with the deadline it ends at, by date. Both
 * come from the same obligations through groupObligationsByDueDate(), so
 * this only looks the pot up -- it never computes an amount.
 */
export function buildPeriodRows(periods: ParallelSavingsPeriod[], pots: DeadlinePot[]): PeriodRow[] {
  return periods.map((period) => ({ period, pot: pots.find((pot) => pot.dueDate === period.toDate) ?? null }));
}

export type SawtoothComparisonSeries = {
  scenarioId: string;
  name: string;
  isViewed: boolean;
  /** Exactly what ParallelSavingsChart plots for this scenario when it's
   * the one being viewed. Empty when it has no plan. */
  data: SawtoothPoint[];
};

/**
 * Another scenario's line: the same buildParallelSawtoothData() call
 * ParallelSavingsChart makes for the viewed one, on that scenario's own
 * plan and money set aside. Nothing computed here.
 */
export function comparisonSawtooth(line: ScenarioComparisonLine, asOfDate: string): SawtoothPoint[] {
  return line.parallelPlan ? buildParallelSawtoothData(line.parallelPlan, line.availableUsd, asOfDate) : [];
}

/** Every series the comparison canvas draws, one per scenario, in the trip's scenario order. */
export function buildSawtoothComparisonSeries(
  lines: ScenarioComparisonLine[],
  asOfDate: string,
): SawtoothComparisonSeries[] {
  return lines.map((line) => ({
    scenarioId: line.scenarioId,
    name: line.name,
    isViewed: line.isViewed,
    data: comparisonSawtooth(line, asOfDate),
  }));
}

// Each other scenario keeps its own dash, by its place in the trip's
// scenario order, so the legend can tell them apart from each other.
const OTHER_DASHES = ["6 4", "2 3", "10 3 2 3", "1 4"];

function seriesStyle(isViewed: boolean, index: number) {
  return isViewed
    ? { stroke: "var(--chart-target)", strokeWidth: 2 }
    : {
        stroke: "var(--chart-target)",
        strokeWidth: 2,
        strokeOpacity: MUTED_OPACITY,
        strokeDasharray: OTHER_DASHES[index % OTHER_DASHES.length],
      };
}

function comparisonDetail(line: ScenarioComparisonLine): string {
  if (line.parallelPlan === null) return "no line: no departure date to save toward";
  if (line.parallelPlan.periods.length === 0) return "no line: no upcoming deadlines";
  const count = line.parallelPlan.periods.length;
  return `${count} upcoming deadline${count === 1 ? "" : "s"}`;
}

/**
 * The chart ParallelSavingsChart draws for one scenario, drawn for every
 * scenario of the trip at once on its own canvas: the same line chart,
 * axes, series shape, peak dots, and tooltip. The viewed scenario's
 * series is drawn exactly as on its own chart, on top; every other one
 * the same, faded and dashed. A legend under it says what each scenario
 * is. Nothing says what a drop holds: this canvas compares shapes, and
 * what one scenario's deadline holds is on that scenario's own chart.
 */
export function ParallelSavingsComparisonChart({
  lines,
  asOfDate,
}: {
  lines: ScenarioComparisonLine[];
  asOfDate: string;
}) {
  const series = buildSawtoothComparisonSeries(lines, asOfDate)
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.data.length > 0)
    // Others first, so the viewed scenario's series is drawn on top.
    .sort((a, b) => Number(a.isViewed) - Number(b.isViewed));
  const viewed = series.find((item) => item.isViewed);

  return (
    <div data-testid="one-pot-per-payment-comparison">
      {series.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming deadlines to plan a pot for yet.</p>
      ) : (
        // Same LineChart, axes and tooltip as ParallelSavingsChart's --
        // only the series differ. Each series carries its own data, so
        // scenarios with different deadlines share one time axis.
        <ResponsiveContainer width="100%" height={240}>
          <LineChart margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
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
            <Tooltip content={<BalanceTooltip seriesName={viewed?.name ?? ""} />} />
            {series.map((item) => (
              <Line
                key={item.scenarioId}
                data={item.data}
                type="linear"
                dataKey="balance"
                name={item.name}
                {...seriesStyle(item.isViewed, item.index)}
                dot={<PeakDot muted={!item.isViewed} />}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <ComparisonLegend
        lines={lines}
        swatch={(line, index) => (
          <svg width="28" height="10" aria-hidden="true" className="mt-1.5 shrink-0">
            <line x1="1" y1="5" x2="27" y2="5" {...seriesStyle(line.isViewed, index)} />
          </svg>
        )}
        detail={comparisonDetail}
      />
    </div>
  );
}

// A deadline with more payments than this folds them behind a
// disclosure instead of a wall of lines -- never behind a bare count:
// opening it names every one.
const INLINE_ITEM_LIMIT = 3;

// What a period's closing deadline holds: its amount, and every payment
// in it by name, in potItemText()'s words -- the same lines "When money
// is needed" uses, so the two lists can't describe a payment differently.
function PotItems({ pot }: { pot: DeadlinePot }) {
  const due = (
    <>
      Due {formatDate(pot.dueDate)}:{" "}
      <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatUsd(pot.amountUsd)}</span>
    </>
  );
  const list = (
    <ul className="mt-0.5 space-y-0.5 border-l border-zinc-200 pl-2 dark:border-zinc-700">
      {pot.items.map((item, i) => (
        <li key={i}>{potItemText(item)}</li>
      ))}
    </ul>
  );
  if (pot.items.length <= INLINE_ITEM_LIMIT) {
    return (
      <div className="mt-0.5 text-xs">
        <p>{due}</p>
        {list}
      </div>
    );
  }
  return (
    <details className="mt-0.5 text-xs">
      <summary className="cursor-pointer">
        {due} · {pot.items.length} payments
      </summary>
      {list}
    </details>
  );
}

function ParallelSavingsList({ pastDue, rows }: { pastDue: BuildParallelSavingsPlanResult["pots"]; rows: PeriodRow[] }) {
  return (
    <ul data-testid="saving-periods" className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
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
      {rows.map(({ period, pot }, i) => (
        <li key={i} data-testid="saving-period">
          <p>
            {formatDate(period.fromDate)} → {formatDate(period.toDate)} ·{" "}
            {period.monthsInPeriod === 0
              ? "same date window"
              : `save ${formatUsd(period.totalMonthlySaving)}/month`}{" "}
            ({period.openPotCount} pot{period.openPotCount === 1 ? "" : "s"})
          </p>
          {pot && <PotItems pot={pot} />}
        </li>
      ))}
    </ul>
  );
}
