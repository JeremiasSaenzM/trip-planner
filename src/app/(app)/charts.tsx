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
import { cumulativeAt, requiredMonthlyAt, type ScheduleEntry } from "@/lib/domain/calculate-required-savings";
import { groupObligationsByDueDate } from "@/lib/domain/group-obligations-by-due-date";
import type { CategoryTotals } from "@/lib/domain/roll-up-budget-by-scenario";
import type { BudgetCategory } from "@/lib/domain/types";

import { CATEGORY_LABELS, CATEGORY_ORDER } from "./category-labels";
import type { Basis } from "./dashboard-data";
import { formatUsd } from "./format";

function formatUsdTick(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

// Target and conservative bars always; a minimum bar in front of them
// only while minimum is the selected basis, so the default view is
// unchanged and the observed floor is there when asked for.
export function BudgetByCategoryChart({
  byCategory,
  basis,
}: {
  byCategory: Record<BudgetCategory, CategoryTotals>;
  basis: Basis;
}) {
  const showMinimum = basis === "minimum";
  const data = CATEGORY_ORDER.map((category) => ({
    category: CATEGORY_LABELS[category],
    minimum: Math.round(byCategory[category].min),
    target: Math.round(byCategory[category].target),
    conservative: Math.round(byCategory[category].conservative),
  })).filter((row) => row.target > 0 || row.conservative > 0 || (showMinimum && row.minimum > 0));

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
        {showMinimum && <Bar dataKey="minimum" name="Minimum" fill="var(--chart-minimum)" radius={[3, 3, 0, 0]} />}
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
  departureSaveBy,
}: {
  schedule: ScheduleEntry[];
  obligations: BuiltObligation[];
  availableUsd: number;
  bindingRequirementUsd: number;
  asOfDate: string;
  basis: Basis;
  /** The last income date before departure -- where everything owed at
   * departure is saved for, so its deadline reads "Before departure". */
  departureSaveBy: string | null;
}) {
  const future = schedule.filter((entry) => !entry.isPastDue);

  if (future.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming deadlines to schedule against yet.</p>;
  }

  // schedule entries carry only amounts/dates -- the obligation's own
  // description (what the tooltip names) has to be looked up by due date.
  const deadlineNames = new Map(
    groupObligationsByDueDate(obligations, basis, departureSaveBy).map((group) => [group.dueDate, group.description]),
  );

  const asOfTs = toTimestamp(asOfDate);
  const data = [
    { timestamp: asOfTs, cumulativeRequired: 0, projectedSavings: availableUsd, payment: null as string | null },
    // Savings grow once per payday: the same income-date count the
    // headline divides by (entry.monthsUntil), so the projected line
    // meets the binding deadline's total exactly.
    ...future.map((entry) => ({
      timestamp: toTimestamp(entry.dueDate),
      cumulativeRequired: cumulativeAt(entry, basis),
      projectedSavings: availableUsd + bindingRequirementUsd * (entry.monthsUntil ?? 0),
      payment: deadlineNames.get(entry.dueDate) ?? null,
    })),
  ];

  const tightest = future.reduce((best, entry) =>
    (requiredMonthlyAt(entry, basis) ?? 0) > (requiredMonthlyAt(best, basis) ?? 0) ? entry : best,
  );
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
