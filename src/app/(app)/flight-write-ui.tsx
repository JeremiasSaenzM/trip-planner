"use client";

import { useActionState, useEffect, useId, useState } from "react";

import type { FlightDirection, FlightOption, FlightSegment, Source } from "@/lib/data/types";
import { checkCanAcceptFlightRisk } from "@/lib/validation/flight-risk-decisions";

import type { FlightOptionEvaluation } from "./flight-evaluation";
import {
  createFlightOption,
  createFlightRiskDecision,
  createFlightSegment,
  deleteFlightOption,
  deleteFlightSegment,
  updateFlightOption,
} from "./flight-actions";
import { AcceptanceSafeguardBadge, ConstraintBadge } from "./flight-constraint-badge";
import { FLIGHT_BAGGAGE_LABELS, FLIGHT_OPTION_STATUS_LABELS } from "./flight-labels";
import { formatAmount, formatDate } from "./format";
import { initialFormActionState } from "./form-action-state";
import { buttonClass, FormError, inputClass, labelClass, secondaryButtonClass } from "./form-styles";
import { INFO_STATE_LABELS, INFO_STATE_ORDER } from "./info-state-labels";
import { REFUNDABILITY_LABELS } from "./payment-labels";
import { SourcePicker } from "./source-picker";

function InfoStateSelect({ id, defaultValue }: { id: string; defaultValue: string }) {
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

// "SJO → BOG → CDG" -- the readable segment chain for one direction,
// built from the segments themselves (never typed in separately), one
// per direction since a round trip's outbound and return routes aren't
// the same chain. Descriptive only: this reads the route, nothing here
// ranks it (CLAUDE.md -- flight duration, connection count, and routed
// airports are display-only facts).
function segmentChainText(segments: FlightSegment[], direction: FlightDirection): string {
  const ordered = segments.filter((segment) => segment.direction === direction).sort((a, b) => a.segmentOrder - b.segmentOrder);
  if (ordered.length === 0) return "No segments recorded yet";
  const airports = [ordered[0].fromAirport, ...ordered.map((segment) => segment.toAirport)];
  return airports.join(" → ");
}

// Entry forms for flight options and segments, per-option check/cost
// rendering, and a comparison table -- the UI half of Phase 6.5. The
// four checks always render in the same order (three hard constraints,
// then check 4 sharing their section but visually distinct, see
// flight-constraint-badge.tsx), cost second, descriptive route facts
// last under their own "descriptive only" heading -- that ordering is
// the substance the phase spec asked for, not a styling choice, so it's
// never reshuffled per option.
export function AddFlightOptionForm({ scenarioId, sources }: { scenarioId: string; sources: Source[] }) {
  const [state, formAction, pending] = useActionState(createFlightOption, initialFormActionState);
  const [sourceChoice, setSourceChoice] = useState("");

  // A successful submit leaves this form mounted (there's no "done" to
  // close back to, unlike the edit/delete forms below), so the source
  // picker's own "create a new source" choice has to reset itself here
  // -- during render, per React's state-adjustment pattern, not in an
  // effect, since the lint rule for that flags a direct setState call.
  const [previousState, setPreviousState] = useState(state);
  if (state !== previousState) {
    setPreviousState(state);
    if (state.status === "success" && sourceChoice !== "") setSourceChoice("");
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scenarioId" value={scenarioId} />

      <div className="space-y-1.5">
        <label htmlFor="flight-option-label" className={labelClass}>
          Label
        </label>
        <input id="flight-option-label" name="label" required placeholder="F-002" className={inputClass} />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="flight-option-fare" className={labelClass}>
            Fare
          </label>
          <input id="flight-option-fare" name="fare" type="number" step="0.01" min="0" required className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="flight-option-bag-fee" className={labelClass}>
            Bag fee (if paid add-on)
          </label>
          <input id="flight-option-bag-fee" name="bagFee" type="number" step="0.01" min="0" defaultValue="0" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="flight-option-mandatory-fees" className={labelClass}>
            Mandatory fees
          </label>
          <input
            id="flight-option-mandatory-fees"
            name="mandatoryFees"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="flight-option-currency" className={labelClass}>
          Currency
        </label>
        <input id="flight-option-currency" name="currency" required defaultValue="USD" placeholder="USD" className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="flight-option-baggage" className={labelClass}>
            Baggage allowance
          </label>
          <select id="flight-option-baggage" name="baggage" defaultValue="unknown" className={inputClass}>
            {Object.entries(FLIGHT_BAGGAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="flight-option-refundability" className={labelClass}>
            Refundability
          </label>
          <select id="flight-option-refundability" name="refundability" defaultValue="unknown" className={inputClass}>
            {Object.entries(REFUNDABILITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="separateTickets" className="h-4 w-4" />
          Separate tickets (not one single itinerary)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="competitionRelated" defaultChecked className="h-4 w-4" />
          Competition-related
        </label>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="flight-option-information-state" className={labelClass}>
          Information state
        </label>
        <InfoStateSelect id="flight-option-information-state" defaultValue="estimate" />
      </div>

      <SourcePicker name="source" sources={sources} required value={sourceChoice} onChange={setSourceChoice} />

      <div className="space-y-1.5">
        <label htmlFor="flight-option-observed-on" className={labelClass}>
          Fare observed on
        </label>
        <input id="flight-option-observed-on" name="observedOn" type="date" required className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="flight-option-notes" className={labelClass}>
          Notes (optional)
        </label>
        <input id="flight-option-notes" name="notes" className={inputClass} />
      </div>

      {state.status === "error" && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Adding…" : "Add flight option"}
      </button>
    </form>
  );
}

export function FlightOptionList({
  evaluations,
  sources,
  tripId,
  competitionId,
}: {
  evaluations: FlightOptionEvaluation[];
  sources: Source[];
  tripId: string;
  competitionId: string | null;
}) {
  if (evaluations.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No flight options recorded yet.</p>;
  }

  return (
    <div className="space-y-4" data-testid="flight-options-list">
      {evaluations.map((evaluation) => (
        <FlightOptionCard
          key={evaluation.option.id}
          evaluation={evaluation}
          sources={sources}
          tripId={tripId}
          competitionId={competitionId}
        />
      ))}
    </div>
  );
}

function FlightOptionCard({
  evaluation,
  sources,
  tripId,
  competitionId,
}: {
  evaluation: FlightOptionEvaluation;
  sources: Source[];
  tripId: string;
  competitionId: string | null;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [attempt, setAttempt] = useState(0);
  const { option } = evaluation;

  function startMode(next: "edit" | "delete") {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  const source = sources.find((candidate) => candidate.id === option.sourceId) ?? null;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" data-testid="flight-option-card">
      {/* Kept outside the mode switch, same reasoning as StayRow/MovementRow:
          e2e locates a card by this text through edit/delete too. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{option.label}</p>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {FLIGHT_OPTION_STATUS_LABELS[option.status]}
        </span>
      </div>

      {mode === "edit" ? (
        <EditFlightOptionForm key={attempt} option={option} sources={sources} onDone={() => setMode("view")} />
      ) : mode === "delete" ? (
        <DeleteFlightOptionForm key={attempt} option={option} onDone={() => setMode("view")} />
      ) : (
        <>
          {/* 1. Constraint results first -- three hard constraints, then
              check 4 sharing the section but never reading as a pass/fail
              of its own (flight-constraint-badge.tsx). */}
          <div className="mt-3 space-y-1.5 text-sm">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Hard constraints
            </p>
            <ConstraintRow label="No US/Canada stop" result={evaluation.usCanadaStop} />
            <ConstraintRow label="At the festival on time" result={evaluation.festivalArrivalDeparture} />
            <ConstraintRow label="Checked baggage allowed" result={evaluation.baggage} />
            <div className="flex items-start justify-between gap-2">
              <span>If bought now</span>
              <AcceptanceSafeguardBadge status={evaluation.acceptanceSafeguard.status} />
            </div>
            <p className="text-xs text-zinc-500 italic dark:text-zinc-400">
              The three above are hard constraints this option either meets or doesn&apos;t. &quot;If bought now&quot;
              states what buying it would mean, not a pass or fail of the option itself.
            </p>
            {[...evaluation.usCanadaStop.reasons, ...evaluation.festivalArrivalDeparture.reasons, ...evaluation.baggage.reasons, ...evaluation.acceptanceSafeguard.reasons].length > 0 && (
              <ReasonsList
                reasons={[
                  ...evaluation.usCanadaStop.reasons,
                  ...evaluation.festivalArrivalDeparture.reasons,
                  ...evaluation.baggage.reasons,
                  ...evaluation.acceptanceSafeguard.reasons,
                ]}
              />
            )}
            {evaluation.acceptanceSafeguard.status === "unknown" && (
              <AcceptRiskSection option={option} tripId={tripId} competitionId={competitionId} />
            )}
          </div>

          {/* 2. Cost second. */}
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">Cost</p>
            <p>
              Effective Flight Cost: {formatAmount(evaluation.effectiveFlightCost.amount, evaluation.effectiveFlightCost.currency)}
              {!evaluation.effectiveFlightCost.complete && (
                <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">(baggage allowance unknown)</span>
              )}
            </p>
            <p>
              Total Itinerary Cost: {formatAmount(evaluation.totalItineraryCost.amountUsd, "USD")}
              {!evaluation.totalItineraryCost.complete && (
                <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">(incomplete -- see missing links/rates)</span>
              )}
            </p>
          </div>

          {/* 3. Descriptive attributes last, visibly marked as such --
              never a sort/rank key (see e2e/journey.spec.ts's own check). */}
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Route (descriptive only — never used to rank options)
            </p>
            <p>Outbound: {segmentChainText(evaluation.segments, "outbound")}</p>
            <p>Return: {segmentChainText(evaluation.segments, "return")}</p>
          </div>

          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            {source ? (
              <>
                {source.provider} · Tier {source.tier} · observed {formatDate(option.observedOn)} ·{" "}
                {INFO_STATE_LABELS[option.informationState]}
              </>
            ) : (
              <>No source on this option · {INFO_STATE_LABELS[option.informationState]}</>
            )}
          </p>
          {option.notes && <p className="mt-1 text-sm whitespace-pre-line">{option.notes}</p>}

          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={() => startMode("edit")} className="text-zinc-600 underline dark:text-zinc-400">
              Edit
            </button>
            <button type="button" onClick={() => startMode("delete")} className="text-red-600 underline dark:text-red-400">
              Delete
            </button>
          </div>

          <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <FlightSegmentSection option={option} segments={evaluation.segments} />
          </div>
        </>
      )}
    </div>
  );
}

function ConstraintRow({ label, result }: { label: string; result: { status: "pass" | "fail" | "unknown" } }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span>{label}</span>
      <ConstraintBadge status={result.status} />
    </div>
  );
}

function ReasonsList({ reasons }: { reasons: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-500 dark:text-zinc-400">
      {reasons.map((reason, index) => (
        <li key={index}>{reason}</li>
      ))}
    </ul>
  );
}

function AcceptRiskSection({
  option,
  tripId,
  competitionId,
}: {
  option: FlightOption;
  tripId: string;
  competitionId: string | null;
}) {
  const canAccept = checkCanAcceptFlightRisk(competitionId);
  const [open, setOpen] = useState(false);

  if (!canAccept.ok) {
    return <p className="text-xs text-zinc-500 italic dark:text-zinc-400">{canAccept.message}</p>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-zinc-600 underline dark:text-zinc-400">
        Accept this risk
      </button>
    );
  }
  return (
    <AcceptFlightRiskForm option={option} tripId={tripId} competitionId={competitionId as string} onDone={() => setOpen(false)} />
  );
}

function AcceptFlightRiskForm({
  option,
  tripId,
  competitionId,
  onDone,
}: {
  option: FlightOption;
  tripId: string;
  competitionId: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(createFlightRiskDecision, initialFormActionState);
  const formId = useId();

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-2.5 rounded-lg border border-amber-300 p-2.5 dark:border-amber-800">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="competitionId" value={competitionId} />
      <input type="hidden" name="flightOptionId" value={option.id} />
      <input type="hidden" name="optionLabel" value={option.label} />
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-rationale`} className={labelClass}>
          Why you&apos;re accepting this risk
        </label>
        <input id={`${formId}-rationale`} name="rationale" required className={inputClass} />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Accept the risk"}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditFlightOptionForm({
  option,
  sources,
  onDone,
}: {
  option: FlightOption;
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateFlightOption, initialFormActionState);
  const formId = useId();
  const [sourceChoice, setSourceChoice] = useState(option.sourceId);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={option.id} />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-label`} className={labelClass}>
          New label
        </label>
        <input id={`${formId}-label`} name="label" required defaultValue={option.label} className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-status`} className={labelClass}>
          New status
        </label>
        <select id={`${formId}-status`} name="status" defaultValue={option.status} className={inputClass}>
          {Object.entries(FLIGHT_OPTION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-fare`} className={labelClass}>
            New fare
          </label>
          <input
            id={`${formId}-fare`}
            name="fare"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={option.fare}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-bagFee`} className={labelClass}>
            New bag fee
          </label>
          <input
            id={`${formId}-bagFee`}
            name="bagFee"
            type="number"
            step="0.01"
            min="0"
            defaultValue={option.bagFee}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-mandatoryFees`} className={labelClass}>
            New mandatory fees
          </label>
          <input
            id={`${formId}-mandatoryFees`}
            name="mandatoryFees"
            type="number"
            step="0.01"
            min="0"
            defaultValue={option.mandatoryFees}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-currency`} className={labelClass}>
          New currency
        </label>
        <input id={`${formId}-currency`} name="currency" required defaultValue={option.currency} className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-baggage`} className={labelClass}>
            New baggage allowance
          </label>
          <select id={`${formId}-baggage`} name="baggage" defaultValue={option.baggage} className={inputClass}>
            {Object.entries(FLIGHT_BAGGAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-refundability`} className={labelClass}>
            New refundability
          </label>
          <select id={`${formId}-refundability`} name="refundability" defaultValue={option.refundability} className={inputClass}>
            {Object.entries(REFUNDABILITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="separateTickets" defaultChecked={option.separateTickets} className="h-4 w-4" />
          Separate tickets
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="competitionRelated" defaultChecked={option.competitionRelated} className="h-4 w-4" />
          Competition-related
        </label>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-bookingReference`} className={labelClass}>
          New booking reference
        </label>
        <input
          id={`${formId}-bookingReference`}
          name="bookingReference"
          defaultValue={option.bookingReference ?? ""}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-informationState`} className={labelClass}>
          New information state
        </label>
        <InfoStateSelect id={`${formId}-informationState`} defaultValue={option.informationState} />
      </div>

      <SourcePicker name="source" sources={sources} required value={sourceChoice} onChange={setSourceChoice} />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-observedOn`} className={labelClass}>
          New fare observed on
        </label>
        <input
          id={`${formId}-observedOn`}
          name="observedOn"
          type="date"
          required
          defaultValue={option.observedOn}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-notes`} className={labelClass}>
          New notes
        </label>
        <input id={`${formId}-notes`} name="notes" defaultValue={option.notes ?? ""} className={inputClass} />
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

function DeleteFlightOptionForm({ option, onDone }: { option: FlightOption; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(deleteFlightOption, initialFormActionState);
  const formId = useId();

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={option.id} />
      <p className="text-sm">Delete the flight option &quot;{option.label}&quot;, and every segment of it?</p>
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

// Segments

function FlightSegmentSection({ option, segments }: { option: FlightOption; segments: FlightSegment[] }) {
  const [adding, setAdding] = useState(false);
  const sorted = [...segments].sort((a, b) => a.direction.localeCompare(b.direction) || a.segmentOrder - b.segmentOrder);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">Segments</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No segments recorded yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm" data-testid="flight-segments-list">
          {sorted.map((segment) => (
            <FlightSegmentRow key={segment.id} segment={segment} />
          ))}
        </ul>
      )}
      {adding ? (
        <AddFlightSegmentForm flightOptionId={option.id} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Add a segment
        </button>
      )}
    </div>
  );
}

function FlightSegmentRow({ segment }: { segment: FlightSegment }) {
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <li className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
      <p>
        #{segment.segmentOrder} ({segment.direction}): {segment.fromAirport} → {segment.toAirport}
        {segment.flightNumber ? ` · ${segment.flightNumber}` : ""}
        {segment.isTechnicalStop ? " · technical stop" : ""}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {segment.fromCountry} → {segment.toCountry} · departs {segment.departAt} · arrives {segment.arriveAt}
      </p>
      {deleting ? (
        <DeleteFlightSegmentForm key={attempt} segment={segment} onDone={() => setDeleting(false)} />
      ) : (
        <button
          type="button"
          onClick={() => {
            setAttempt((value) => value + 1);
            setDeleting(true);
          }}
          className="mt-1 text-xs text-red-600 underline dark:text-red-400"
        >
          Delete
        </button>
      )}
    </li>
  );
}

function AddFlightSegmentForm({ flightOptionId, onDone }: { flightOptionId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(createFlightSegment, initialFormActionState);
  const formId = useId();

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-2.5 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
      <input type="hidden" name="flightOptionId" value={flightOptionId} />

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-direction`} className={labelClass}>
            Direction
          </label>
          <select id={`${formId}-direction`} name="direction" defaultValue="outbound" className={inputClass}>
            <option value="outbound">Outbound</option>
            <option value="return">Return</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-segmentOrder`} className={labelClass}>
            Order within this direction
          </label>
          <input id={`${formId}-segmentOrder`} name="segmentOrder" type="number" min="1" step="1" required className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-fromAirport`} className={labelClass}>
            From airport
          </label>
          <input id={`${formId}-fromAirport`} name="fromAirport" required placeholder="SJO" maxLength={3} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-toAirport`} className={labelClass}>
            To airport
          </label>
          <input id={`${formId}-toAirport`} name="toAirport" required placeholder="BOG" maxLength={3} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-fromCountry`} className={labelClass}>
            From country
          </label>
          <input id={`${formId}-fromCountry`} name="fromCountry" required placeholder="CR" maxLength={2} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-toCountry`} className={labelClass}>
            To country
          </label>
          <input id={`${formId}-toCountry`} name="toCountry" required placeholder="CO" maxLength={2} className={inputClass} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-flightNumber`} className={labelClass}>
          Flight number (optional)
        </label>
        <input id={`${formId}-flightNumber`} name="flightNumber" placeholder="AV123" className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-departAt`} className={labelClass}>
          Departs at (ISO instant, with time zone offset)
        </label>
        <input
          id={`${formId}-departAt`}
          name="departAt"
          required
          placeholder="2027-07-01T08:00:00-06:00"
          className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-arriveAt`} className={labelClass}>
          Arrives at (ISO instant, with time zone offset)
        </label>
        <input
          id={`${formId}-arriveAt`}
          name="arriveAt"
          required
          placeholder="2027-07-01T14:00:00-05:00"
          className={inputClass}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isTechnicalStop" className="h-4 w-4" />
        Technical/refuelling stop (no onward boarding)
      </label>

      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Adding…" : "Add segment"}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteFlightSegmentForm({ segment, onDone }: { segment: FlightSegment; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(deleteFlightSegment, initialFormActionState);
  const formId = useId();

  return (
    <form action={formAction} className="mt-1 space-y-2">
      <input type="hidden" name="id" value={segment.id} />
      <div className="space-y-1">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for deleting this segment
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

// Comparison: every option at the same level of detail, in one table.
// Deliberately no sortable column headers and no "sort by" control --
// see e2e/journey.spec.ts's own assertion that one never gets added
// here by accident.
export function FlightOptionComparisonTable({ evaluations }: { evaluations: FlightOptionEvaluation[] }) {
  if (evaluations.length < 2) return null;

  return (
    <div className="overflow-x-auto" data-testid="flight-comparison-table">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-1.5 pr-3 font-medium">Option</th>
            <th className="py-1.5 pr-3 font-medium">No US/Canada stop</th>
            <th className="py-1.5 pr-3 font-medium">At the festival on time</th>
            <th className="py-1.5 pr-3 font-medium">Baggage</th>
            <th className="py-1.5 pr-3 font-medium">If bought now</th>
            <th className="py-1.5 pr-3 font-medium">Effective Flight Cost</th>
            <th className="py-1.5 pr-3 font-medium">Total Itinerary Cost</th>
            <th className="py-1.5 pr-3 font-medium">Route (descriptive only)</th>
          </tr>
        </thead>
        <tbody>
          {evaluations.map((evaluation) => (
            <tr key={evaluation.option.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
              <td className="py-1.5 pr-3">
                {evaluation.option.label}
                <br />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {FLIGHT_OPTION_STATUS_LABELS[evaluation.option.status]}
                </span>
              </td>
              <td className="py-1.5 pr-3">
                <ConstraintBadge status={evaluation.usCanadaStop.status} />
              </td>
              <td className="py-1.5 pr-3">
                <ConstraintBadge status={evaluation.festivalArrivalDeparture.status} />
              </td>
              <td className="py-1.5 pr-3">
                <ConstraintBadge status={evaluation.baggage.status} />
              </td>
              <td className="py-1.5 pr-3">
                <AcceptanceSafeguardBadge status={evaluation.acceptanceSafeguard.status} />
              </td>
              <td className="py-1.5 pr-3">
                {formatAmount(evaluation.effectiveFlightCost.amount, evaluation.effectiveFlightCost.currency)}
              </td>
              <td className="py-1.5 pr-3">{formatAmount(evaluation.totalItineraryCost.amountUsd, "USD")}</td>
              <td className="py-1.5 pr-3 text-xs text-zinc-600 dark:text-zinc-400">
                {segmentChainText(evaluation.segments, "outbound")}
                <br />
                {segmentChainText(evaluation.segments, "return")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
