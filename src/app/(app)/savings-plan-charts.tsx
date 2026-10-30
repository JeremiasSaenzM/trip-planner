"use client";

import { DateTime } from "luxon";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { BuildParallelSavingsPlanResult } from "@/lib/domain/build-parallel-savings-plan";

import { formatDate, formatUsd } from "./format";

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

type SawtoothPoint = {
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

function BalanceTooltip({ active, payload }: { active?: boolean; payload?: { payload: SawtoothPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
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

export function ParallelSavingsChart({
  plan,
  availableUsd,
  asOfDate,
}: {
  plan: BuildParallelSavingsPlanResult;
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
      <ParallelSavingsList pastDue={pastDue} periods={plan.periods} />
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
