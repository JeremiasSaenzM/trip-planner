"use client";

import { useActionState } from "react";

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
          <input id="trip-name" name="name" required className={inputClass} placeholder="Llangollen 2027" />
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
// least one competition candidate.
export function AddCompetitionForm({ tripId }: { tripId: string }) {
  const [state, formAction, pending] = useActionState(createCompetition, initialFormActionState);

  return (
    <Card>
      <CardLabel>Add a competition</CardLabel>
      <form action={formAction} className="mt-3 space-y-4">
        <input type="hidden" name="tripId" value={tripId} />
        <div className="space-y-1.5">
          <label htmlFor="competition-name" className={labelClass}>
            Name
          </label>
          <input
            id="competition-name"
            name="name"
            required
            className={inputClass}
            placeholder="Llangollen International Musical Eisteddfod"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="competition-city" className={labelClass}>
              City
            </label>
            <input id="competition-city" name="city" required className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="competition-country" className={labelClass}>
              Country
            </label>
            <input id="competition-country" name="country" required className={inputClass} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="competition-venue" className={labelClass}>
            Venue (optional)
          </label>
          <input id="competition-venue" name="venue" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="competition-start" className={labelClass}>
              Official festival dates: first day
            </label>
            <input id="competition-start" name="startDate" type="date" required className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="competition-end" className={labelClass}>
              Official festival dates: final day
            </label>
            <input id="competition-end" name="endDate" type="date" required className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          These start out pending. You can mark them confirmed later, once you add a source for them.
        </p>
        <div className="space-y-1.5">
          <label htmlFor="competition-timezone" className={labelClass}>
            Time zone
          </label>
          <input
            id="competition-timezone"
            name="timezone"
            required
            className={inputClass}
            placeholder="Europe/London"
          />
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
// competition exists for this trip.
export function CreateScenarioForm({ tripId, competitions }: { tripId: string; competitions: Competition[] }) {
  const [state, formAction, pending] = useActionState(createScenario, initialFormActionState);

  return (
    <Card>
      <CardLabel>Create a scenario</CardLabel>
      <form action={formAction} className="mt-3 space-y-4">
        <input type="hidden" name="tripId" value={tripId} />
        <div className="space-y-1.5">
          <label htmlFor="scenario-name" className={labelClass}>
            Name
          </label>
          <input id="scenario-name" name="name" required className={inputClass} placeholder="Llangollen 2027" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="scenario-competition" className={labelClass}>
            Competition
          </label>
          <select id="scenario-competition" name="competitionId" required className={inputClass}>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.name}
              </option>
            ))}
          </select>
        </div>
        {state.status === "error" && <FormError message={state.message} />}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Creating…" : "Create scenario"}
        </button>
      </form>
    </Card>
  );
}
