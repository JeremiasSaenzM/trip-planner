"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { BudgetCategory } from "@/lib/domain/types";
import type { CategoryTotals } from "@/lib/domain/roll-up-budget-by-scenario";
import type { ScheduleEntry } from "@/lib/domain/calculate-required-savings";

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
        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <XAxis dataKey="category" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={44} />
        <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="target" name="Target" fill="#52525b" radius={[3, 3, 0, 0]} />
        <Bar dataKey="conservative" name="Conservative" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SavingsScheduleChart({ schedule }: { schedule: ScheduleEntry[] }) {
  const data = schedule.map((entry) => ({
    dueDate: entry.dueDate,
    required: Math.round(entry.cumulativeTarget),
    remaining: Math.round(entry.remainingTarget),
  }));

  if (data.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No deadlines to schedule against yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <XAxis dataKey="dueDate" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={44} />
        <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="required" name="Cumulative required" fill="#52525b" radius={[3, 3, 0, 0]} />
        <Bar dataKey="remaining" name="Still remaining" fill="#dc2626" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
