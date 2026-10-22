"use client";

import { useActionState, useEffect, useId, useState } from "react";

import type { BudgetLine, Movement, Source, Stay } from "@/lib/data/types";
import type { InfoState } from "@/lib/domain/types";

import { formatAmount, formatDate } from "./format";
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
import { MOVEMENT_MODE_LABELS, MOVEMENT_MODE_ORDER, STAY_KIND_LABELS, STAY_KIND_ORDER } from "./itinerary-labels";
import { SourcePicker } from "./source-picker";

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
  sources,
}: {
  scenarioId: string;
  budgetLines: BudgetLine[];
  sources: Source[];
}) {
  const [state, formAction, pending] = useActionState(createStay, initialFormActionState);
  const [sourceChoice, setSourceChoice] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scenarioId" value={scenarioId} />

      <div className="space-y-1.5">
        <label htmlFor="stay-location" className={labelClass}>
          Location
        </label>
        <input id="stay-location" name="location" required className={inputClass} />
      </div>

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
  sources,
}: {
  stays: Stay[];
  budgetLines: BudgetLine[];
  sources: Source[];
}) {
  if (stays.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No stays recorded yet.</p>;
  }

  const sorted = [...stays].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="space-y-2" data-testid="stays-list">
      {sorted.map((stay) => (
        <StayRow key={stay.id} stay={stay} budgetLines={budgetLines} sources={sources} />
      ))}
    </div>
  );
}

function StayRow({ stay, budgetLines, sources }: { stay: Stay; budgetLines: BudgetLine[]; sources: Source[] }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [attempt, setAttempt] = useState(0);

  function startMode(next: "edit" | "delete") {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  const budgetLine = stay.budgetLineId ? budgetLines.find((line) => line.id === stay.budgetLineId) : null;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      {/* Kept outside the mode switch below, so a row stays identifiable
          by location through edit/delete too -- e2e locates a row by
          this text, which a swapped-in form wouldn't otherwise show. */}
      <p className="font-medium">
        {stay.location} — {STAY_KIND_LABELS[stay.kind]}
      </p>
      {mode === "edit" ? (
        <EditStayForm key={attempt} stay={stay} budgetLines={budgetLines} sources={sources} onDone={() => setMode("view")} />
      ) : mode === "delete" ? (
        <DeleteStayForm key={attempt} stay={stay} onDone={() => setMode("view")} />
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatDate(stay.startDate)}, {stay.nights} night{stay.nights === 1 ? "" : "s"} ·{" "}
            {INFO_STATE_LABELS[stay.informationState]}
            {budgetLine ? ` · ${budgetLine.description}` : " · No budget line yet"}
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
  sources,
  onDone,
}: {
  stay: Stay;
  budgetLines: BudgetLine[];
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateStay, initialFormActionState);
  const formId = useId();
  const [sourceChoice, setSourceChoice] = useState(stay.sourceId ?? "");

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={stay.id} />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-location`} className={labelClass}>
          New location
        </label>
        <input id={`${formId}-location`} name="location" required defaultValue={stay.location} className={inputClass} />
      </div>

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

function DeleteStayForm({ stay, onDone }: { stay: Stay; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(deleteStay, initialFormActionState);
  const formId = useId();

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={stay.id} />
      <p className="text-sm">Delete the stay in {stay.location}?</p>
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
  sources,
}: {
  scenarioId: string;
  budgetLines: BudgetLine[];
  sources: Source[];
}) {
  const [state, formAction, pending] = useActionState(createMovement, initialFormActionState);
  const [sourceChoice, setSourceChoice] = useState("");

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
        <div className="space-y-1.5">
          <label htmlFor="movement-from" className={labelClass}>
            From
          </label>
          <input id="movement-from" name="fromLocation" required className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="movement-to" className={labelClass}>
            To
          </label>
          <input id="movement-to" name="toLocation" required className={inputClass} />
        </div>
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
  sources,
}: {
  movements: Movement[];
  budgetLines: BudgetLine[];
  sources: Source[];
}) {
  if (movements.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No movements recorded yet.</p>;
  }

  const sorted = [...movements].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="space-y-2" data-testid="movements-list">
      {sorted.map((movement) => (
        <MovementRow key={movement.id} movement={movement} budgetLines={budgetLines} sources={sources} />
      ))}
    </div>
  );
}

function MovementRow({
  movement,
  budgetLines,
  sources,
}: {
  movement: Movement;
  budgetLines: BudgetLine[];
  sources: Source[];
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [attempt, setAttempt] = useState(0);

  function startMode(next: "edit" | "delete") {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  const budgetLine = movement.budgetLineId ? budgetLines.find((line) => line.id === movement.budgetLineId) : null;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      {/* Kept outside the mode switch below, so a row stays identifiable
          by its route through edit/delete too -- e2e locates a row by
          this text, which a swapped-in form wouldn't otherwise show. */}
      <p className="font-medium">
        {movement.sequence}. {movement.fromLocation} → {movement.toLocation} ({MOVEMENT_MODE_LABELS[movement.mode]})
      </p>
      {mode === "edit" ? (
        <EditMovementForm
          key={attempt}
          movement={movement}
          budgetLines={budgetLines}
          sources={sources}
          onDone={() => setMode("view")}
        />
      ) : mode === "delete" ? (
        <DeleteMovementForm key={attempt} movement={movement} onDone={() => setMode("view")} />
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatDate(movement.departDate)} → {formatDate(movement.arriveDate)} ·{" "}
            {INFO_STATE_LABELS[movement.informationState]}
            {budgetLine ? ` · ${budgetLine.description}` : " · No budget line yet"}
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
  sources,
  onDone,
}: {
  movement: Movement;
  budgetLines: BudgetLine[];
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateMovement, initialFormActionState);
  const formId = useId();
  const [sourceChoice, setSourceChoice] = useState(movement.sourceId ?? "");

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
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-from`} className={labelClass}>
            New from
          </label>
          <input
            id={`${formId}-from`}
            name="fromLocation"
            required
            defaultValue={movement.fromLocation}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-to`} className={labelClass}>
            New to
          </label>
          <input id={`${formId}-to`} name="toLocation" required defaultValue={movement.toLocation} className={inputClass} />
        </div>
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

function DeleteMovementForm({ movement, onDone }: { movement: Movement; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(deleteMovement, initialFormActionState);
  const formId = useId();

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={movement.id} />
      <p className="text-sm">
        Delete the movement {movement.fromLocation} → {movement.toLocation}?
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
