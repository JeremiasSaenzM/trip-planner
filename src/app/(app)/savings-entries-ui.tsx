"use client";

import { useActionState, useEffect, useState } from "react";

import type { SavingsEntry } from "@/lib/data/types";

import { deleteSavingsEntry, recordSavingsEntry, updateSavingsEntry } from "./savings-actions";
import { formatDate, formatUsd } from "./format";
import { buttonClass, FormError, inputClass, labelClass, secondaryButtonClass } from "./form-styles";
import { initialFormActionState } from "./form-action-state";

// The record-entry form and the list underneath, together -- the one
// place money set aside gets recorded. No currency field: every entry
// is USD (see savings-entries.ts's own doc comment), and the app never
// asks for or plans around "savings capacity" -- only what's actually
// been set aside so far.
export function RecordSavingsEntryForm({ tripId }: { tripId: string }) {
  const [state, formAction, pending] = useActionState(recordSavingsEntry, initialFormActionState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="tripId" value={tripId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="entry-amount" className={labelClass}>
            Amount (USD)
          </label>
          <input
            id="entry-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="entry-date" className={labelClass}>
            Date
          </label>
          <input id="entry-date" name="recordedOn" type="date" required className={inputClass} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="entry-note" className={labelClass}>
          Note (optional)
        </label>
        <input id="entry-note" name="note" className={inputClass} />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Recording…" : "Record"}
      </button>
    </form>
  );
}

export function SavingsEntryList({ entries }: { entries: SavingsEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No savings recorded yet.</p>;
  }

  const sorted = [...entries].sort((a, b) => b.recordedOn.localeCompare(a.recordedOn));

  return (
    <ul className="space-y-2">
      {sorted.map((entry) => (
        <SavingsEntryRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

type RowMode = "view" | "edit" | "delete";

function SavingsEntryRow({ entry }: { entry: SavingsEntry }) {
  const [mode, setMode] = useState<RowMode>("view");
  const [deleteState, deleteAction, deletePending] = useActionState(deleteSavingsEntry, initialFormActionState);

  // entry.id stays the same across an edit, so this row never remounts
  // on its own -- editAttempt is bumped on every "Edit" click purely so
  // EditEntryForm below can be given a fresh `key`, forcing a genuine
  // remount (and so a fresh useActionState) each time editing starts.
  // Without that, a *second* edit landing on the exact same values as
  // the first would see the first attempt's already-"success" state
  // and skip straight past the form; see EditEntryForm's own comment.
  const [editAttempt, setEditAttempt] = useState(0);

  if (mode === "edit") {
    return (
      <EditEntryForm key={editAttempt} entry={entry} onCancel={() => setMode("view")} onSaved={() => setMode("view")} />
    );
  }

  if (mode === "delete") {
    return (
      <li className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <form action={deleteAction} className="space-y-2.5">
          <input type="hidden" name="id" value={entry.id} />
          <p className="text-sm">
            Delete {formatUsd(entry.amount)} recorded {formatDate(entry.recordedOn)}?
          </p>
          <input
            name="reason"
            required
            placeholder="Reason for deleting this"
            aria-label="Reason for deleting this"
            className={inputClass}
          />
          {deleteState.status === "error" && <FormError message={deleteState.message} />}
          <div className="flex gap-2">
            <button type="submit" disabled={deletePending} className={buttonClass}>
              {deletePending ? "Deleting…" : "Delete"}
            </button>
            <button type="button" onClick={() => setMode("view")} className={secondaryButtonClass}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div>
        <p className="font-medium">{formatUsd(entry.amount)}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatDate(entry.recordedOn)}
          {entry.note ? ` · ${entry.note}` : ""}
        </p>
      </div>
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setEditAttempt((attempt) => attempt + 1);
            setMode("edit");
          }}
          className="text-zinc-600 underline dark:text-zinc-400"
        >
          Edit
        </button>
        <button type="button" onClick={() => setMode("delete")} className="text-red-600 underline dark:text-red-400">
          Delete
        </button>
      </div>
    </li>
  );
}

// Its own component (not inlined in SavingsEntryRow) so it can be given
// a `key` that forces a remount -- and so a fresh useActionState -- each
// time editing starts. Without that, a *second* edit submitting the
// exact same values as a prior successful one would still carry that
// prior attempt's already-"success" state on mount, and the effect
// below would call onSaved() immediately instead of waiting for this
// attempt's own submission.
function EditEntryForm({
  entry,
  onCancel,
  onSaved,
}: {
  entry: SavingsEntry;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [editState, editAction, editPending] = useActionState(updateSavingsEntry, initialFormActionState);

  useEffect(() => {
    if (editState.status === "success") {
      onSaved();
    }
  }, [editState, onSaved]);

  return (
    <li className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <form action={editAction} className="space-y-2.5">
        <input type="hidden" name="id" value={entry.id} />
        <div className="grid grid-cols-2 gap-2.5">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={entry.amount}
            aria-label="New amount (USD)"
            className={inputClass}
          />
          <input
            name="recordedOn"
            type="date"
            required
            defaultValue={entry.recordedOn}
            aria-label="New date"
            className={inputClass}
          />
        </div>
        <input name="note" defaultValue={entry.note ?? ""} aria-label="New note" className={inputClass} />
        <input
          name="reason"
          required
          placeholder="Reason for this change"
          aria-label="Reason for this change"
          className={inputClass}
        />
        {editState.status === "error" && <FormError message={editState.message} />}
        <div className="flex gap-2">
          <button type="submit" disabled={editPending} className={buttonClass}>
            {editPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}
