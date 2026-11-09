"use client";

import { useActionState, useEffect, useId, useState } from "react";

import type { Trip, TripStatus } from "@/lib/data/types";

import { updateTrip } from "./bootstrap-actions";
import { initialFormActionState } from "./form-action-state";
import { buttonClass, FormError, inputClass, labelClass, secondaryButtonClass } from "./form-styles";
import { TRIP_STATUS_LABELS, TRIP_STATUS_ORDER } from "./trip-labels";

// The footer of a trip's card on /trips, same split as
// ScenarioRowActions in scenarios-ui.tsx -- view/edit, so the card
// stays findable by its name while the form is open. No delete: the
// spec for this phase (Phase 6.10) doesn't call for one, and nothing
// here falls out for free the way it did for scenarios.
export function TripRowActions({ trip }: { trip: Trip }) {
  const [editing, setEditing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (editing) {
    return (
      <EditTripForm
        key={attempt}
        trip={trip}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-3 text-sm">
      <button
        type="button"
        onClick={() => {
          setAttempt((value) => value + 1);
          setEditing(true);
        }}
        className="text-zinc-600 underline dark:text-zinc-400"
      >
        Edit
      </button>
    </div>
  );
}

function EditTripForm({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(updateTrip, initialFormActionState);
  const formId = useId();
  const fieldId = (field: string) => `${formId}-${field}`;
  const [status, setStatus] = useState<TripStatus>(trip.status);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={trip.id} />
      <div className="space-y-1.5">
        <label htmlFor={fieldId("name")} className={labelClass}>
          New name
        </label>
        <input id={fieldId("name")} name="name" required defaultValue={trip.name} className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={fieldId("status")} className={labelClass}>
          Status
        </label>
        <select
          id={fieldId("status")}
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as TripStatus)}
          className={inputClass}
        >
          {TRIP_STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {TRIP_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={fieldId("reason")} className={labelClass}>
          Reason for this change
        </label>
        <input id={fieldId("reason")} name="reason" required className={inputClass} />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
