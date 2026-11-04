"use client";

import { useActionState, useEffect, useId, useState } from "react";

import type { TripEvent, Scenario, Source, Trip } from "@/lib/data/types";
import type { InfoState } from "@/lib/domain/types";

import { EventSelect } from "./bootstrap-forms";
import { initialFormActionState } from "./form-action-state";
import { buttonClass, FormError, inputClass, labelClass, secondaryButtonClass } from "./form-styles";
import { INFO_STATE_LABELS, INFO_STATE_ORDER } from "./info-state-labels";
import {
  clearScenarioTravelWindow,
  deleteScenario,
  deleteScenarioCascade,
  updateEvent,
  updateScenario,
  updateScenarioTravelWindow,
  updateTripTravelWindow,
} from "./scenario-actions";
import { SourcePicker } from "./source-picker";

// What delete_scenario_cascade would destroy, by type -- computed on
// /scenarios/page.tsx from data already loaded there, so the
// confirmation can say exactly what's going away ("13 budget lines, 13
// payments, 4 stays, 6 movements") instead of a generic "are you sure".
export type ScenarioCascadeCounts = {
  budgetLines: number;
  payments: number;
  stays: number;
  movements: number;
  flightOptions: number;
};

// The footer region of a scenario's card on /scenarios, swapping between
// view/edit/delete/destroy -- same split as BudgetLineRowActions in
// budget-line-write-ui.tsx, so the card stays findable by its name while
// a form is open inside it.
export function ScenarioRowActions({
  scenario,
  events,
  cascadeCounts,
}: {
  scenario: Scenario;
  events: TripEvent[];
  cascadeCounts: ScenarioCascadeCounts;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete" | "destroy">("view");
  const [attempt, setAttempt] = useState(0);

  function startMode(next: "edit" | "delete" | "destroy") {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  if (mode === "edit") {
    return (
      <EditScenarioForm key={attempt} scenario={scenario} events={events} onDone={() => setMode("view")} />
    );
  }
  if (mode === "delete") {
    return <DeleteScenarioForm key={attempt} scenario={scenario} onDone={() => setMode("view")} />;
  }
  if (mode === "destroy") {
    return (
      <DeleteScenarioCascadeForm
        key={attempt}
        scenario={scenario}
        counts={cascadeCounts}
        onDone={() => setMode("view")}
      />
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-3 text-sm">
      <button type="button" onClick={() => startMode("edit")} className="text-zinc-600 underline dark:text-zinc-400">
        Edit
      </button>
      <button type="button" onClick={() => startMode("delete")} className="text-red-600 underline dark:text-red-400">
        Delete
      </button>
      <button
        type="button"
        onClick={() => startMode("destroy")}
        className="font-medium text-red-700 underline dark:text-red-400"
      >
        Delete everything in this scenario
      </button>
    </div>
  );
}

function EditScenarioForm({
  scenario,
  events,
  onDone,
}: {
  scenario: Scenario;
  events: TripEvent[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateScenario, initialFormActionState);
  const formId = useId();

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={scenario.id} />
      {/* This form only renames/relinks -- the travel window has its own
          edit control (EditScenarioTravelWindowForm). Carried through
          unchanged here since update_scenario is a full-row replace;
          never editable in this form, so there's nothing here a blank
          field could accidentally clear. */}
      {scenario.departureDate && <input type="hidden" name="departureDate" value={scenario.departureDate} />}
      {scenario.returnDate && <input type="hidden" name="returnDate" value={scenario.returnDate} />}
      <input type="hidden" name="travelDatesState" value={scenario.travelDatesState} />
      {scenario.travelDatesSourceId && (
        <input type="hidden" name="travelDatesSourceId" value={scenario.travelDatesSourceId} />
      )}
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-name`} className={labelClass}>
          New name
        </label>
        <input id={`${formId}-name`} name="name" required defaultValue={scenario.name} className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-event`} className={labelClass}>
          Event
        </label>
        <EventSelect
          id={`${formId}-event`}
          events={events}
          defaultValue={scenario.eventId ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for this change
        </label>
        <input id={`${formId}-reason`} name="reason" required className={inputClass} />
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

function DeleteScenarioForm({ scenario, onDone }: { scenario: Scenario; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(deleteScenario, initialFormActionState);
  const formId = useId();

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={scenario.id} />
      <p className="text-sm">Delete the scenario {scenario.name}?</p>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for deleting this
        </label>
        <input id={`${formId}-reason`} name="reason" required className={inputClass} />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Deleting…" : "Delete"}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// delete_scenario_cascade, next to the plain delete_scenario above --
// a separate, more dangerous action, not that one quietly growing teeth.
function DeleteScenarioCascadeForm({
  scenario,
  counts,
  onDone,
}: {
  scenario: Scenario;
  counts: ScenarioCascadeCounts;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(deleteScenarioCascade, initialFormActionState);
  const formId = useId();

  const items: [number, string][] = [
    [counts.budgetLines, "budget line"],
    [counts.payments, "payment"],
    [counts.stays, "stay"],
    [counts.movements, "movement"],
    [counts.flightOptions, "flight option"],
  ];
  const destroyed = items
    .filter(([count]) => count > 0)
    .map(([count, noun]) => `${count} ${noun}${count === 1 ? "" : "s"}`);

  return (
    <form action={formAction} className="mt-2 space-y-2.5 rounded-lg border border-red-300 p-3 dark:border-red-800">
      <input type="hidden" name="id" value={scenario.id} />
      <p className="text-sm font-medium text-red-700 dark:text-red-400">
        Delete {scenario.name} and everything in it?
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {destroyed.length > 0 ? `This destroys ${destroyed.join(", ")}.` : "Nothing else references this scenario."}
      </p>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for deleting all of this
        </label>
        <input id={`${formId}-reason`} name="reason" required className={inputClass} />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Deleting everything…" : "Delete everything"}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Events have no delete here: decisions, open items and scenarios
// can all reference one, and nothing in the plan calls for removing a
// candidate yet -- unlinking it from every scenario is enough.
export function EventRowActions({ event, sources }: { event: TripEvent; sources: Source[] }) {
  const [editing, setEditing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (editing) {
    return (
      <EditEventForm
        key={attempt}
        event={event}
        sources={sources}
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

function EditEventForm({
  event: tripEvent,
  sources,
  onDone,
}: {
  event: TripEvent;
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateEvent, initialFormActionState);
  const formId = useId();
  const fieldId = (field: string) => `${formId}-${field}`;

  const [datesState, setDatesState] = useState<InfoState>(tripEvent.datesState);
  const [datesSourceChoice, setDatesSourceChoice] = useState(tripEvent.datesSourceId ?? "");
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  // Mirrors events_dates_confirmed_needs_source -- checked here too
  // so the form refuses before a round trip, same as the payment and
  // budget-line edit forms. The other date rules (both-or-neither, end
  // after start) come back from the server action's own validation.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (datesState === "confirmed" && datesSourceChoice === "") {
      event.preventDefault();
      setClientError("A confirmed date needs a source -- add one, or set the date back to an estimate.");
      return;
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={tripEvent.id} />
      <div className="space-y-1.5">
        <label htmlFor={fieldId("name")} className={labelClass}>
          New name
        </label>
        <input id={fieldId("name")} name="name" required defaultValue={tripEvent.name} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={fieldId("city")} className={labelClass}>
            City (optional)
          </label>
          <input id={fieldId("city")} name="city" defaultValue={tripEvent.city ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={fieldId("country")} className={labelClass}>
            Country (optional)
          </label>
          <input
            id={fieldId("country")}
            name="country"
            defaultValue={tripEvent.country ?? ""}
            className={inputClass}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={fieldId("venue")} className={labelClass}>
          Venue (optional)
        </label>
        <input id={fieldId("venue")} name="venue" defaultValue={tripEvent.venue ?? ""} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={fieldId("start")} className={labelClass}>
            Official event dates: first day
          </label>
          <input
            id={fieldId("start")}
            name="startDate"
            type="date"
            defaultValue={tripEvent.startDate ?? ""}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={fieldId("end")} className={labelClass}>
            Official event dates: final day
          </label>
          <input
            id={fieldId("end")}
            name="endDate"
            type="date"
            defaultValue={tripEvent.endDate ?? ""}
            className={inputClass}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={fieldId("timezone")} className={labelClass}>
          Time zone (optional)
        </label>
        <input
          id={fieldId("timezone")}
          name="timezone"
          defaultValue={tripEvent.timezone ?? ""}
          placeholder="Europe/London"
          className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={fieldId("dates-state")} className={labelClass}>
          Information state (event dates)
        </label>
        <select
          id={fieldId("dates-state")}
          name="datesState"
          value={datesState}
          onChange={(event) => setDatesState(event.target.value as InfoState)}
          className={inputClass}
        >
          {INFO_STATE_ORDER.map((value) => (
            <option key={value} value={value}>
              {INFO_STATE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <SourcePicker
        name="datesSource"
        label="Source (event dates)"
        sources={sources}
        required={false}
        value={datesSourceChoice}
        onChange={setDatesSourceChoice}
      />
      <div className="space-y-1.5">
        <label htmlFor={fieldId("reason")} className={labelClass}>
          Reason for this change
        </label>
        <input id={fieldId("reason")} name="reason" required className={inputClass} />
      </div>
      {clientError && <FormError message={clientError} />}
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

// The trip's own travel window (trip-wide, the same for every scenario).
// Shown read-only by TravelWindowSummary on the page; this is the edit
// toggle and form underneath it.
export function TravelWindowActions({ trip, sources }: { trip: Trip; sources: Source[] }) {
  const [editing, setEditing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (editing) {
    return <EditTravelWindowForm key={attempt} trip={trip} sources={sources} onDone={() => setEditing(false)} />;
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
        {trip.departureDate || trip.returnDate ? "Edit travel window" : "Set travel window"}
      </button>
    </div>
  );
}

function EditTravelWindowForm({ trip, sources, onDone }: { trip: Trip; sources: Source[]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(updateTripTravelWindow, initialFormActionState);
  const formId = useId();
  const fieldId = (field: string) => `${formId}-${field}`;

  const [datesState, setDatesState] = useState<InfoState>(trip.travelDatesState);
  const [sourceChoice, setSourceChoice] = useState(trip.travelDatesSourceId ?? "");
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  // Mirrors trips_travel_dates_confirmed_needs_source, same as the
  // event form; the date rules come back from the server action.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (datesState === "confirmed" && sourceChoice === "") {
      event.preventDefault();
      setClientError("Confirmed travel dates need a source -- add one, or set them back to an estimate.");
      return;
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="mt-2 space-y-2.5">
      <input type="hidden" name="tripId" value={trip.id} />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={fieldId("departure")} className={labelClass}>
            Departure date
          </label>
          <input
            id={fieldId("departure")}
            name="departureDate"
            type="date"
            defaultValue={trip.departureDate ?? ""}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={fieldId("return")} className={labelClass}>
            Return date
          </label>
          <input
            id={fieldId("return")}
            name="returnDate"
            type="date"
            defaultValue={trip.returnDate ?? ""}
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        The day you leave home and the day you get back. Every savings deadline is measured against the departure
        date: money you&apos;ll spend during the trip has to be set aside before you leave.
      </p>
      <div className="space-y-1.5">
        <label htmlFor={fieldId("state")} className={labelClass}>
          Information state (travel dates)
        </label>
        <select
          id={fieldId("state")}
          name="travelDatesState"
          value={datesState}
          onChange={(event) => setDatesState(event.target.value as InfoState)}
          className={inputClass}
        >
          {INFO_STATE_ORDER.map((value) => (
            <option key={value} value={value}>
              {INFO_STATE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <SourcePicker
        name="travelDatesSource"
        label="Source (travel dates)"
        sources={sources}
        required={false}
        value={sourceChoice}
        onChange={setSourceChoice}
      />
      <div className="space-y-1.5">
        <label htmlFor={fieldId("reason")} className={labelClass}>
          Reason for this change
        </label>
        <input id={fieldId("reason")} name="reason" required className={inputClass} />
      </div>
      {clientError && <FormError message={clientError} />}
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

// A scenario's own travel window override -- read-only summary lives on
// /scenarios/page.tsx (ScenarioTravelWindowSummary, built from
// resolveTravelWindow()); this is the edit/revert toggle underneath it,
// same split as TravelWindowActions above for the trip's own window.
export function ScenarioTravelWindowActions({ scenario, sources }: { scenario: Scenario; sources: Source[] }) {
  const [mode, setMode] = useState<"view" | "edit" | "revert">("view");
  const [attempt, setAttempt] = useState(0);
  const hasOwnWindow = scenario.departureDate !== null;

  function startMode(next: "edit" | "revert") {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  if (mode === "edit") {
    return (
      <EditScenarioTravelWindowForm key={attempt} scenario={scenario} sources={sources} onDone={() => setMode("view")} />
    );
  }
  if (mode === "revert") {
    return <RevertScenarioTravelWindowForm key={attempt} scenario={scenario} onDone={() => setMode("view")} />;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-3 text-sm">
      <button type="button" onClick={() => startMode("edit")} className="text-zinc-600 underline dark:text-zinc-400">
        {hasOwnWindow ? "Edit this scenario's window" : "Set this scenario's own window"}
      </button>
      {hasOwnWindow && (
        <button type="button" onClick={() => startMode("revert")} className="text-zinc-600 underline dark:text-zinc-400">
          Revert to the trip&apos;s window
        </button>
      )}
    </div>
  );
}

function EditScenarioTravelWindowForm({
  scenario,
  sources,
  onDone,
}: {
  scenario: Scenario;
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateScenarioTravelWindow, initialFormActionState);
  const formId = useId();
  const fieldId = (field: string) => `${formId}-${field}`;

  const [datesState, setDatesState] = useState<InfoState>(scenario.travelDatesState);
  const [sourceChoice, setSourceChoice] = useState(scenario.travelDatesSourceId ?? "");
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  // Mirrors scenarios_travel_dates_confirmed_needs_source; both date
  // inputs are `required` below, so there's no form shape that submits
  // one date without the other -- clearing an override uses
  // RevertScenarioTravelWindowForm instead, never this form left blank.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (datesState === "confirmed" && sourceChoice === "") {
      event.preventDefault();
      setClientError("Confirmed travel dates need a source -- add one, or set them back to an estimate.");
      return;
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={scenario.id} />
      <input type="hidden" name="name" value={scenario.name} />
      {scenario.eventId && <input type="hidden" name="eventId" value={scenario.eventId} />}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={fieldId("departure")} className={labelClass}>
            Departure date
          </label>
          <input
            id={fieldId("departure")}
            name="departureDate"
            type="date"
            required
            defaultValue={scenario.departureDate ?? ""}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={fieldId("return")} className={labelClass}>
            Return date
          </label>
          <input
            id={fieldId("return")}
            name="returnDate"
            type="date"
            required
            defaultValue={scenario.returnDate ?? ""}
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        This scenario&apos;s own departure and return date, overriding the trip&apos;s. Both are required here --
        to go back to the trip&apos;s window instead, cancel and use &quot;Revert to the trip&apos;s window&quot;.
      </p>
      <div className="space-y-1.5">
        <label htmlFor={fieldId("state")} className={labelClass}>
          Information state (travel dates)
        </label>
        <select
          id={fieldId("state")}
          name="travelDatesState"
          value={datesState}
          onChange={(event) => setDatesState(event.target.value as InfoState)}
          className={inputClass}
        >
          {INFO_STATE_ORDER.map((value) => (
            <option key={value} value={value}>
              {INFO_STATE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <SourcePicker
        name="travelDatesSource"
        label="Source (travel dates)"
        sources={sources}
        required={false}
        value={sourceChoice}
        onChange={setSourceChoice}
      />
      <div className="space-y-1.5">
        <label htmlFor={fieldId("reason")} className={labelClass}>
          Reason for this change
        </label>
        <input id={fieldId("reason")} name="reason" required className={inputClass} />
      </div>
      {clientError && <FormError message={clientError} />}
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

function RevertScenarioTravelWindowForm({ scenario, onDone }: { scenario: Scenario; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(clearScenarioTravelWindow, initialFormActionState);
  const formId = useId();

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={scenario.id} />
      <input type="hidden" name="name" value={scenario.name} />
      {scenario.eventId && <input type="hidden" name="eventId" value={scenario.eventId} />}
      <p className="text-sm">
        Go back to the trip&apos;s own travel window? This scenario&apos;s own departure and return date will be
        cleared.
      </p>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for this change
        </label>
        <input id={`${formId}-reason`} name="reason" required className={inputClass} />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Reverting…" : "Revert"}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
