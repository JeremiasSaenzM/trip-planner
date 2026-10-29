"use client";

import { useActionState, useId } from "react";

import type { Competition } from "@/lib/data/types";

import { createCompetition, createScenario, createTrip } from "./bootstrap-actions";
import { Card, CardLabel } from "./dashboard-ui";
import { initialFormActionState } from "./form-action-state";
import { buttonClass, FormError, inputClass, labelClass } from "./form-styles";

// The Overview page's "no_trip" empty state: the hosted database starts
// out completely empty, so this is the only way into the rest of the app.
export function CreateTripForm() {
  const [state, formAction, pending] = useActionState(createTrip, initialFormActionState);

  return (
    <Card>
      <CardLabel>Start your trip</CardLabel>
      <form action={formAction} className="mt-3 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="trip-name" className={labelClass}>
            Trip name
          </label>
          <input id="trip-name" name="name" required className={inputClass} placeholder="Thornmere 2029" />
        </div>
        {state.status === "error" && <FormError message={state.message} />}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Creating…" : "Create trip"}
        </button>
      </form>
    </Card>
  );
}

// Step 1 of the "no_scenario" empty state, shown until the trip has at
// least one competition candidate -- and reused on /scenarios to add
// more. Only the name is required: a competition can be worth costing
// before its host or dates are announced. useId() keeps the label/input
// pairs unique when this renders next to other forms on the same page.
export function AddCompetitionForm({ tripId }: { tripId: string }) {
  const [state, formAction, pending] = useActionState(createCompetition, initialFormActionState);
  const formId = useId();
  const fieldId = (field: string) => `${formId}-${field}`;

  return (
    <Card>
      <CardLabel>Add a competition</CardLabel>
      <form action={formAction} className="mt-3 space-y-4">
        <input type="hidden" name="tripId" value={tripId} />
        <div className="space-y-1.5">
          <label htmlFor={fieldId("name")} className={labelClass}>
            Name
          </label>
          <input
            id={fieldId("name")}
            name="name"
            required
            className={inputClass}
            placeholder="Thornmere International Choir Festival"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={fieldId("city")} className={labelClass}>
              City (optional)
            </label>
            <input id={fieldId("city")} name="city" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={fieldId("country")} className={labelClass}>
              Country (optional)
            </label>
            <input id={fieldId("country")} name="country" className={inputClass} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={fieldId("venue")} className={labelClass}>
            Venue (optional)
          </label>
          <input id={fieldId("venue")} name="venue" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={fieldId("start")} className={labelClass}>
              Official festival dates: first day
            </label>
            <input id={fieldId("start")} name="startDate" type="date" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={fieldId("end")} className={labelClass}>
              Official festival dates: final day
            </label>
            <input id={fieldId("end")} name="endDate" type="date" className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Give both dates or leave both empty if they aren&apos;t announced yet. They start out pending. You can
          mark them confirmed later, once you add a source for them.
        </p>
        <div className="space-y-1.5">
          <label htmlFor={fieldId("timezone")} className={labelClass}>
            Time zone (optional)
          </label>
          <input id={fieldId("timezone")} name="timezone" className={inputClass} placeholder="Europe/London" />
        </div>
        {state.status === "error" && <FormError message={state.message} />}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Adding…" : "Add competition"}
        </button>
      </form>
    </Card>
  );
}

// Step 2 of the "no_scenario" empty state, shown once at least one
// competition exists for this trip -- and reused on /scenarios. "No
// competition yet" is a real choice: a scenario can be linked to one
// later (EditScenarioForm in scenarios-ui.tsx).
export function CreateScenarioForm({ tripId, competitions }: { tripId: string; competitions: Competition[] }) {
  const [state, formAction, pending] = useActionState(createScenario, initialFormActionState);
  const formId = useId();

  return (
    <Card>
      <CardLabel>Create a scenario</CardLabel>
      <form action={formAction} className="mt-3 space-y-4">
        <input type="hidden" name="tripId" value={tripId} />
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-name`} className={labelClass}>
            Name
          </label>
          <input
            id={`${formId}-name`}
            name="name"
            required
            className={inputClass}
            placeholder="Thornmere 2029"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-competition`} className={labelClass}>
            Competition
          </label>
          <CompetitionSelect id={`${formId}-competition`} competitions={competitions} defaultValue={competitions[0]?.id ?? ""} />
        </div>
        {state.status === "error" && <FormError message={state.message} />}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Creating…" : "Create scenario"}
        </button>
      </form>
    </Card>
  );
}

// Shared with EditScenarioForm. "" submits as "no competition"
// (optionalText() turns it into undefined, stored as null).
export function CompetitionSelect({
  id,
  competitions,
  defaultValue,
}: {
  id: string;
  competitions: Competition[];
  defaultValue: string;
}) {
  return (
    <select id={id} name="competitionId" defaultValue={defaultValue} className={inputClass}>
      {competitions.map((competition) => (
        <option key={competition.id} value={competition.id}>
          {competition.name}
        </option>
      ))}
      <option value="">No competition yet</option>
    </select>
  );
}
