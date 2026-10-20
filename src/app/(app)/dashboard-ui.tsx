import type { Competition } from "@/lib/data/types";

import { formatUsd } from "./format";

// Why a scenario has no departure date, in plain words -- shared by
// every page that has to explain a figure it can't compute (Overview's
// savings requirement, Payments' before/during-the-trip split), so they
// never fall back to a silent $0 or a silent single bucket instead.
export function noDatesReason(competition: Competition | null): string {
  return competition === null ? "This scenario has no competition yet" : "No festival dates yet";
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">{children}</div>;
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{children}</p>
  );
}

export function RangeFigure({
  label,
  value,
  emphasize,
  testId,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p
        data-testid={testId}
        className={emphasize ? "text-2xl font-semibold" : "text-lg text-zinc-600 dark:text-zinc-400"}
      >
        {formatUsd(value)}
      </p>
    </div>
  );
}

export function Caveat({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <p
      role={tone === "danger" ? "alert" : undefined}
      className={
        tone === "danger"
          ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          : "rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      }
    >
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {children}
    </div>
  );
}
