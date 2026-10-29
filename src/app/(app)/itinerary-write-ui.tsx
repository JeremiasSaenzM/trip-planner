"use client";

import { useActionState, useEffect, useId, useState } from "react";

import type { BudgetLine, FlightOption, Location, Movement, Source, Stay } from "@/lib/data/types";
import type { InfoState } from "@/lib/domain/types";

import { formatAmount, formatDate, formatUnitAmount } from "./format";
import { buttonClass, FormError, inputClass, labelClass, secondaryButtonClass } from "./form-styles";
import { initialFormActionState } from "./form-action-state";
import { INFO_STATE_LABELS, INFO_STATE_ORDER } from "./info-state-labels";
import {
  createMovement,
  createStay,
  deleteMovement,
  deleteStay,
  updateMovement,
  updateStay,
} from "./itinerary-actions";
import { FLIGHT_OPTION_STATUS_LABELS } from "./flight-labels";
import { updateLocation } from "./location-actions";
import { MOVEMENT_MODE_LABELS, MOVEMENT_MODE_ORDER, STAY_KIND_LABELS, STAY_KIND_ORDER } from "./itinerary-labels";
import { QUANTITY_UNIT_LABELS } from "./quantity-unit-labels";
import { SourcePicker } from "./source-picker";

// Shown next to a linked budget line's description wherever a stay or
// movement row references one (StayRow, MovementRow below) -- the unit
// amount, computed from amount / quantity, never stored.
function budgetLineLabel(budgetLine: BudgetLine | null | undefined): string {
  if (!budgetLine) return " · No budget line yet";
  const unitAmount =
    budgetLine.quantity !== null && budgetLine.quantityUnit !== null
      ? ` (${formatUnitAmount(budgetLine.amountTarget, budgetLine.currency, budgetLine.quantity, QUANTITY_UNIT_LABELS[budgetLine.quantityUnit])})`
      : "";
  return ` · ${budgetLine.description}${unitAmount}`;
}

// Shared by every stay/movement form -- a budget line reference is
// always optional here (findMovementsMissingBudgetLine's own soft
// warning is what flags an unpriced leg, not a required field), so
// there's no "create a new one inline" branch the way payments have.
function BudgetLinePicker({
  id,
  defaultValue,
  budgetLines,
}: {
  id: string;
  defaultValue: string;
  budgetLines: BudgetLine[];
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        Budget line (optional)
      </label>
      <select id={id} name="budgetLineId" defaultValue={defaultValue} className={inputClass}>
        <option value="">No budget line yet</option>
        {budgetLines.map((line) => (
          <option key={line.id} value={line.id}>
            {line.description} ({line.category}) — {formatAmount(line.amountTarget, line.currency)}
          </option>
        ))}
      </select>
    </div>
  );
}

// Mirrors BudgetLinePicker exactly: a flight option link is optional
// (findMovementsMissingBudgetLine has no flight-option equivalent --
// nothing flags an unlinked leg), and it's how a stay or movement
// becomes the "festival-stay location" / "flight's own movement" the
// Flight options section's checks walk the movement chain from (see
// src/app/(app)/flight-evaluation.ts).
function FlightOptionPicker({
  id,
  defaultValue,
  flightOptions,
}: {
  id: string;
  defaultValue: string;
  flightOptions: FlightOption[];
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        Flight option (optional)
      </label>
      <select id={id} name="flightOptionId" defaultValue={defaultValue} className={inputClass}>
        <option value="">Not linked to a flight option</option>
        {flightOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} ({FLIGHT_OPTION_STATUS_LABELS[option.status]})
          </option>
        ))}
      </select>
    </div>
  );
}

