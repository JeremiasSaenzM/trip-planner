"use client";

import { DateTime } from "luxon";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BuiltObligation } from "@/lib/domain/build-obligations";
import type { ScheduleEntry } from "@/lib/domain/calculate-required-savings";
import { groupObligationsByDueDate } from "@/lib/domain/group-obligations-by-due-date";
import type { CategoryTotals } from "@/lib/domain/roll-up-budget-by-scenario";
import type { BudgetCategory } from "@/lib/domain/types";

import type { Basis } from "./dashboard-data";
import { formatUsd } from "./format";

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  A: "Competition",
  B: "Transport",
  C: "Lodging",
  D: "Local transit",
  E: "Food",
  F: "Activities",
  G: "Connectivity",
  H: "Insurance",
  I: "Pre-trip",
  J: "Contingency",
};

const CATEGORY_ORDER: BudgetCategory[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function formatUsdTick(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

export function BudgetByCategoryChart({ byCategory }: { byCategory: Record<BudgetCategory, CategoryTotals> }) {
  const data = CATEGORY_ORDER.map((category) => ({
    category: CATEGORY_LABELS[category],
    target: Math.round(byCategory[category].target),
    conservative: Math.round(byCategory[category].conservative),
  })).filter((row) => row.target > 0 || row.conservative > 0);

  if (data.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No budget lines yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="category" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={formatUsdTick} />
        <Tooltip formatter={(value) => formatUsdTick(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="target" name="Target" fill="var(--chart-target)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="conservative" name="Conservative" fill="var(--chart-conservative)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// A YYYY-MM-DD value is a calendar date, not an instant -- always parse
// and format it pinned to "utc" so the result never depends on the
// server's or the browser's ambient time zone. See format.ts/format.test.ts.
function toTimestamp(date: string): number {
  return DateTime.fromISO(date, { zone: "utc" }).toMillis();
}

function formatDateTick(timestamp: number): string {
  return DateTime.fromMillis(timestamp, { zone: "utc" }).toFormat("MMM d");
}

export function SavingsScheduleChart({
  schedule,
  obligations,
  availableUsd,
  bindingRequirementUsd,
  asOfDate,
  basis,
  departureDate,
}: {
  schedule: ScheduleEntry[];
  obligations: BuiltObligation[];
  availableUsd: number;
  bindingRequirementUsd: number;
  asOfDate: string;
  basis: Basis;
  departureDate: string | null;
}) {
  const future = schedule.filter((entry) => !entry.isPastDue);

  if (future.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming deadlines to schedule against yet.</p>;
  }

  const cumulativeField = basis === "target" ? "cumulativeTarget" : "cumulativeConservative";
  const requiredField = basis === "target" ? "requiredMonthlyTarget" : "requiredMonthlyConservative";

  // schedule entries carry only amounts/dates -- the obligation's own
  // description (what the tooltip names) has to be looked up by due date.
  const deadlineNames = new Map(
    groupObligationsByDueDate(obligations, basis, departureDate).map((group) => [group.dueDate, group.description]),
  );

  const asOfTs = toTimestamp(asOfDate);
  const data = [
    { timestamp: asOfTs, cumulativeRequired: 0, projectedSavings: availableUsd, payment: null as string | null },
    ...future.map((entry) => {
      const months = DateTime.fromISO(entry.dueDate, { zone: "utc" }).diff(
        DateTime.fromISO(asOfDate, { zone: "utc" }),
        "months",
      ).months;
      return {
        timestamp: toTimestamp(entry.dueDate),
        cumulativeRequired: entry[cumulativeField],
        projectedSavings: availableUsd + bindingRequirementUsd * months,
        payment: deadlineNames.get(entry.dueDate) ?? null,
      };
    }),
  ];

  const tightest = future.reduce((best, entry) => ((entry[requiredField] ?? 0) > (best[requiredField] ?? 0) ? entry : best));
  const savingsLabel = `Your savings at ${formatUsd(bindingRequirementUsd)}/month`;

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            formatter={(value, name, item) => {
              const payment = (item.payload as { payment: string | null }).payment;
              const amount = formatUsdTick(Number(value));
              return payment && name === "Money needed by this date" ? `${amount} -- ${payment}` : amount;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            x={toTimestamp(tightest.dueDate)}
            stroke="var(--chart-neutral)"
            strokeDasharray="3 3"
            label={{
              value: "Departure: tightest deadline",
              position: "insideTopRight",
              fontSize: 11,
              fill: "var(--chart-neutral)",
            }}
          />
          <Line
            type="stepAfter"
            dataKey="cumulativeRequired"
            name="Money needed by this date"
            stroke="var(--chart-target)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="linear"
            dataKey="projectedSavings"
            name={savingsLabel}
            stroke="var(--chart-neutral)"
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        You&apos;re on track as long as the dashed line stays above the steps.
      </p>
    </div>
  );
}
