"use client";

import { DateTime } from "luxon";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { BuildParallelSavingsPlanResult } from "@/lib/domain/build-parallel-savings-plan";
import type { BuildPhasedSavingsPlanResult, PhasedSavingsPhase } from "@/lib/domain/build-phased-savings-plan";

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

type SawtoothPoint = {
  timestamp: number;
  balance: number;
  isPeak: boolean;
  label: string | null;
  monthlySaving: number;
};

function PeakDot(props: { cx?: number; cy?: number; payload?: SawtoothPoint }) {
  const { cx, cy, payload } = props;
  if (!payload?.isPeak || cx === undefined || cy === undefined) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3} fill="var(--chart-target)" />
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={10} fill="var(--chart-neutral)">
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

export function PhasedSavingsChart({
  plan,
  availableUsd,
  asOfDate,
}: {
  plan: BuildPhasedSavingsPlanResult;
  availableUsd: number;
  asOfDate: string;
}) {
  const pastDue = plan.phases.filter((phase) => phase.isPastDue);
  const future = plan.phases.filter((phase) => !phase.isPastDue);

  if (future.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming deadlines to plan a phase for yet.</p>;
  }

  const startingBalance = pastDue.length > 0 ? pastDue[pastDue.length - 1].balanceAfterPayment : availableUsd;

  const data: SawtoothPoint[] = [
    {
      timestamp: toTimestamp(asOfDate),
      balance: startingBalance,
      isPeak: false,
      label: null,
      monthlySaving: future[0].monthlySaving ?? 0,
    },
  ];
  for (const phase of future) {
    data.push({
      timestamp: toTimestamp(phase.toDate),
      balance: phase.balanceBeforePayment,
      isPeak: true,
      label: `${phase.description} (${formatUsd(phase.balanceBeforePayment)})`,
      monthlySaving: phase.monthlySaving ?? 0,
    });
    data.push({
      timestamp: toTimestamp(phase.toDate),
      balance: phase.balanceAfterPayment,
      isPeak: false,
      label: null,
      monthlySaving: phase.monthlySaving ?? 0,
    });
  }

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
            tick={{ fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={formatUsdTick} />
          <Tooltip
            labelFormatter={(value) => formatDateTick(Number(value))}
            formatter={(value) => formatUsdTick(Number(value))}
          />
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
      <PhasedSavingsList pastDue={pastDue} future={future} />
    </div>
  );
}

function PhasedSavingsList({ pastDue, future }: { pastDue: PhasedSavingsPhase[]; future: PhasedSavingsPhase[] }) {
  return (
    <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
      {pastDue.map((phase, i) => (
        <li key={`past-${i}`} className="text-red-700 dark:text-red-400">
          Overdue since {formatDate(phase.toDate)} · short {formatUsd(phase.shortfallNow ?? 0)} now ·{" "}
          {phase.description}
        </li>
      ))}
      {future.map((phase, i) => (
        <li key={i}>
          {formatDate(phase.fromDate)} → {formatDate(phase.toDate)} · save {formatUsd(phase.monthlySaving ?? 0)}
          /month · {phase.description}
        </li>
      ))}
    </ul>
  );
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
  const openPots = plan.pots.filter((pot) => !pot.isPastDue);

  if (plan.periods.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming deadlines to plan a pot for yet.</p>;
  }

  // The combined balance across every open pot: it rises during each
  // period at that period's total monthly saving, then drops by that
  // period's own payment amount right on its due date -- mathematically
  // identical to the sum of every pot's own balance, since each pot's
  // monthly saving is exactly what's needed to reach its own amount by
  // its own due date (see build-parallel-savings-plan.test.ts's
  // total-saved invariant).
  let balance = availableUsd;
  const data: SawtoothPoint[] = [
    {
      timestamp: toTimestamp(asOfDate),
      balance,
      isPeak: false,
      label: null,
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
      monthlySaving: period.totalMonthlySaving,
    });
    balance = Math.max(0, balance - pot.amountUsd);
    data.push({
      timestamp: toTimestamp(pot.dueDate),
      balance,
      isPeak: false,
      label: null,
      monthlySaving: period.totalMonthlySaving,
    });
  });

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
            tick={{ fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={formatUsdTick} />
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
      {pastDue.map((pot, i) => (
        <li key={`past-${i}`} className="text-red-700 dark:text-red-400">
          Overdue since {formatDate(pot.dueDate)} · short {formatUsd(pot.shortfallNow ?? 0)} now · {pot.description}
        </li>
      ))}
      {periods.map((period, i) => (
        <li key={i}>
          {formatDate(period.fromDate)} → {formatDate(period.toDate)} · save{" "}
          {formatUsd(period.totalMonthlySaving)}/month ({period.openPotCount} pot
          {period.openPotCount === 1 ? "" : "s"})
        </li>
      ))}
    </ul>
  );
}