// A stay's location, or a movement's from/to location -- always
// required, unlike SourcePicker/FlightOptionPicker, since every one of
// these fields has to resolve to a real locations row (locations table,
// 20261029090000). Same "pick existing, or add one inline" shape as
// SourcePicker: submits "${name}Choice" (an existing location's id, or
// the sentinel "__new__") plus "${name}New*" fields for the new-location
// sub-form -- resolveLocationId() in location-actions.ts reads exactly
// these names back off the FormData.
function LocationPicker({
  name,
  label,
  locations,
  value,
  onChange,
}: {
  name: string;
  label: string;
  locations: Location[];
  value: string;
  onChange: (value: string) => void;
}) {
  const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name));
  const domId = useId();
  // Same reasoning as SourcePicker's mustCreate: a required picker with
  // no locations to pick from has exactly one path, so it starts there
  // rather than on an empty, unselectable placeholder.
  const mustCreate = sorted.length === 0;
  const selected = mustCreate ? "__new__" : value;

  const nameId = `${domId}-name`;
  const fieldId = (field: string) => `${domId}-${field}`;
  const labelledBy = (...fields: string[]) => [nameId, ...fields.map((field) => `${fieldId(field)}-label`)].join(" ");

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <label htmlFor={domId} className={labelClass}>
        <span id={nameId}>{label}</span>
      </label>
      <select
        id={domId}
        name={`${name}Choice`}
        value={selected}
        onChange={(event) => onChange(event.target.value)}
        required
        className={inputClass}
      >
        <option value="" disabled>
          Choose a location
        </option>
        {sorted.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
            {location.timezone ? "" : " (no time zone yet)"}
          </option>
        ))}
        <option value="__new__">Add a new location…</option>
      </select>

      {selected === "__new__" && (
        <div className="space-y-2.5 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
          <div className="space-y-1.5">
            <label id={`${fieldId("name")}-label`} htmlFor={fieldId("name")} className={labelClass}>
              Name
            </label>
            <input
              id={fieldId("name")}
              name={`${name}NewName`}
              required
              aria-labelledby={labelledBy("name")}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label id={`${fieldId("timezone")}-label`} htmlFor={fieldId("timezone")} className={labelClass}>
              Time zone (optional, e.g. Europe/Paris)
            </label>
            <input
              id={fieldId("timezone")}
              name={`${name}NewTimezone`}
              placeholder="Europe/Paris"
              aria-labelledby={labelledBy("timezone")}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label id={`${fieldId("notes")}-label`} htmlFor={fieldId("notes")} className={labelClass}>
              Notes (optional)
            </label>
            <input
              id={fieldId("notes")}
              name={`${name}NewNotes`}
              aria-labelledby={labelledBy("notes")}
              className={inputClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function InfoStateSelect({ id, defaultValue }: { id: string; defaultValue: InfoState }) {
  return (
    <select id={id} name="informationState" defaultValue={defaultValue} className={inputClass}>
      {INFO_STATE_ORDER.map((value) => (
        <option key={value} value={value}>
          {INFO_STATE_LABELS[value]}
        </option>
      ))}
    </select>
  );
}

// Stays

export function AddStayForm({
  scenarioId,
  budgetLines,
  flightOptions,
  sources,
  locations,
}: {
  scenarioId: string;
  budgetLines: BudgetLine[];
  flightOptions: FlightOption[];
  sources: Source[];
  locations: Location[];
}) {
  const [state, formAction, pending] = useActionState(createStay, initialFormActionState);
  const [sourceChoice, setSourceChoice] = useState("");
  const [locationChoice, setLocationChoice] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scenarioId" value={scenarioId} />

      <LocationPicker name="location" label="Location" locations={locations} value={locationChoice} onChange={setLocationChoice} />

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="stay-start-date" className={labelClass}>
            First night
          </label>
          <input id="stay-start-date" name="startDate" type="date" required className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="stay-nights" className={labelClass}>
            Nights
          </label>
          <input id="stay-nights" name="nights" type="number" min="1" step="1" required className={inputClass} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="stay-kind" className={labelClass}>
          Kind
        </label>
        <select id="stay-kind" name="kind" defaultValue="independent" className={inputClass}>
          {STAY_KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {STAY_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>

      <BudgetLinePicker id="stay-budget-line" defaultValue="" budgetLines={budgetLines} />
      <FlightOptionPicker id="stay-flight-option" defaultValue="" flightOptions={flightOptions} />

      <div className="space-y-1.5">
        <label htmlFor="stay-information-state" className={labelClass}>
          Information state
        </label>
        <InfoStateSelect id="stay-information-state" defaultValue="estimate" />
      </div>

      <SourcePicker name="source" sources={sources} required={false} value={sourceChoice} onChange={setSourceChoice} />

      <div className="space-y-1.5">
        <label htmlFor="stay-notes" className={labelClass}>
          Notes (optional)
        </label>
        <input id="stay-notes" name="notes" className={inputClass} />
      </div>

      {state.status === "error" && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Adding…" : "Add stay"}
      </button>
    </form>
  );
}

export function StayList({
  stays,
  budgetLines,
  flightOptions,
  sources,
  locations,
}: {
  stays: Stay[];
  budgetLines: BudgetLine[];
  flightOptions: FlightOption[];
  sources: Source[];
  locations: Location[];
}) {
  if (stays.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No stays recorded yet.</p>;
  }

  const sorted = [...stays].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="space-y-2" data-testid="stays-list">
      {sorted.map((stay) => (
        <StayRow
          key={stay.id}
          stay={stay}
          budgetLines={budgetLines}
          flightOptions={flightOptions}
          sources={sources}
          locations={locations}
        />
      ))}
    </div>
  );
}

function StayRow({
  stay,
  budgetLines,
  flightOptions,
  sources,
  locations,
}: {
  stay: Stay;
  budgetLines: BudgetLine[];
  flightOptions: FlightOption[];
  sources: Source[];
  locations: Location[];
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [attempt, setAttempt] = useState(0);

  function startMode(next: "edit" | "delete") {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  const budgetLine = stay.budgetLineId ? budgetLines.find((line) => line.id === stay.budgetLineId) : null;
  const locationName = locations.find((l) => l.id === stay.locationId)?.name ?? stay.locationId;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      {/* Kept outside the mode switch below, so a row stays identifiable
          by location through edit/delete too -- e2e locates a row by
          this text, which a swapped-in form wouldn't otherwise show. */}
      <p className="font-medium">
        {locationName} — {STAY_KIND_LABELS[stay.kind]}
      </p>
      {mode === "edit" ? (
        <EditStayForm
          key={attempt}
          stay={stay}
          budgetLines={budgetLines}
          flightOptions={flightOptions}
          sources={sources}
          locations={locations}
          onDone={() => setMode("view")}
        />
      ) : mode === "delete" ? (
        <DeleteStayForm key={attempt} stay={stay} locationName={locationName} onDone={() => setMode("view")} />
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatDate(stay.startDate)}, {stay.nights} night{stay.nights === 1 ? "" : "s"} ·{" "}
            {INFO_STATE_LABELS[stay.informationState]}
            {budgetLineLabel(budgetLine)}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={() => startMode("edit")} className="text-zinc-600 underline dark:text-zinc-400">
              Edit
            </button>
            <button type="button" onClick={() => startMode("delete")} className="text-red-600 underline dark:text-red-400">
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EditStayForm({
  stay,
  budgetLines,
  flightOptions,
  sources,
  locations,
  onDone,
}: {
  stay: Stay;
  budgetLines: BudgetLine[];
  flightOptions: FlightOption[];
  sources: Source[];
  locations: Location[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateStay, initialFormActionState);
  const formId = useId();
  const [sourceChoice, setSourceChoice] = useState(stay.sourceId ?? "");
  const [locationChoice, setLocationChoice] = useState(stay.locationId);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={stay.id} />

      <LocationPicker
        name="location"
        label="New location"
        locations={locations}
        value={locationChoice}
        onChange={setLocationChoice}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-startDate`} className={labelClass}>
            New first night
          </label>
          <input
            id={`${formId}-startDate`}
            name="startDate"
            type="date"
            required
            defaultValue={stay.startDate}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-nights`} className={labelClass}>
            New nights
          </label>
          <input
            id={`${formId}-nights`}
            name="nights"
            type="number"
            min="1"
            step="1"
            required
            defaultValue={stay.nights}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-kind`} className={labelClass}>
          New kind
        </label>
        <select id={`${formId}-kind`} name="kind" defaultValue={stay.kind} className={inputClass}>
          {STAY_KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {STAY_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>

      <BudgetLinePicker id={`${formId}-budgetLine`} defaultValue={stay.budgetLineId ?? ""} budgetLines={budgetLines} />
      <FlightOptionPicker id={`${formId}-flightOption`} defaultValue={stay.flightOptionId ?? ""} flightOptions={flightOptions} />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-informationState`} className={labelClass}>
          New information state
        </label>
        <InfoStateSelect id={`${formId}-informationState`} defaultValue={stay.informationState} />
      </div>

      <SourcePicker name="source" sources={sources} required={false} value={sourceChoice} onChange={setSourceChoice} />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-notes`} className={labelClass}>
          New notes
        </label>
        <input id={`${formId}-notes`} name="notes" defaultValue={stay.notes ?? ""} className={inputClass} />
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

function DeleteStayForm({
  stay,
  locationName,
  onDone,
}: {
  stay: Stay;
  locationName: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(deleteStay, initialFormActionState);
  const formId = useId();

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={stay.id} />
      <p className="text-sm">Delete the stay in {locationName}?</p>
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

// Movements

export function AddMovementForm({
  scenarioId,
  budgetLines,
  flightOptions,
  sources,
  locations,
}: {
  scenarioId: string;
  budgetLines: BudgetLine[];
  flightOptions: FlightOption[];
  sources: Source[];
  locations: Location[];
}) {
  const [state, formAction, pending] = useActionState(createMovement, initialFormActionState);
  const [sourceChoice, setSourceChoice] = useState("");
  const [fromLocationChoice, setFromLocationChoice] = useState("");
  const [toLocationChoice, setToLocationChoice] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scenarioId" value={scenarioId} />

      <div className="space-y-1.5">
        <label htmlFor="movement-sequence" className={labelClass}>
          Order in the chain
        </label>
        <input id="movement-sequence" name="sequence" type="number" step="1" required className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <LocationPicker
          name="fromLocation"
          label="From"
          locations={locations}
          value={fromLocationChoice}
          onChange={setFromLocationChoice}
        />
        <LocationPicker
          name="toLocation"
          label="To"
          locations={locations}
          value={toLocationChoice}
          onChange={setToLocationChoice}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="movement-depart-date" className={labelClass}>
            Departs
          </label>
          <input id="movement-depart-date" name="departDate" type="date" required className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="movement-depart-time" className={labelClass}>
            Departure time (optional)
          </label>
          <input id="movement-depart-time" name="departTime" type="time" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="movement-arrive-date" className={labelClass}>
            Arrives
          </label>
          <input id="movement-arrive-date" name="arriveDate" type="date" required className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="movement-arrive-time" className={labelClass}>
            Arrival time (optional)
          </label>
          <input id="movement-arrive-time" name="arriveTime" type="time" className={inputClass} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="movement-mode" className={labelClass}>
          Mode
        </label>
        <select id="movement-mode" name="mode" defaultValue="plane" className={inputClass}>
          {MOVEMENT_MODE_ORDER.map((mode) => (
            <option key={mode} value={mode}>
              {MOVEMENT_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      <BudgetLinePicker id="movement-budget-line" defaultValue="" budgetLines={budgetLines} />
      <FlightOptionPicker id="movement-flight-option" defaultValue="" flightOptions={flightOptions} />

      <div className="space-y-1.5">
        <label htmlFor="movement-booking-reference" className={labelClass}>
          Booking reference (optional)
        </label>
        <input id="movement-booking-reference" name="bookingReference" className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="movement-information-state" className={labelClass}>
          Information state
        </label>
        <InfoStateSelect id="movement-information-state" defaultValue="estimate" />
      </div>

      <SourcePicker name="source" sources={sources} required={false} value={sourceChoice} onChange={setSourceChoice} />

      <div className="space-y-1.5">
        <label htmlFor="movement-notes" className={labelClass}>
          Notes (optional)
        </label>
        <input id="movement-notes" name="notes" className={inputClass} />
      </div>

      {state.status === "error" && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Adding…" : "Add movement"}
      </button>
    </form>
  );
}

export function MovementList({
  movements,
  budgetLines,
  flightOptions,
  sources,
  locations,
}: {
  movements: Movement[];
  budgetLines: BudgetLine[];
  flightOptions: FlightOption[];
  sources: Source[];
  locations: Location[];
}) {
  if (movements.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No movements recorded yet.</p>;
  }

  const sorted = [...movements].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="space-y-2" data-testid="movements-list">
      {sorted.map((movement) => (
        <MovementRow
          key={movement.id}
          movement={movement}
          budgetLines={budgetLines}
          flightOptions={flightOptions}
          sources={sources}
          locations={locations}
        />
      ))}
    </div>
  );
}

function MovementRow({
  movement,
  budgetLines,
  flightOptions,
  sources,
  locations,
}: {
  movement: Movement;
  budgetLines: BudgetLine[];
  flightOptions: FlightOption[];
  sources: Source[];
  locations: Location[];
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [attempt, setAttempt] = useState(0);

  function startMode(next: "edit" | "delete") {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  const budgetLine = movement.budgetLineId ? budgetLines.find((line) => line.id === movement.budgetLineId) : null;
  const fromLocationName = locations.find((l) => l.id === movement.fromLocationId)?.name ?? movement.fromLocationId;
  const toLocationName = locations.find((l) => l.id === movement.toLocationId)?.name ?? movement.toLocationId;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      {/* Kept outside the mode switch below, so a row stays identifiable
          by its route through edit/delete too -- e2e locates a row by
          this text, which a swapped-in form wouldn't otherwise show. */}
      <p className="font-medium">
        {movement.sequence}. {fromLocationName} → {toLocationName} ({MOVEMENT_MODE_LABELS[movement.mode]})
      </p>
      {mode === "edit" ? (
        <EditMovementForm
          key={attempt}
          movement={movement}
          budgetLines={budgetLines}
          flightOptions={flightOptions}
          sources={sources}
          locations={locations}
          onDone={() => setMode("view")}
        />
      ) : mode === "delete" ? (
        <DeleteMovementForm
          key={attempt}
          movement={movement}
          fromLocationName={fromLocationName}
          toLocationName={toLocationName}
          onDone={() => setMode("view")}
        />
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatDate(movement.departDate)} → {formatDate(movement.arriveDate)} ·{" "}
            {INFO_STATE_LABELS[movement.informationState]}
            {budgetLineLabel(budgetLine)}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={() => startMode("edit")} className="text-zinc-600 underline dark:text-zinc-400">
              Edit
            </button>
            <button type="button" onClick={() => startMode("delete")} className="text-red-600 underline dark:text-red-400">
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EditMovementForm({
  movement,
  budgetLines,
  flightOptions,
  sources,
  locations,
  onDone,
}: {
  movement: Movement;
  budgetLines: BudgetLine[];
  flightOptions: FlightOption[];
  sources: Source[];
  locations: Location[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateMovement, initialFormActionState);
  const formId = useId();
  const [sourceChoice, setSourceChoice] = useState(movement.sourceId ?? "");
  const [fromLocationChoice, setFromLocationChoice] = useState(movement.fromLocationId);
  const [toLocationChoice, setToLocationChoice] = useState(movement.toLocationId);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={movement.id} />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-sequence`} className={labelClass}>
          New order in the chain
        </label>
        <input
          id={`${formId}-sequence`}
          name="sequence"
          type="number"
          step="1"
          required
          defaultValue={movement.sequence}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <LocationPicker
          name="fromLocation"
          label="New from"
          locations={locations}
          value={fromLocationChoice}
          onChange={setFromLocationChoice}
        />
        <LocationPicker
          name="toLocation"
          label="New to"
          locations={locations}
          value={toLocationChoice}
          onChange={setToLocationChoice}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-departDate`} className={labelClass}>
            New departure date
          </label>
          <input
            id={`${formId}-departDate`}
            name="departDate"
            type="date"
            required
            defaultValue={movement.departDate}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-departTime`} className={labelClass}>
            New departure time
          </label>
          <input
            id={`${formId}-departTime`}
            name="departTime"
            type="time"
            defaultValue={movement.departTime ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-arriveDate`} className={labelClass}>
            New arrival date
          </label>
          <input
            id={`${formId}-arriveDate`}
            name="arriveDate"
            type="date"
            required
            defaultValue={movement.arriveDate}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-arriveTime`} className={labelClass}>
            New arrival time
          </label>
          <input
            id={`${formId}-arriveTime`}
            name="arriveTime"
            type="time"
            defaultValue={movement.arriveTime ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-mode`} className={labelClass}>
          New mode
        </label>
        <select id={`${formId}-mode`} name="mode" defaultValue={movement.mode} className={inputClass}>
          {MOVEMENT_MODE_ORDER.map((mode) => (
            <option key={mode} value={mode}>
              {MOVEMENT_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      <BudgetLinePicker
        id={`${formId}-budgetLine`}
        defaultValue={movement.budgetLineId ?? ""}
        budgetLines={budgetLines}
      />
      <FlightOptionPicker
        id={`${formId}-flightOption`}
        defaultValue={movement.flightOptionId ?? ""}
        flightOptions={flightOptions}
      />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-bookingReference`} className={labelClass}>
          New booking reference
        </label>
        <input
          id={`${formId}-bookingReference`}
          name="bookingReference"
          defaultValue={movement.bookingReference ?? ""}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-informationState`} className={labelClass}>
          New information state
        </label>
        <InfoStateSelect id={`${formId}-informationState`} defaultValue={movement.informationState} />
      </div>

      <SourcePicker name="source" sources={sources} required={false} value={sourceChoice} onChange={setSourceChoice} />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-notes`} className={labelClass}>
          New notes
        </label>
        <input id={`${formId}-notes`} name="notes" defaultValue={movement.notes ?? ""} className={inputClass} />
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

function DeleteMovementForm({
  movement,
  fromLocationName,
  toLocationName,
  onDone,
}: {
  movement: Movement;
  fromLocationName: string;
  toLocationName: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(deleteMovement, initialFormActionState);
  const formId = useId();

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={movement.id} />
      <p className="text-sm">
        Delete the movement {fromLocationName} → {toLocationName}?
      </p>
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

// Locations
//
// Not "add a new location" -- that already exists inline inside
// LocationPicker above. This is the other half: editing one that
// already exists. "(no time zone yet)" (LocationPicker's <option> text)
// is the only place today that tells you a location needs a zone, and
// until now nothing on this page let you act on that without creating a
// duplicate. Same page, same section, so the fact and the fix sit
// together -- no delete here; removing a location isn't what was asked
// for, and delete_location's own referencing-row guard (20261029090100)
// isn't exercised by any form yet.
export function LocationList({ locations }: { locations: Location[] }) {
  if (locations.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No locations recorded yet.</p>;
  }

  const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-2" data-testid="locations-list">
      {sorted.map((location) => (
        <LocationRow key={location.id} location={location} />
      ))}
    </div>
  );
}

function LocationRow({ location }: { location: Location }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [attempt, setAttempt] = useState(0);

  function startEdit() {
    setAttempt((value) => value + 1);
    setMode("edit");
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" data-testid="location-row">
      {/* Kept outside the mode switch, same reasoning as StayRow -- a
          row stays identifiable by name through its own edit. */}
      <p className="font-medium">{location.name}</p>
      {mode === "edit" ? (
        <EditLocationForm key={attempt} location={location} onDone={() => setMode("view")} />
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {location.timezone ?? <span className="italic">No time zone recorded yet</span>}
            {location.notes ? ` · ${location.notes}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={startEdit} className="text-zinc-600 underline dark:text-zinc-400">
              Edit
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EditLocationForm({ location, onDone }: { location: Location; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(updateLocation, initialFormActionState);
  const formId = useId();

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={location.id} />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-name`} className={labelClass}>
          Name
        </label>
        <input id={`${formId}-name`} name="name" required defaultValue={location.name} className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-timezone`} className={labelClass}>
          Time zone (optional, e.g. Europe/Paris)
        </label>
        <input
          id={`${formId}-timezone`}
          name="timezone"
          placeholder="Europe/Paris"
          defaultValue={location.timezone ?? ""}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-notes`} className={labelClass}>
          Notes (optional)
        </label>
        <input id={`${formId}-notes`} name="notes" defaultValue={location.notes ?? ""} className={inputClass} />
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
