import type { Metadata } from "next";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import type { OpenItem, OpenItemCategory } from "@/lib/data/types";

import { DashboardControls } from "../dashboard-controls";
import { loadDashboardData } from "../dashboard-data";
import { Card, EmptyState } from "../dashboard-ui";
import { formatDate } from "../format";

export const metadata: Metadata = { title: "Deadlines" };

const CATEGORY_LABELS: Record<OpenItemCategory, string> = {
  deadline: "Deadlines",
  task: "Tasks",
  question: "Open questions",
};

const CATEGORY_ORDER: OpenItemCategory[] = ["deadline", "task", "question"];

export default function DeadlinesPage({ searchParams }: PageProps<"/deadlines">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Deadlines</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
        <DeadlinesScreen searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DeadlinesScreen({ searchParams }: { searchParams: PageProps<"/deadlines">["searchParams"] }) {
  await getCurrentUser();
  const { scenario: scenarioId, basis } = await searchParams;
  const data = await loadDashboardData({
    scenarioId: typeof scenarioId === "string" ? scenarioId : undefined,
    basis: typeof basis === "string" ? basis : undefined,
  });

  if (data.status === "no_trip") return <EmptyState>No trip yet.</EmptyState>;
  if (data.status === "no_scenario") return <EmptyState>No scenario yet for this trip.</EmptyState>;

  if (data.openItems.length === 0) {
    return (
      <div className="space-y-6">
        <DashboardControls
          basePath="/deadlines"
          scenarios={data.scenarios}
          activeScenarioId={data.scenario.id}
          basis={data.basis}
        />
        <EmptyState>No deadlines, tasks or open questions recorded yet.</EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardControls
        basePath="/deadlines"
        scenarios={data.scenarios}
        activeScenarioId={data.scenario.id}
        basis={data.basis}
      />

      {CATEGORY_ORDER.map((category) => (
        <OpenItemGroup
          key={category}
          title={CATEGORY_LABELS[category]}
          items={data.openItems.filter((item) => item.category === category)}
        />
      ))}
    </div>
  );
}

function OpenItemGroup({ title, items }: { title: string; items: OpenItem[] }) {
  if (items.length === 0) return null;

  // Open items first, then by due date (items with no date last).
  const sorted = [...items].sort((a, b) => {
    if (a.status === "open" && b.status !== "open") return -1;
    if (a.status !== "open" && b.status === "open") return 1;
    return (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99");
  });

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>
      <div className="space-y-2">
        {sorted.map((item) => (
          <OpenItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function OpenItemRow({ item }: { item: OpenItem }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={item.status === "open" ? "font-medium" : "font-medium text-zinc-400 line-through"}>
            {item.title}
          </p>
          {item.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>}
        </div>
        {item.dueDate && (
          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{formatDate(item.dueDate)}</span>
        )}
      </div>
      {(item.relatedBudgetLineId || item.relatedPaymentId) && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          Linked to {item.relatedBudgetLineId ? "a budget line" : "a payment"}
        </p>
      )}
    </Card>
  );
}
