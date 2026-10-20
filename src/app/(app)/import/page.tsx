import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import { dataSource } from "@/lib/data";
import type { ProposalItem } from "@/lib/data/types";

import { Card, EmptyState } from "../dashboard-ui";
import { PasteProposalsForm } from "../import-ui";

export const metadata: Metadata = { title: "Import research" };

export default function ImportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Import research</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
        <ImportScreen />
      </Suspense>
    </div>
  );
}

// Reached from Export ("Import research") and from Overview's notice
// when proposals are waiting -- deliberately not a nav tab.
async function ImportScreen() {
  await getCurrentUser();
  const [trips, batches, items] = await Promise.all([
    dataSource.getTrips(),
    dataSource.getProposalBatches(),
    dataSource.getProposalItems(),
  ]);

  if (!trips[0]) return <EmptyState>No trip yet. Start one from Overview.</EmptyState>;

  const newestFirst = [...batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Paste the proposals block from a research session. Nothing is written to your plan until you approve
          it, item by item -- each one goes through the same checks as entering it by hand.
        </p>
        <PasteProposalsForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pasted batches</h2>
        {newestFirst.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing pasted yet.</p>
        ) : (
          <div className="space-y-2">
            {newestFirst.map((batch) => {
              const counts = countByStatus(items.filter((item) => item.batchId === batch.id));
              return (
                <Card key={batch.id}>
                  <Link href={`/import/${batch.id}`} className="font-medium underline">
                    {batch.note ?? "Untitled batch"}
                  </Link>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Pasted {batch.createdAt.slice(0, 10)} · {counts.pending} pending · {counts.approved} approved ·{" "}
                    {counts.rejected} rejected
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function countByStatus(items: ProposalItem[]) {
  return {
    pending: items.filter((item) => item.status === "pending").length,
    approved: items.filter((item) => item.status === "approved").length,
    rejected: items.filter((item) => item.status === "rejected").length,
  };
}
