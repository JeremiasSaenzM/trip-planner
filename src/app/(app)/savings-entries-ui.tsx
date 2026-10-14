"use client";

import { useActionState, useState } from "react";

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
  const [editState, editAction, editPending] = useActionState(updateSavingsEntry, initialFormActionState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteSavingsEntry, initialFormActionState);

  // entry.id stays the same across an edit, so this component never
  // remounts and its own mode state would otherwise survive a
  // successful save forever, leaving the row stuck showing the edit
  // form with no way back to "Delete". editingSnapshot captures what
  // the row looked like the moment editing started; once the server's
  // own values (after revalidatePath()) differ from that snapshot, the
  // save must have gone through, so it's safe to snap back to "view".
  const [editingSnapshot, setEditingSnapshot] = useState<SavingsEntry | null>(null);
  if (
    mode === "edit" &&
    editingSnapshot &&
    (entry.amount !== editingSnapshot.amount ||
      entry.recordedOn !== editingSnapshot.recordedOn ||
      entry.note !== editingSnapshot.note)
  ) {
    setMode("view");
    setEditingSnapshot(null);
  }

  if (mode === "edit") {
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
            <button type="button" onClick={() => setMode("view")} className={secondaryButtonClass}>
              Cancel
            </button>
          </div>
        </form>
      </li>
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
            setEditingSnapshot(entry);
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
