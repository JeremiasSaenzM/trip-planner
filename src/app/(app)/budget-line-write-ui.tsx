"use client";

import { useActionState, useEffect, useState } from "react";

import type { BudgetLine, Source } from "@/lib/data/types";
import type { InfoState } from "@/lib/domain/types";

import { createBudgetLine, deleteBudgetLine, updateBudgetLine } from "./budget-line-actions";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "./category-labels";
import { formatAmount, formatDate } from "./format";
import { buttonClass, FormError, inputClass, labelClass, secondaryButtonClass } from "./form-styles";
import { initialFormActionState } from "./form-action-state";
import { INFO_STATE_LABELS, INFO_STATE_ORDER } from "./info-state-labels";
import { SourcePicker } from "./source-picker";

// Mirrors budget_lines_amount_order and budget_lines_confirmed_needs_source
// -- the same two rules shared.ts's checkAmountOrder/checkConfirmedNeedsSource
// enforce server-side, checked again here so the form itself refuses a
// bad submission instead of waiting on a round trip to the DB.
function amountsInOrder(min: number, target: number, conservative: number): boolean {
  return min <= target && target <= conservative;
}

function confirmedHasSource(state: InfoState, sourceChoice: string): boolean {
  return state !== "confirmed" || sourceChoice !== "";
}

const AMOUNT_ORDER_MESSAGE = "Minimum, target and conservative must stay in that order (min ≤ target ≤ conservative).";
const CONFIRMED_NEEDS_SOURCE_MESSAGE = "Confirmed needs a source -- add one, or set this back to an estimate.";

