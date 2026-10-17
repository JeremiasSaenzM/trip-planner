"use client";

import { useActionState, useEffect, useId, useState } from "react";

import type { BudgetLine, Payment, Source } from "@/lib/data/types";
import type { InfoState } from "@/lib/domain/types";
import { checkCanAcceptPaymentRisk } from "@/lib/validation/decisions";
import type { UpdatePaymentDetailsInput } from "@/lib/validation/payments";

import { CATEGORY_LABELS, CATEGORY_ORDER } from "./category-labels";
import { formatAmount } from "./format";
import {
  buttonClass,
  FormError,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "./form-styles";
import {
  initialFormActionState,
  initialPaymentStatusActionState,
  initialUpdatePaymentDetailsActionState,
} from "./form-action-state";
import { INFO_STATE_LABELS, INFO_STATE_ORDER } from "./info-state-labels";
import { REFUNDABILITY_LABELS, STATUS_LABELS, TIMING_LABELS } from "./payment-labels";
import {
  acceptPaymentRisk,
  acceptPaymentRiskForDetails,
  createPayment,
  deletePayment,
  recordPayment,
  updatePaymentDetails,
  updatePaymentStatus,
} from "./payment-actions";
import { SourcePicker } from "./source-picker";

// No currency field hidden conditionally in JS: the category picker
// and the existing-budget-line picker are mutually exclusive (one
// always disabled while the other has a real selection), so the
// person never fills in a category that's about to be ignored.
export function AddPaymentForm({
  tripId,
  scenarioId,
  budgetLines,
}: {
  tripId: string;
  scenarioId: string;
  budgetLines: BudgetLine[];
}) {
  const [state, formAction, pending] = useActionState(createPayment, initialFormActionState);
  const [budgetLineId, setBudgetLineId] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="scenarioId" value={scenarioId} />
      <div className="space-y-1.5">
        <label htmlFor="payment-description" className={labelClass}>
          Description
        </label>
        <input id="payment-description" name="description" required className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="payment-budget-line" className={labelClass}>
          Budget line
        </label>
        <select
          id="payment-budget-line"
          name="budgetLineId"
          className={inputClass}
          value={budgetLineId}
          onChange={(event) => setBudgetLineId(event.target.value)}
        >
          <option value="">Create a new budget line for this payment</option>
          {budgetLines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.description} ({line.category}) — {formatAmount(line.amountTarget, line.currency)}
            </option>
          ))}
        </select>
      </div>

      {budgetLineId === "" && (
        <div className="space-y-1.5">
          <label htmlFor="payment-category" className={labelClass}>
            Budget category
          </label>
          <select id="payment-category" name="category" required={budgetLineId === ""} className={inputClass}>
            {CATEGORY_ORDER.map((category) => (
              <option key={category} value={category}>
                {category} — {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Creates a new budget line, recorded as an estimate (it has no source yet).
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="payment-amount" className={labelClass}>
            Amount
          </label>
          <input
            id="payment-amount"
            name="totalAmount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="payment-currency" className={labelClass}>
            Currency
          </label>
          <input
            id="payment-currency"
            name="currency"
            required
            defaultValue="USD"
            placeholder="USD"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="payment-refundability" className={labelClass}>
            Refundability
          </label>
          <select id="payment-refundability" name="refundability" required className={inputClass}>
            {Object.entries(REFUNDABILITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="payment-timing" className={labelClass}>
            Timing
          </label>
          <select id="payment-timing" name="timingType" required className={inputClass}>
            {Object.entries(TIMING_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="payment-due-date" className={labelClass}>
            Due date (optional)
          </label>
          <input id="payment-due-date" name="dueDate" type="date" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="payment-cancellation-deadline" className={labelClass}>
            Cancellation deadline (optional)
          </label>
          <input id="payment-cancellation-deadline" name="cancellationDeadline" type="date" className={inputClass} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="competitionRelated" className="size-4" />
        This is tied to the competition itself (not a general trip expense)
      </label>

      {state.status === "error" && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Adding…" : "Add payment"}
      </button>
    </form>
  );
}

type RowMode = "view" | "record" | "status" | "edit" | "delete";

export function PaymentRowActions({
  payment,
  tripId,
  competitionId,
  budgetLineAutoCreated,
  otherPaymentsOnBudgetLine,
  sources,
}: {
  payment: Payment;
  tripId: string;
  competitionId: string | null;
  budgetLineAutoCreated: boolean;
  otherPaymentsOnBudgetLine: number;
  sources: Source[];
}) {
  const [mode, setMode] = useState<RowMode>("view");
  const [attempt, setAttempt] = useState(0);

  function startMode(next: RowMode) {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  if (mode === "record") {
    return <RecordPaymentForm key={attempt} payment={payment} onDone={() => setMode("view")} />;
  }
  if (mode === "status") {
    return (
      <ChangeStatusForm
        key={attempt}
        payment={payment}
        tripId={tripId}
        competitionId={competitionId}
        onDone={() => setMode("view")}
      />
    );
  }
  if (mode === "edit") {
    return (
      <EditPaymentForm
        key={attempt}
        payment={payment}
        tripId={tripId}
        competitionId={competitionId}
        sources={sources}
        onDone={() => setMode("view")}
      />
    );
  }
  if (mode === "delete") {
    return (
      <DeletePaymentForm
        key={attempt}
        payment={payment}
        budgetLineAutoCreated={budgetLineAutoCreated}
        otherPaymentsOnBudgetLine={otherPaymentsOnBudgetLine}
        onDone={() => setMode("view")}
      />
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-3 text-sm">
      <button type="button" onClick={() => startMode("record")} className="text-zinc-600 underline dark:text-zinc-400">
        Record payment
      </button>
      <button type="button" onClick={() => startMode("status")} className="text-zinc-600 underline dark:text-zinc-400">
        Change status
      </button>
      <button type="button" onClick={() => startMode("edit")} className="text-zinc-600 underline dark:text-zinc-400">
        Edit
      </button>
      <button type="button" onClick={() => startMode("delete")} className="text-red-600 underline dark:text-red-400">
        Delete
      </button>
    </div>
  );
}

function RecordPaymentForm({ payment, onDone }: { payment: Payment; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(recordPayment, initialFormActionState);
  const formId = useId();

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  const dueLater = payment.totalAmount - payment.paidAmount;

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="paymentId" value={payment.id} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {formatAmount(dueLater, payment.currency)} still due.
      </p>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-amount`} className={labelClass}>
          Amount paid
        </label>
        <input
          id={`${formId}-amount`}
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for this change
        </label>
        <input
          id={`${formId}-reason`}
          name="reason"
          required
          className={inputClass}
        />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Recording…" : "Record"}
        </button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ChangeStatusForm({
  payment,
  tripId,
  competitionId,
  onDone,
}: {
  payment: Payment;
  tripId: string;
  competitionId: string | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updatePaymentStatus, initialPaymentStatusActionState);
  const formId = useId();
  const [targetStatus, setTargetStatus] = useState(payment.status);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  if (state.status === "blocked") {
    const risk = checkCanAcceptPaymentRisk(competitionId);
    return (
      <div className="mt-2 space-y-2.5">
        <FormError message={state.message} />
        {risk.ok ? (
          <AcceptRiskForm
            payment={payment}
            tripId={tripId}
            competitionId={competitionId}
            targetStatus={targetStatus}
            onDone={onDone}
          />
        ) : (
          <FormError message={risk.message} />
        )}
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="paymentId" value={payment.id} />
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-status`} className={labelClass}>
          New status
        </label>
        <select
          id={`${formId}-status`}
          name="status"
          value={targetStatus}
          onChange={(event) => setTargetStatus(event.target.value as Payment["status"])}
          className={inputClass}
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for this change
        </label>
        <input
          id={`${formId}-reason`}
          name="reason"
          required
          className={inputClass}
        />
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

function AcceptRiskForm({
  payment,
  tripId,
  competitionId,
  targetStatus,
  onDone,
}: {
  payment: Payment;
  tripId: string;
  competitionId: string | null;
  targetStatus: Payment["status"];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(acceptPaymentRisk, initialFormActionState);
  const formId = useId();

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-2.5 rounded-lg border border-amber-300 p-2.5 dark:border-amber-800">
      <input type="hidden" name="paymentId" value={payment.id} />
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="competitionId" value={competitionId ?? ""} />
      <input type="hidden" name="targetStatus" value={targetStatus} />
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-rationale`} className={labelClass}>
          Why you&apos;re accepting this risk
        </label>
        <input
          id={`${formId}-rationale`}
          name="rationale"
          required
          className={inputClass}
        />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Accepting…" : "I accept this risk"}
      </button>
    </form>
  );
}

function EditPaymentForm({
  payment,
  tripId,
  competitionId,
  sources,
  onDone,
}: {
  payment: Payment;
  tripId: string;
  competitionId: string | null;
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updatePaymentDetails, initialUpdatePaymentDetailsActionState);
  const formId = useId();

  const [informationState, setInformationState] = useState<InfoState>(payment.informationState);
  const [sourceChoice, setSourceChoice] = useState(payment.sourceId ?? "");
  const [datesState, setDatesState] = useState<InfoState>(payment.datesState);
  const [datesSourceChoice, setDatesSourceChoice] = useState(payment.datesSourceId ?? "");
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  if (state.status === "blocked") {
    const risk = checkCanAcceptPaymentRisk(competitionId);
    return (
      <div className="mt-2 space-y-2.5">
        <FormError message={state.message} />
        {risk.ok ? (
          <AcceptRiskForDetailsForm
            tripId={tripId}
            competitionId={competitionId}
            pending={state.pending}
            onDone={onDone}
          />
        ) : (
          <FormError message={risk.message} />
        )}
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (informationState === "confirmed" && sourceChoice === "") {
      event.preventDefault();
      setClientError("Confirmed needs a source -- add one, or set this back to an estimate.");
      return;
    }
    if (datesState === "confirmed" && datesSourceChoice === "") {
      event.preventDefault();
      setClientError("A confirmed date needs a source -- add one, or set the date back to an estimate.");
      return;
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="mt-2 space-y-2.5">
      <input type="hidden" name="paymentId" value={payment.id} />
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-description`} className={labelClass}>
          New description
        </label>
        <input
          id={`${formId}-description`}
          name="description"
          required
          defaultValue={payment.description}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-totalAmount`} className={labelClass}>
            New total amount
          </label>
          <input
            id={`${formId}-totalAmount`}
            name="totalAmount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={payment.totalAmount}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-currency`} className={labelClass}>
            New currency
          </label>
          <input
            id={`${formId}-currency`}
            name="currency"
            required
            defaultValue={payment.currency}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-refundability`} className={labelClass}>
            New refundability
          </label>
          <select
            id={`${formId}-refundability`}
            name="refundability"
            defaultValue={payment.refundability}
            className={inputClass}
          >
            {Object.entries(REFUNDABILITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-timingType`} className={labelClass}>
            New timing
          </label>
          <select
            id={`${formId}-timingType`}
            name="timingType"
            defaultValue={payment.timingType}
            className={inputClass}
          >
            {Object.entries(TIMING_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-dueDate`} className={labelClass}>
            New due date
          </label>
          <input
            id={`${formId}-dueDate`}
            name="dueDate"
            type="date"
            defaultValue={payment.dueDate ?? ""}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-cancellationDeadline`} className={labelClass}>
            New cancellation deadline
          </label>
          <input
            id={`${formId}-cancellationDeadline`}
            name="cancellationDeadline"
            type="date"
            defaultValue={payment.cancellationDeadline ?? ""}
            className={inputClass}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="payment-edit-information-state" className={labelClass}>
          Information state (the payment itself)
        </label>
        <select
          id="payment-edit-information-state"
          name="informationState"
          value={informationState}
          onChange={(event) => setInformationState(event.target.value as InfoState)}
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
        name="source"
        label="Source (the payment itself)"
        sources={sources}
        required={false}
        value={sourceChoice}
        onChange={setSourceChoice}
      />

      <div className="space-y-1.5">
        <label htmlFor="payment-edit-dates-state" className={labelClass}>
          Information state (when it&apos;s due)
        </label>
        <select
          id="payment-edit-dates-state"
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
        label="Source (when it's due)"
        sources={sources}
        required={false}
        value={datesSourceChoice}
        onChange={setDatesSourceChoice}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="competitionRelated"
          defaultChecked={payment.competitionRelated}
          className="size-4"
        />
        Tied to the competition itself
      </label>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for this change
        </label>
        <input
          id={`${formId}-reason`}
          name="reason"
          required
          className={inputClass}
        />
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

// Resubmits the blocked edit's already-validated fields (echoed back as
// UpdatePaymentDetailsActionState's "pending") as hidden inputs, plus a
// rationale -- the new amount being accepted only exists in this
// not-yet-written pending data, not on the payment itself, so there's
// nothing else to read it back from. See payment-actions.ts's
// acceptPaymentRiskForDetails.
function AcceptRiskForDetailsForm({
  tripId,
  competitionId,
  pending,
  onDone,
}: {
  tripId: string;
  competitionId: string | null;
  pending: UpdatePaymentDetailsInput;
  onDone: () => void;
}) {
  const [state, formAction, submitting] = useActionState(acceptPaymentRiskForDetails, initialFormActionState);
  const formId = useId();

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-2.5 rounded-lg border border-amber-300 p-2.5 dark:border-amber-800">
      <input type="hidden" name="paymentId" value={pending.paymentId} />
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="competitionId" value={competitionId ?? ""} />
      <input type="hidden" name="description" value={pending.description} />
      <input type="hidden" name="totalAmount" value={pending.totalAmount} />
      <input type="hidden" name="currency" value={pending.currency} />
      <input type="hidden" name="dueDate" value={pending.dueDate ?? ""} />
      <input type="hidden" name="cancellationDeadline" value={pending.cancellationDeadline ?? ""} />
      <input type="hidden" name="datesState" value={pending.datesState} />
      <input type="hidden" name="datesSourceId" value={pending.datesSourceId ?? ""} />
      <input type="hidden" name="timingType" value={pending.timingType} />
      <input type="hidden" name="informationState" value={pending.informationState} />
      <input type="hidden" name="sourceId" value={pending.sourceId ?? ""} />
      <input type="hidden" name="refundability" value={pending.refundability} />
      <input type="hidden" name="competitionRelated" value={pending.competitionRelated ? "on" : ""} />
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-rationale`} className={labelClass}>
          Why you&apos;re accepting this risk
        </label>
        <input
          id={`${formId}-rationale`}
          name="rationale"
          required
          className={inputClass}
        />
      </div>
      {state.status === "error" && <FormError message={state.message} />}
      <button type="submit" disabled={submitting} className={buttonClass}>
        {submitting ? "Accepting…" : "I accept this risk"}
      </button>
    </form>
  );
}

function DeletePaymentForm({
  payment,
  budgetLineAutoCreated,
  otherPaymentsOnBudgetLine,
  onDone,
}: {
  payment: Payment;
  budgetLineAutoCreated: boolean;
  otherPaymentsOnBudgetLine: number;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(deletePayment, initialFormActionState);
  const formId = useId();

  const budgetLineNote =
    budgetLineAutoCreated && otherPaymentsOnBudgetLine === 0
      ? "Its budget line will be deleted too, since nothing else uses it."
      : "Its budget line will stay either way.";

  return (
    <form action={formAction} className="mt-2 space-y-2.5">
      <input type="hidden" name="paymentId" value={payment.id} />
      <p className="text-sm">
        Delete {formatAmount(payment.totalAmount, payment.currency)} ({payment.description})?{" "}
        {budgetLineNote}
      </p>
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-reason`} className={labelClass}>
          Reason for deleting this
        </label>
        <input
          id={`${formId}-reason`}
          name="reason"
          required
          className={inputClass}
        />
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
