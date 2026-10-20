import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import { dataSource } from "@/lib/data";
import { reviewBatch, type FieldRow, type ItemReview, type ItemState } from "@/lib/proposals/review";

import { Card, Caveat } from "../../dashboard-ui";
import { fieldLabel, formatProposalValue, OP_LABELS, referenceText } from "../../import-labels";
import { ApproveAllReadyForm, CloseBatchForm, ProposalItemActions } from "../../import-ui";

export const metadata: Metadata = { title: "Review proposals" };

export default function BatchPage({ params }: PageProps<"/import/[batch]">) {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/import" className="underline">
          ← Import research
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Review proposals</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
        <BatchScreen params={params} />
      </Suspense>
    </div>
  );
}

// Loaded fresh on every visit, so a batch you come back to a week later
// shows each item against the data as it is now: what's still safe to
// approve, and what went stale in the meantime.
async function BatchScreen({ params }: { params: PageProps<"/import/[batch]">["params"] }) {
  await getCurrentUser();
  const { batch: batchId } = await params;

  const [batches, allItems, sources, competitions, scenarios, budgetLines, payments, fxRates, savingsEntries] =
    await Promise.all([
      dataSource.getProposalBatches(),
      dataSource.getProposalItems(),
      dataSource.getSources(),
      dataSource.getCompetitions(),
      dataSource.getScenarios(),
      dataSource.getBudgetLines(),
      dataSource.getPayments(),
      dataSource.getFxRates(),
      dataSource.getSavingsEntries(),
    ]);

  const batch = batches.find((candidate) => candidate.id === batchId);
  if (!batch) notFound();

  const reviews = reviewBatch(
    allItems.filter((item) => item.batchId === batch.id),
    { sources, competitions, scenarios, budgetLines, payments, fxRates, savingsEntries },
  );
  const pendingCount = reviews.filter((review) => review.item.status === "pending").length;
  const readyCount = reviews.filter((review) => review.state.kind === "ready").length;
  const describe = (position: number) => {
    const review = reviews.find((candidate) => candidate.item.position === position);
    return review ? `item ${position + 1} (${OP_LABELS[review.item.op].toLowerCase()})` : `item ${position + 1}`;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="font-medium">{batch.note ?? "Untitled batch"}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Pasted {batch.createdAt.slice(0, 10)} · {reviews.length} items · {pendingCount} pending
        </p>
        <details className="text-xs text-zinc-500 dark:text-zinc-400">
          <summary className="cursor-pointer">What was pasted</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900">
            {batch.rawText}
          </pre>
        </details>
      </div>

      {pendingCount > 0 && (
        <div className="space-y-2">
          <ApproveAllReadyForm batchId={batch.id} readyCount={readyCount} />
          <CloseBatchForm batchId={batch.id} pendingCount={pendingCount} />
        </div>
      )}

      <div className="space-y-3">
        {reviews.map((review) => (
          <ProposalCard key={review.item.id} review={review} describe={describe} />
        ))}
      </div>
    </div>
  );
}

const STATUS_BADGES: Record<ItemState["kind"], string> = {
  ready: "Ready",
  waiting: "Waiting",
  blocked: "Blocked",
  stale: "Out of date",
  missing_target: "Target gone",
  unreadable: "Unreadable",
  approved: "Approved",
  rejected: "Rejected",
};

function ProposalCard({ review, describe }: { review: ItemReview; describe: (position: number) => string }) {
  const { item, state } = review;
  const isUpdate = item.targetId !== null;

  return (
    <Card>
      <div data-testid="proposal-item" className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Item {item.position + 1}</p>
            <p className="font-medium">
              {OP_LABELS[item.op]}
              {review.targetLabel ? `: ${review.targetLabel}` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs font-medium dark:border-zinc-700">
            {STATUS_BADGES[state.kind]}
          </span>
        </div>

        <StateNote state={state} decisionReason={item.decisionReason} describe={describe} />

        <dl className="space-y-1.5 text-sm">
          {review.fields.map((row) => (
            <FieldLine key={row.field} row={row} isUpdate={isUpdate} />
          ))}
        </dl>

        <p className="text-sm">
          <span className="font-medium">Reason:</span> {item.reason}
        </p>
        {review.sources.length > 0 && (
          <p className="text-sm">
            <span className="font-medium">Source:</span> {review.sources.map((source) => referenceText(source)).join("; ")}
          </p>
        )}
        {review.warning && <Caveat>{review.warning}</Caveat>}

        {item.status === "pending" && (
          <ProposalItemActions
            itemId={item.id}
            canApprove={state.kind === "ready"}
            dependents={review.dependents.map(describe)}
          />
        )}
      </div>
    </Card>
  );
}

function StateNote({
  state,
  decisionReason,
  describe,
}: {
  state: ItemState;
  decisionReason: string | null;
  describe: (position: number) => string;
}) {
  const note = "text-sm text-zinc-600 dark:text-zinc-400";
  switch (state.kind) {
    case "waiting":
      return <p className={note}>Waiting on {state.on.map(describe).join(", ")} -- approve that first.</p>;
    case "blocked":
      return (
        <p className={note}>
          Depends on {state.by.map(describe).join(", ")}, which was rejected. This can only be rejected now.
        </p>
      );
    case "stale":
      return (
        <Caveat tone="danger">
          Changed since this was written:{" "}
          {state.fields
            .map(
              (field) =>
                `${fieldLabel(field.field)} is now ${formatProposalValue(field.field, field.now)}, the proposal expected ${formatProposalValue(field.field, field.expected)}`,
            )
            .join("; ")}
          . Reject it and ask for a fresh proposal.
        </Caveat>
      );
    case "missing_target":
      return <Caveat tone="danger">The row this changes no longer exists. Reject it.</Caveat>;
    case "unreadable":
      return <Caveat tone="danger">This proposal&apos;s contents can&apos;t be read. Reject it.</Caveat>;
    case "approved":
      return <p className={note}>Approved -- written to your plan.</p>;
    case "rejected":
      return <p className={note}>Rejected: {decisionReason}</p>;
    case "ready":
      return null;
  }
}

function FieldLine({ row, isUpdate }: { row: FieldRow; isUpdate: boolean }) {
  const isReference = row.proposedLabel !== undefined;
  const proposed = isReference ? referenceText(row.proposedLabel) : formatProposalValue(row.field, row.proposed);

  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{fieldLabel(row.field)}</dt>
      <dd className={row.stale ? "text-red-600 dark:text-red-400" : undefined}>
        {isUpdate ? (
          <>
            {isReference ? referenceText(row.currentLabel) : formatProposalValue(row.field, row.current)}
            {" → "}
            <span className="font-medium">{proposed}</span>
          </>
        ) : row.field === "url" && typeof row.proposed === "string" && /^https?:\/\//i.test(row.proposed) ? (
          // httpUrl (validation/shared.ts) already refused anything but
          // http(s) when this was pasted; checked again here because this
          // is the line that turns it into a link.
          <a href={row.proposed} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">
            {row.proposed}
          </a>
        ) : (
          proposed
        )}
      </dd>
    </div>
  );
}
