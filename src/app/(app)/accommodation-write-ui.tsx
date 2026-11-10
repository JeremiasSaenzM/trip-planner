"use client";

import { useActionState, useEffect, useId, useState } from "react";

import type { AccommodationOption, Source } from "@/lib/data/types";
import { observationAgeDays, RATE_STALENESS_DAYS } from "@/lib/domain/observation-age";

import type { AccommodationOptionEvaluation } from "./accommodation-evaluation";
import { createAccommodationOption, deleteAccommodationOption, updateAccommodationOption } from "./accommodation-actions";
import { ACCOMMODATION_OPTION_STATUS_LABELS, ACCOMMODATION_RATE_UNIT_LABELS } from "./accommodation-labels";
import { ConstraintBadge } from "./flight-constraint-badge";
import { formatAmount, formatDate, formatObservationAge } from "./format";
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

// Entry forms and per-option check/cost rendering for accommodation
// candidates, nested one level inside each stay (see
// itinerary-write-ui.tsx's StayRow) since an option is a candidate for
// one specific stay, never a resource several stays share. Render
// order inside each card mirrors flight-write-ui.tsx: constraint
// results first (the four checks), cost second, descriptive detail
// last. No acceptance-safeguard section -- see
// 20261101090000_accommodation_options's own comment.
export function AddAccommodationOptionForm({
  stayId,
  sources,
  onDone,
}: {
  stayId: string;
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(createAccommodationOption, initialFormActionState);
  const [sourceChoice, setSourceChoice] = useState("");
  const [conditionalRate, setConditionalRate] = useState(false);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="stayId" value={stayId} />

      <div className="space-y-1.5">
        <label htmlFor="accommodation-option-label" className={labelClass}>
          Label
        </label>
        <input
          id="accommodation-option-label"
          name="label"
          required
          placeholder="Hotel near the venue"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="accommodation-option-property-name" className={labelClass}>
          Property name
        </label>
        <input id="accommodation-option-property-name" name="propertyName" required className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="accommodation-option-address" className={labelClass}>
          Address (optional)
        </label>
        <input id="accommodation-option-address" name="address" className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="accommodation-option-rate-amount" className={labelClass}>
            Rate
          </label>
          <input
            id="accommodation-option-rate-amount"
            name="rateAmount"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="accommodation-option-rate-unit" className={labelClass}>
            Per
          </label>
          <select id="accommodation-option-rate-unit" name="rateUnit" defaultValue="per_night" className={inputClass}>
            {Object.entries(ACCOMMODATION_RATE_UNIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="accommodation-option-nights" className={labelClass}>
            Nights
          </label>
          <input id="accommodation-option-nights" name="nights" type="number" min="1" step="1" required className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="accommodation-option-mandatory-fees" className={labelClass}>
            Mandatory fees
          </label>
          <input
            id="accommodation-option-mandatory-fees"
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
        <label htmlFor="accommodation-option-currency" className={labelClass}>
          Currency
        </label>
        <input
          id="accommodation-option-currency"
          name="currency"
          required
          defaultValue="USD"
          placeholder="USD"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="accommodation-option-refundability" className={labelClass}>
          Refundability
        </label>
        <select id="accommodation-option-refundability" name="refundability" defaultValue="unknown" className={inputClass}>
          {Object.entries(REFUNDABILITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="accommodation-option-cancellation-deadline" className={labelClass}>
          Cancellation deadline (optional)
        </label>
        <input
          id="accommodation-option-cancellation-deadline"
          name="cancellationDeadline"
          type="date"
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="conditionalRate"
            checked={conditionalRate}
            onChange={(event) => setConditionalRate(event.target.checked)}
            className="h-4 w-4"
          />
          Rate is conditional (a discount, a non-refundable prepayment, ...)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isHostel" className="h-4 w-4" />
          Hostel
        </label>
      </div>

      {conditionalRate && (
        <div className="space-y-1.5">
          <label htmlFor="accommodation-option-undiscounted-amount" className={labelClass}>
            Undiscounted amount
          </label>
          <input
            id="accommodation-option-undiscounted-amount"
            name="undiscountedAmount"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="accommodation-option-information-state" className={labelClass}>
          Information state
        </label>
        <InfoStateSelect id="accommodation-option-information-state" defaultValue="estimate" />
      </div>

      <SourcePicker name="source" sources={sources} required value={sourceChoice} onChange={setSourceChoice} />

      <div className="space-y-1.5">
        <label htmlFor="accommodation-option-observed-on" className={labelClass}>
          Rate observed on
        </label>
        <input id="accommodation-option-observed-on" name="observedOn" type="date" required className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="accommodation-option-observed-start-date" className={labelClass}>
          Observed for the stay starting (optional -- leave blank for a dateless guide price)
        </label>
        <input
          id="accommodation-option-observed-start-date"
          name="observedStartDate"
          type="date"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="accommodation-option-notes" className={labelClass}>
          Notes (optional)
        </label>
        <input id="accommodation-option-notes" name="notes" className={inputClass} />
      </div>

      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Adding…" : "Add accommodation option"}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AccommodationOptionList({
  evaluations,
  sources,
}: {
  evaluations: AccommodationOptionEvaluation[];
  sources: Source[];
}) {
  if (evaluations.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No accommodation options recorded yet.</p>;
  }

  return (
    <div className="space-y-3" data-testid="accommodation-options-list">
      {evaluations.map((evaluation) => (
        <AccommodationOptionCard key={evaluation.option.id} evaluation={evaluation} sources={sources} />
      ))}
    </div>
  );
}

function AccommodationOptionCard({
  evaluation,
  sources,
}: {
  evaluation: AccommodationOptionEvaluation;
  sources: Source[];
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [attempt, setAttempt] = useState(0);
  const { option } = evaluation;

  function startMode(next: "edit" | "delete") {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  const source = sources.find((candidate) => candidate.id === option.sourceId) ?? null;
  const ageDays = observationAgeDays(option.observedOn, new Date().toISOString().slice(0, 10));
  const isStale = ageDays > RATE_STALENESS_DAYS;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" data-testid="accommodation-option-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{option.label}</p>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {ACCOMMODATION_OPTION_STATUS_LABELS[option.status]}
        </span>
      </div>

      {mode === "edit" ? (
        <EditAccommodationOptionForm key={attempt} option={option} sources={sources} onDone={() => setMode("view")} />
      ) : mode === "delete" ? (
        <DeleteAccommodationOptionForm key={attempt} option={option} onDone={() => setMode("view")} />
      ) : (
        <>
          {/* 1. Constraint results first -- the four checks. */}
          <div className="mt-3 space-y-1.5 text-sm">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Hard constraints
            </p>
            <ConstraintRow label="Nights match the stay" result={evaluation.nightsMatchStay} />
            <ConstraintRow label="Dates covered by source" result={evaluation.datesCovered} />
            <ConstraintRow label="Cancellation deadline" result={evaluation.cancellationDeadline} />
            <ConstraintRow label="Eligible for the event stay" result={evaluation.hostelEligibility} />
            {[
              ...evaluation.nightsMatchStay.reasons,
              ...evaluation.datesCovered.reasons,
              ...evaluation.cancellationDeadline.reasons,
              ...evaluation.hostelEligibility.reasons,
            ].length > 0 && (
              <ReasonsList
                reasons={[
                  ...evaluation.nightsMatchStay.reasons,
                  ...evaluation.datesCovered.reasons,
                  ...evaluation.cancellationDeadline.reasons,
                  ...evaluation.hostelEligibility.reasons,
                ]}
              />
            )}
          </div>

          {/* 2. Cost second. */}
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">Cost</p>
            <p>
              Effective Accommodation Cost: {formatAmount(evaluation.effectiveCost.amount, evaluation.effectiveCost.currency)}
            </p>
            {evaluation.effectiveCost.undiscountedAmount !== null && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Undiscounted: {formatAmount(evaluation.effectiveCost.undiscountedAmount, evaluation.effectiveCost.currency)}
              </p>
            )}
          </div>

          {/* 3. Descriptive detail last. */}
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">Details</p>
            <p>{option.propertyName}</p>
            {option.address && <p className="text-xs text-zinc-500 dark:text-zinc-400">{option.address}</p>}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {ACCOMMODATION_RATE_UNIT_LABELS[option.rateUnit]} · {REFUNDABILITY_LABELS[option.refundability]}
              {option.isHostel ? " · Hostel" : ""}
            </p>
          </div>

          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            {source ? (
              <>
                {source.provider} · Tier {source.tier} ·{" "}
              </>
            ) : (
              "No source on this option · "
            )}
            {formatDate(option.observedOn)} ({formatObservationAge(ageDays)}) · {INFO_STATE_LABELS[option.informationState]}
            {isStale && (
              <span className="ml-1 text-amber-700 dark:text-amber-400">(may be out of date -- worth checking again)</span>
            )}
          </p>
          {option.observedStartDate === null && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Guide price, not a dated observation.</p>
          )}
          {option.notes && <p className="mt-1 text-sm whitespace-pre-line">{option.notes}</p>}

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

function ConstraintRow({ label, result }: { label: string; result: { status: "pass" | "fail" | "unknown" | "not_applicable" } }) {
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

function EditAccommodationOptionForm({
  option,
  sources,
  onDone,
}: {
  option: AccommodationOption;
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateAccommodationOption, initialFormActionState);
  const formId = useId();
  const [sourceChoice, setSourceChoice] = useState(option.sourceId);
  const [conditionalRate, setConditionalRate] = useState(option.conditionalRate);

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
          {Object.entries(ACCOMMODATION_OPTION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-propertyName`} className={labelClass}>
          New property name
        </label>
        <input
          id={`${formId}-propertyName`}
          name="propertyName"
          required
          defaultValue={option.propertyName}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-address`} className={labelClass}>
          New address
        </label>
        <input id={`${formId}-address`} name="address" defaultValue={option.address ?? ""} className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-rateAmount`} className={labelClass}>
            New rate
          </label>
          <input
            id={`${formId}-rateAmount`}
            name="rateAmount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={option.rateAmount}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-rateUnit`} className={labelClass}>
            New rate unit
          </label>
          <select id={`${formId}-rateUnit`} name="rateUnit" defaultValue={option.rateUnit} className={inputClass}>
            {Object.entries(ACCOMMODATION_RATE_UNIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
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
            defaultValue={option.nights}
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

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-cancellationDeadline`} className={labelClass}>
          New cancellation deadline
        </label>
        <input
          id={`${formId}-cancellationDeadline`}
          name="cancellationDeadline"
          type="date"
          defaultValue={option.cancellationDeadline ?? ""}
          className={inputClass}
        />
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

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="conditionalRate"
            checked={conditionalRate}
            onChange={(event) => setConditionalRate(event.target.checked)}
            className="h-4 w-4"
          />
          Rate is conditional
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isHostel" defaultChecked={option.isHostel} className="h-4 w-4" />
          Hostel
        </label>
      </div>

      {conditionalRate && (
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-undiscountedAmount`} className={labelClass}>
            New undiscounted amount
          </label>
          <input
            id={`${formId}-undiscountedAmount`}
            name="undiscountedAmount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={option.undiscountedAmount ?? ""}
            className={inputClass}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-informationState`} className={labelClass}>
          New information state
        </label>
        <InfoStateSelect id={`${formId}-informationState`} defaultValue={option.informationState} />
      </div>

      <SourcePicker name="source" sources={sources} required value={sourceChoice} onChange={setSourceChoice} />

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-observedOn`} className={labelClass}>
          New rate observed on
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
        <label htmlFor={`${formId}-observedStartDate`} className={labelClass}>
          New: observed for the stay starting (optional -- leave blank for a dateless guide price)
        </label>
        <input
          id={`${formId}-observedStartDate`}
          name="observedStartDate"
          type="date"
          defaultValue={option.observedStartDate ?? ""}
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

function DeleteAccommodationOptionForm({ option, onDone }: { option: AccommodationOption; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(deleteAccommodationOption, initialFormActionState);
  const formId = useId();

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="id" value={option.id} />
      <p className="text-sm">Delete the accommodation option &quot;{option.label}&quot;?</p>
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