export function AddBudgetLineForm({
  tripId,
  scenarioId,
  sources,
}: {
  tripId: string;
  scenarioId: string;
  sources: Source[];
}) {
  const [state, formAction, pending] = useActionState(createBudgetLine, initialFormActionState);

  const [amountMin, setAmountMin] = useState("");
  const [amountTarget, setAmountTarget] = useState("");
  const [amountConservative, setAmountConservative] = useState("");
  const [informationState, setInformationState] = useState<InfoState>("estimate");
  const [sourceChoice, setSourceChoice] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const min = Number(amountMin);
    const target = Number(amountTarget);
    const conservative = Number(amountConservative);

    if (!amountsInOrder(min, target, conservative)) {
      event.preventDefault();
      setClientError(AMOUNT_ORDER_MESSAGE);
      return;
    }
    if (!confirmedHasSource(informationState, sourceChoice)) {
      event.preventDefault();
      setClientError(CONFIRMED_NEEDS_SOURCE_MESSAGE);
      return;
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="scenarioId" value={scenarioId} />

      <div className="space-y-1.5">
        <label htmlFor="line-description" className={labelClass}>
          Description
        </label>
        <input id="line-description" name="description" required className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="line-category" className={labelClass}>
          Budget category
        </label>
        <select id="line-category" name="category" required className={inputClass}>
          {CATEGORY_ORDER.map((category) => (
            <option key={category} value={category}>
              {category} — {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="line-amount-min" className={labelClass}>
            Minimum
          </label>
          <input
            id="line-amount-min"
            name="amountMin"
            type="number"
            step="0.01"
            min="0"
            required
            value={amountMin}
            onChange={(event) => setAmountMin(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="line-amount-target" className={labelClass}>
            Target
          </label>
          <input
            id="line-amount-target"
            name="amountTarget"
            type="number"
            step="0.01"
            min="0"
            required
            value={amountTarget}
            onChange={(event) => setAmountTarget(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="line-amount-conservative" className={labelClass}>
            Conservative
          </label>
          <input
            id="line-amount-conservative"
            name="amountConservative"
            type="number"
            step="0.01"
            min="0"
            required
            value={amountConservative}
            onChange={(event) => setAmountConservative(event.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="line-currency" className={labelClass}>
          Currency
        </label>
        <input id="line-currency" name="currency" required defaultValue="USD" placeholder="USD" className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="line-information-state" className={labelClass}>
          Information state
        </label>
        <select
          id="line-information-state"
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
        sources={sources}
        required={false}
        value={sourceChoice}
        onChange={setSourceChoice}
      />

      <div className="space-y-1.5">
        <label htmlFor="line-notes" className={labelClass}>
          Notes (optional)
        </label>
        <input id="line-notes" name="notes" className={inputClass} />
      </div>

      {clientError && <FormError message={clientError} />}
      {state.status === "error" && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Adding…" : "Add budget line"}
      </button>
    </form>
  );
}

export function BudgetLineList({ budgetLines, sources }: { budgetLines: BudgetLine[]; sources: Source[] }) {
  if (budgetLines.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No budget lines yet.</p>;
  }

  const sorted = [...budgetLines].sort((a, b) => a.category.localeCompare(b.category));

  return (
    <div className="space-y-2">
      {sorted.map((line) => (
        <BudgetLineRow key={line.id} line={line} sources={sources} />
      ))}
    </div>
  );
}

function BudgetLineRow({ line, sources }: { line: BudgetLine; sources: Source[] }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [attempt, setAttempt] = useState(0);

  function startMode(next: "edit" | "delete") {
    setAttempt((value) => value + 1);
    setMode(next);
  }

  if (mode === "edit") {
    return (
      <EditBudgetLineForm key={attempt} line={line} sources={sources} onDone={() => setMode("view")} />
    );
  }
  if (mode === "delete") {
    return <DeleteBudgetLineForm key={attempt} line={line} onDone={() => setMode("view")} />;
  }

  const source = line.sourceId ? sources.find((candidate) => candidate.id === line.sourceId) : null;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {line.category} — {line.description}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {INFO_STATE_LABELS[line.informationState]}
            {source ? ` · ${source.provider} (${formatDate(source.observedOn)})` : ""}
            {line.autoCreated ? " · Auto-created from a payment" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right text-sm">
          <p>{formatAmount(line.amountTarget, line.currency)}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatAmount(line.amountMin, line.currency)}–{formatAmount(line.amountConservative, line.currency)}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        <button type="button" onClick={() => startMode("edit")} className="text-zinc-600 underline dark:text-zinc-400">
          Edit
        </button>
        <button type="button" onClick={() => startMode("delete")} className="text-red-600 underline dark:text-red-400">
          Delete
        </button>
      </div>
    </div>
  );
}

function EditBudgetLineForm({
  line,
  sources,
  onDone,
}: {
  line: BudgetLine;
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateBudgetLine, initialFormActionState);

  const [amountMin, setAmountMin] = useState(String(line.amountMin));
  const [amountTarget, setAmountTarget] = useState(String(line.amountTarget));
  const [amountConservative, setAmountConservative] = useState(String(line.amountConservative));
  const [informationState, setInformationState] = useState<InfoState>(line.informationState);
  const [sourceChoice, setSourceChoice] = useState(line.sourceId ?? "");
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const min = Number(amountMin);
    const target = Number(amountTarget);
    const conservative = Number(amountConservative);

    if (!amountsInOrder(min, target, conservative)) {
      event.preventDefault();
      setClientError(AMOUNT_ORDER_MESSAGE);
      return;
    }
    if (!confirmedHasSource(informationState, sourceChoice)) {
      event.preventDefault();
      setClientError(CONFIRMED_NEEDS_SOURCE_MESSAGE);
      return;
    }
    setClientError(null);
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="space-y-2.5 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <input type="hidden" name="id" value={line.id} />
      <input name="description" required defaultValue={line.description} aria-label="New description" className={inputClass} />
      <select name="category" required defaultValue={line.category} aria-label="New category" className={inputClass}>
        {CATEGORY_ORDER.map((category) => (
          <option key={category} value={category}>
            {category} — {CATEGORY_LABELS[category]}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-3 gap-2.5">
        <input
          name="amountMin"
          type="number"
          step="0.01"
          min="0"
          required
          value={amountMin}
          onChange={(event) => setAmountMin(event.target.value)}
          aria-label="New minimum"
          className={inputClass}
        />
        <input
          name="amountTarget"
          type="number"
          step="0.01"
          min="0"
          required
          value={amountTarget}
          onChange={(event) => setAmountTarget(event.target.value)}
          aria-label="New target"
          className={inputClass}
        />
        <input
          name="amountConservative"
          type="number"
          step="0.01"
          min="0"
          required
          value={amountConservative}
          onChange={(event) => setAmountConservative(event.target.value)}
          aria-label="New conservative"
          className={inputClass}
        />
      </div>

      <input name="currency" required defaultValue={line.currency} aria-label="New currency" className={inputClass} />

      <select
        name="informationState"
        value={informationState}
        onChange={(event) => setInformationState(event.target.value as InfoState)}
        aria-label="New information state"
        className={inputClass}
      >
        {INFO_STATE_ORDER.map((value) => (
          <option key={value} value={value}>
            {INFO_STATE_LABELS[value]}
          </option>
        ))}
      </select>

      <SourcePicker
        name="source"
        sources={sources}
        required={false}
        value={sourceChoice}
        onChange={setSourceChoice}
      />

      <input name="notes" defaultValue={line.notes ?? ""} aria-label="New notes" className={inputClass} />

      <input
        name="reason"
        required
        aria-label="Reason for this change"
        placeholder="Reason for this change"
        className={inputClass}
      />

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

function DeleteBudgetLineForm({ line, onDone }: { line: BudgetLine; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(deleteBudgetLine, initialFormActionState);

  return (
    <form
      action={formAction}
      className="space-y-2.5 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <input type="hidden" name="id" value={line.id} />
      <p className="text-sm">
        Delete {line.category} — {line.description}?
      </p>
      <input
        name="reason"
        required
        aria-label="Reason for deleting this"
        placeholder="Reason for deleting this"
        className={inputClass}
      />
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
