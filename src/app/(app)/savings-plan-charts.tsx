"use client";

import { DateTime } from "luxon";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BuildParallelSavingsPlanResult } from "@/lib/domain/build-parallel-savings-plan";
import type { BuildPhasedSavingsPlanResult, PhasedSavingsPhase } from "@/lib/domain/build-phased-savings-plan";

import { formatDate, formatUsd } from "./format";

function toTimestamp(date: string): number {
  return DateTime.fromISO(date).toMillis();
}

function formatDateTick(timestamp: number): string {
  return DateTime.fromMillis(timestamp).toFormat("MMM d");
}

function formatUsdTick(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

// Shades of the one accent hue, darkest (first pot, closest) to lightest
// (last pot, furthest out) -- chosen to stay legible in both light and
// dark mode without needing a mode-specific palette of their own.
const POT_COLORS = ["#0e7490", "#0891b2", "#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc"];

type SawtoothPoint = {
  timestamp: number;
  balance: number;
  isPeak: boolean;
  label: string | null;
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
    { timestamp: toTimestamp(asOfDate), balance: startingBalance, isPeak: false, label: null },
  ];
  for (const phase of future) {
    data.push({
      timestamp: toTimestamp(phase.toDate),
      balance: phase.balanceBeforePayment,
      isPeak: true,
      label: `${phase.description} (${formatUsd(phase.balanceBeforePayment)})`,
    });
    data.push({
      timestamp: toTimestamp(phase.toDate),
      balance: phase.balanceAfterPayment,
      isPeak: false,
      label: null,
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

export function ParallelSavingsChart({ plan }: { plan: BuildParallelSavingsPlanResult }) {
  const pastDue = plan.pots.filter((pot) => pot.isPastDue);
  const openPots = plan.pots.filter((pot) => !pot.isPastDue);

  if (plan.periods.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming deadlines to plan a pot for yet.</p>;
  }

  const data = plan.periods.map((period) => {
    const row: Record<string, number | string> = {
      label: formatDateTick(toTimestamp(period.toDate)),
      total: period.totalMonthlySaving,
    };
    openPots.forEach((pot, i) => {
      row[`pot-${i}`] = pot.dueDate >= period.toDate ? pot.monthlySaving ?? 0 : 0;
    });
    return row;
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={formatUsdTick} />
          <Tooltip formatter={(value) => formatUsdTick(Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {openPots.map((pot, i) => (
            <Bar
              key={i}
              dataKey={`pot-${i}`}
              name={pot.description}
              stackId="pots"
              fill={POT_COLORS[i % POT_COLORS.length]}
            />
          ))}
          <Line type="linear" dataKey="total" name="Total" stroke="var(--chart-neutral)" strokeWidth={2} dot />
        </ComposedChart>
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
