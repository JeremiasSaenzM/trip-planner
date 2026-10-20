"use client";

import { useActionState, useId, useState } from "react";

import {
  initialApproveAllReadyActionState,
  initialFormActionState,
  initialProposalPasteActionState,
} from "./form-action-state";
import { buttonClass, FormError, inputClass, labelClass, secondaryButtonClass } from "./form-styles";
import { approveAllReady, approveProposal, closeProposalBatch, rejectProposal, submitProposalPaste } from "./import-actions";

export function PasteProposalsForm() {
  const [state, formAction, pending] = useActionState(submitProposalPaste, initialProposalPasteActionState);
  const formId = useId();

  return (
    <form action={formAction} className="space-y-2.5">
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-text`} className={labelClass}>
          Proposals to review
        </label>
        <textarea
          id={`${formId}-text`}
          name="text"
          required
          rows={10}
          spellCheck={false}
          placeholder='{"format": "trip-planner-proposals", "version": 1, "items": [...]}'
          className={`${inputClass} font-mono text-sm`}
        />
      </div>
      {state.status === "error" && (
        <div role="alert" className="space-y-1 text-sm text-red-600 dark:text-red-400">
          <p>Nothing was saved. Fix these and paste again:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {state.problems.map((problem, index) => (
              <li key={index} className="break-words">
                {problem}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Checking…" : "Review proposals"}
      </button>
    </form>
  );
}

// The footer of one proposal's card. Approve is offered only when the
// item is ready (the page says why when it isn't); Reject always is, for
// anything still pending -- a stale or blocked item is reject-only.
export function ProposalItemActions({
  itemId,
  canApprove,
  dependents,
}: {
  itemId: string;
  canApprove: boolean;
  /** Pending items that depend on this one, already worded ("item 3: Flights"). */
  dependents: string[];
}) {
  const [mode, setMode] = useState<"view" | "reject">("view");
  const [attempt, setAttempt] = useState(0);
  const [approveState, approveAction, approving] = useActionState(approveProposal, initialFormActionState);

  if (mode === "reject") {
    return <RejectProposalForm key={attempt} itemId={itemId} dependents={dependents} onCancel={() => setMode("view")} />;
  }

  return (
    <div className="mt-3 space-y-2">
      {approveState.status === "error" && <FormError message={approveState.message} />}
      <div className="flex gap-2">
        {canApprove && (
          <form action={approveAction} className="flex-1">
            <input type="hidden" name="itemId" value={itemId} />
            <button type="submit" disabled={approving} className={buttonClass}>
              {approving ? "Approving…" : "Approve"}
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={() => {
            setAttempt((value) => value + 1);
            setMode("reject");
          }}
          className={`${secondaryButtonClass} flex-1`}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function RejectProposalForm({
  itemId,
  dependents,
  onCancel,
}: {
  itemId: string;
  dependents: string[];
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(rejectProposal, initialFormActionState);
  const formId = useId();

  return (
    <form action={formAction} className="mt-3 space-y-2.5">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for rejecting this
        </label>
        <input id={`${formId}-reason`} name="reason" required className={inputClass} />
      </div>
      {dependents.length > 0 && (
        // No default: what happens to the items that depend on this one
        // is a decision, so it's asked, never assumed.
        <fieldset className="space-y-1.5">
          <legend className={labelClass}>
            {dependents.length === 1 ? "One item depends on this" : `${dependents.length} items depend on this`}:{" "}
            {dependents.join("; ")}
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="cascade" value="reject" required />
            Reject them too, with this reason
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="cascade" value="leave" required />
            Leave them pending (they&apos;ll show as blocked)
          </label>
        </fieldset>
      )}
      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Rejecting…" : "Reject"}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ApproveAllReadyForm({ batchId, readyCount }: { batchId: string; readyCount: number }) {
  const [state, formAction, pending] = useActionState(approveAllReady, initialApproveAllReadyActionState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="batchId" value={batchId} />
      <button type="submit" disabled={pending || readyCount === 0} className={buttonClass}>
        {pending ? "Approving…" : `Approve all ready (${readyCount})`}
      </button>
      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "done" && (
        <div role="status" className="space-y-1 text-sm">
          <p>
            Approved {state.approved} {state.approved === 1 ? "item" : "items"}.
            {state.failures.length > 0 ? ` ${state.failures.length} couldn't be approved:` : ""}
          </p>
          {state.failures.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-red-600 dark:text-red-400">
              {state.failures.map((failure) => (
                <li key={failure.position}>
                  Item {failure.position + 1}: {failure.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

export function CloseBatchForm({ batchId, pendingCount }: { batchId: string; pendingCount: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(closeProposalBatch, initialFormActionState);
  const formId = useId();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={secondaryButtonClass}>
        Close batch
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="batchId" value={batchId} />
      <p className="text-sm">
        Rejects the {pendingCount} {pendingCount === 1 ? "item" : "items"} still pending, each with this reason.
        Approved items stay as they are.
      </p>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for closing this batch
        </label>
        <input id={`${formId}-reason`} name="reason" required className={inputClass} />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Closing…" : "Close batch"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
