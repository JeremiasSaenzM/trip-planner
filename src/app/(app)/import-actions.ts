"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import type { ProposalItem } from "@/lib/data/types";
import { checkAgainstForm, type ResolveReference } from "@/lib/proposals/form-check";
import { parseProposalPaste } from "@/lib/proposals/parse";
import { resolverFor, reviewBatch, unknownReferences, type ItemState, type ReviewRows } from "@/lib/proposals/review";
import {
  approveAllReadyInput,
  approveProposalInput,
  closeProposalBatchInput,
  rejectProposalInput,
} from "@/lib/validation/proposals";

import {
  initialFormActionState,
  type ApproveAllReadyActionState,
  type FormActionState,
  type ProposalPasteActionState,
} from "./form-action-state";
import { firstIssueMessage } from "./server-action-helpers";

// Server Actions behind /import (see import-ui.tsx). Nothing here writes
// plan data itself: approving calls approve_proposal(), which runs the
// same write a form would (20261021090000_import_proposals.sql). Before
// that, each proposal goes through the same Zod schema its form uses
// (checkAgainstForm), so a broken rule fails with the form's own message.

// Approving can change any page's figures, and the Overview notice
// counts what's still waiting.
function revalidateAll() {
  revalidatePath("/", "layout");
}

async function loadRows(): Promise<ReviewRows & { tripId: string | null }> {
  const [
    trips,
    sources,
    competitions,
    scenarios,
    budgetLines,
    payments,
    fxRates,
    savingsEntries,
    stays,
    movements,
    flightOptions,
    flightSegments,
  ] = await Promise.all([
    dataSource.getTrips(),
    dataSource.getSources(),
    dataSource.getCompetitions(),
    dataSource.getScenarios(),
    dataSource.getBudgetLines(),
    dataSource.getPayments(),
    dataSource.getFxRates(),
    dataSource.getSavingsEntries(),
    dataSource.getStays(),
    dataSource.getMovements(),
    dataSource.getFlightOptions(),
    dataSource.getFlightSegments(),
  ]);
  return {
    tripId: trips[0]?.id ?? null,
    sources,
    competitions,
    scenarios,
    budgetLines,
    payments,
    fxRates,
    savingsEntries,
    stays,
    movements,
    flightOptions,
    flightSegments,
  };
}

// A reference to an item of the paste has no id yet when the paste is
// checked -- any well-formed id stands in for it, which is all the form
// schemas need ("is there a source?"), never which one.
const PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";
const placeholderResolver: ResolveReference = (reference) => ("id" in reference ? reference.id : PLACEHOLDER_ID);

export async function submitProposalPaste(
  _previous: ProposalPasteActionState,
  formData: FormData,
): Promise<ProposalPasteActionState> {
  const text = String(formData.get("text") ?? "");
  const parsed = parseProposalPaste(text);
  if (!parsed.ok) return { status: "error", problems: parsed.problems };

  const rows = await loadRows();
  if (!rows.tripId) return { status: "error", problems: ["Start a trip first (on Overview)."] };
  const tripId = rows.tripId;

  const problems = parsed.items.flatMap((item) => {
    const label = `Item ${item.position + 1} (${item.op})`;
    const references = unknownReferences(item, tripId, rows).map((problem) => `${label}, ${problem}`);
    const check = checkAgainstForm(item, { tripId, resolve: placeholderResolver, rows });
    return check.ok ? references : [...references, `${label}: ${check.message}`];
  });
  if (problems.length > 0) return { status: "error", problems };

  let batchId: string;
  try {
    batchId = await dataSource.createProposalBatch({ tripId, note: parsed.note, rawText: text, items: parsed.items });
  } catch (error) {
    return { status: "error", problems: [translatePostgresError(error as { message: string })] };
  }

  revalidateAll();
  redirect(`/import/${batchId}`);
}

// Why a pending item can't be approved right now, in words.
function notReadyMessage(state: ItemState, position: (n: number) => string): string | null {
  switch (state.kind) {
    case "ready":
      return null;
    case "approved":
    case "approved_deleted":
      return "This proposal was already approved.";
    case "rejected":
      return "This proposal was already rejected.";
    case "waiting":
      return `Approve ${state.on.map(position).join(", ")} first -- this one depends on it.`;
    case "blocked":
      return `This depends on ${state.by.map(position).join(", ")}, which was rejected -- it can only be rejected now.`;
    case "stale":
      return "This changed since the proposal was written. Reject it and ask for a fresh proposal.";
    case "missing_target":
      return "The row this proposal updates no longer exists.";
    case "unreadable":
      return "This proposal's contents can't be read.";
  }
}

type ApproveOutcome = { ok: true } | { ok: false; message: string; attempted: boolean };

// One approval, decided against freshly loaded data: the batch as it is
// now (an earlier approval may have just unlocked this one) and the rows
// as they are now (a value may have moved since the page was loaded).
async function approveOne(itemId: string): Promise<ApproveOutcome> {
  const [allItems, batches, rows] = await Promise.all([
    dataSource.getProposalItems(),
    dataSource.getProposalBatches(),
    loadRows(),
  ]);
  const item = allItems.find((candidate) => candidate.id === itemId);
  const batch = item ? batches.find((candidate) => candidate.id === item.batchId) : undefined;
  if (!item || !batch) return { ok: false, message: "That doesn't exist, or isn't yours.", attempted: false };

  const items = allItems.filter((candidate) => candidate.batchId === batch.id);
  const review = reviewBatch(items, rows).find((candidate) => candidate.item.id === itemId)!;
  const notReady = notReadyMessage(review.state, (n) => `item ${n + 1}`);
  if (notReady) return { ok: false, message: notReady, attempted: false };

  const check = checkAgainstForm(item, { tripId: batch.tripId, resolve: resolverFor(items), rows });
  if (!check.ok) return { ok: false, message: check.message, attempted: true };

  try {
    await dataSource.approveProposal(itemId);
  } catch (error) {
    return { ok: false, message: translatePostgresError(error as { message: string }), attempted: true };
  }
  return { ok: true };
}

export async function approveProposal(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = approveProposalInput.safeParse({ itemId: formData.get("itemId") });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  const outcome = await approveOne(parsed.data.itemId);
  revalidateAll();
  return outcome.ok ? initialFormActionState : { status: "error", message: outcome.message };
}

// Every pending item, in batch order, each in its own transaction: one
// that fails (a broken rule, the safeguard, a value that moved) is
// reported and the rest carry on. Order is what lets a chain like
// competition -> scenario -> budget lines go through in one click --
// each approval unlocks the next. Items that aren't ready (stale,
// blocked, waiting on something that failed) are left pending as they
// are, not counted as failures.
export async function approveAllReady(
  _previous: ApproveAllReadyActionState,
  formData: FormData,
): Promise<ApproveAllReadyActionState> {
  const parsed = approveAllReadyInput.safeParse({ batchId: formData.get("batchId") });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  const pending: ProposalItem[] = (await dataSource.getProposalItems())
    .filter((item) => item.batchId === parsed.data.batchId && item.status === "pending")
    .sort((a, b) => a.position - b.position);

  let approved = 0;
  const failures: { position: number; message: string }[] = [];
  for (const item of pending) {
    const outcome = await approveOne(item.id);
    if (outcome.ok) approved += 1;
    else if (outcome.attempted) failures.push({ position: item.position, message: outcome.message });
  }

  revalidateAll();
  return { status: "done", approved, failures };
}

export async function rejectProposal(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = rejectProposalInput.safeParse({
    itemId: formData.get("itemId"),
    reason: formData.get("reason"),
    cascade: formData.get("cascade") === "reject",
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.rejectProposal(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

export async function closeProposalBatch(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = closeProposalBatchInput.safeParse({
    batchId: formData.get("batchId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.closeProposalBatch(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}
