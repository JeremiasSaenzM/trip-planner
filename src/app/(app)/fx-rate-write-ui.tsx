"use client";

import { useActionState, useEffect, useState } from "react";

import type { FxRate, Source } from "@/lib/data/types";
import type { MissingFxRate } from "@/lib/domain/find-missing-fx-rates";
import type { InfoState, RateKind } from "@/lib/domain/types";

import { formatDate } from "./format";
import { buttonClass, FormError, inputClass, labelClass, secondaryButtonClass } from "./form-styles";
import { initialFormActionState } from "./form-action-state";
import { createFxRate, updateFxRate } from "./fx-rate-actions";
import { INFO_STATE_LABELS, INFO_STATE_ORDER } from "./info-state-labels";
import { SourcePicker } from "./source-picker";

// planning_base feeds the Target figures everywhere (rollUpBudgetByScenario,
// buildObligations); planning_conservative feeds the Conservative ones.
// Said explicitly here so the missing-rates list never leaves it to be
// inferred.
const RATE_KIND_LABELS: Record<RateKind, string> = {
  observed: "Observed",
  planning_base: "Planning (base) — feeds the Target figures",
  planning_conservative: "Planning (conservative) — feeds the Conservative figures",
};

const RATE_KIND_ORDER: RateKind[] = ["planning_base", "planning_conservative", "observed"];

export function FxRatesSection({
  fxRates,
  missingFxRates,
  sources,
}: {
  fxRates: FxRate[];
  missingFxRates: MissingFxRate[];
  sources: Source[];
}) {
  const [prefill, setPrefill] = useState<{ currency: string; rateKind: RateKind } | null>(null);

  return (
    <div className="space-y-4">
      {missingFxRates.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Missing rates</p>
          <ul className="space-y-1.5">
            {missingFxRates.map((missing) => (
              <li
                key={`${missing.currency}-${missing.rateKind}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              >
                <span>
                  {missing.currency} — {RATE_KIND_LABELS[missing.rateKind]}
                </span>
                <button
                  type="button"
                  onClick={() => setPrefill({ currency: missing.currency, rateKind: missing.rateKind })}
                  className="font-medium underline"
                >
                  Add this rate
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddFxRateForm
        key={prefill ? `${prefill.currency}-${prefill.rateKind}` : "blank"}
        sources={sources}
        prefillCurrency={prefill?.currency}
        prefillRateKind={prefill?.rateKind}
      />

      <FxRateList fxRates={fxRates} sources={sources} />
    </div>
  );
}

function AddFxRateForm({
  sources,
  prefillCurrency,
  prefillRateKind,
}: {
  sources: Source[];
  prefillCurrency?: string;
  prefillRateKind?: RateKind;
}) {
  const [state, formAction, pending] = useActionState(createFxRate, initialFormActionState);
  const [sourceChoice, setSourceChoice] = useState("");

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-medium">Add an FX rate</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="rate-currency" className={labelClass}>
            Currency
          </label>
          <input
            id="rate-currency"
            name="currency"
            required
            defaultValue={prefillCurrency ?? ""}
            placeholder="EUR"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rate-kind" className={labelClass}>
            Kind
          </label>
          <select id="rate-kind" name="rateKind" required defaultValue={prefillRateKind ?? ""} className={inputClass}>
            <option value="" disabled>
              Choose a kind
            </option>
            {RATE_KIND_ORDER.map((kind) => (
              <option key={kind} value={kind}>
                {RATE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="rate-to-usd" className={labelClass}>
            Rate to USD
          </label>
          <input
            id="rate-to-usd"
            name="rateToUsd"
            type="number"
            step="0.000001"
            min="0.000001"
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rate-date" className={labelClass}>
            Date
          </label>
          <input id="rate-date" name="rateDate" type="date" required className={inputClass} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="rate-information-state" className={labelClass}>
          Information state
        </label>
        <select id="rate-information-state" name="informationState" defaultValue="estimate" className={inputClass}>
          {INFO_STATE_ORDER.map((value) => (
            <option key={value} value={value}>
              {INFO_STATE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <SourcePicker name="source" sources={sources} required value={sourceChoice} onChange={setSourceChoice} />

      {state.status === "error" && <FormError message={state.message} />}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Adding…" : "Add rate"}
      </button>
    </form>
  );
}

function FxRateList({ fxRates, sources }: { fxRates: FxRate[]; sources: Source[] }) {
  if (fxRates.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No FX rates recorded yet.</p>;
  }

  const currencies = Array.from(new Set(fxRates.map((rate) => rate.currency))).sort();

  return (
    <div className="space-y-3">
      {currencies.map((currency) => (
        <CurrencyRateGroup key={currency} currency={currency} fxRates={fxRates} sources={sources} />
      ))}
    </div>
  );
}

function latestRate(fxRates: FxRate[], currency: string, kind: RateKind): FxRate | null {
  const candidates = fxRates.filter((rate) => rate.currency === currency && rate.rateKind === kind);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => (candidate.rateDate > best.rateDate ? candidate : best));
}

function CurrencyRateGroup({
  currency,
  fxRates,
  sources,
}: {
  currency: string;
  fxRates: FxRate[];
  sources: Source[];
}) {
  const rows = fxRates
    .filter((rate) => rate.currency === currency)
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate));

  // A soft warning only, never a block: conservative is meant to be the
  // financially safer figure, so a conservative rate that converts
  // *lower* than the base rate (for the same foreign amount) is worth a
  // second look -- but there may be a real reason for it, so saving is
  // never refused over this.
  const base = latestRate(fxRates, currency, "planning_base");
  const conservative = latestRate(fxRates, currency, "planning_conservative");
  const conservativeLowerThanBase = base !== null && conservative !== null && conservative.rateToUsd < base.rateToUsd;

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{currency}</p>
      {conservativeLowerThanBase && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          The conservative rate ({conservative!.rateToUsd}) converts lower than the base rate ({base!.rateToUsd}) --
          conservative is meant to be the safer figure. Double-check this is intentional.
        </p>
      )}
      <div className="space-y-2">
        {rows.map((rate) => (
          <FxRateRow key={rate.id} rate={rate} sources={sources} />
        ))}
      </div>
    </div>
  );
}

function FxRateRow({ rate, sources }: { rate: FxRate; sources: Source[] }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [attempt, setAttempt] = useState(0);
  const source = sources.find((candidate) => candidate.id === rate.sourceId) ?? null;

  if (mode === "edit") {
    return <EditFxRateForm key={attempt} rate={rate} sources={sources} onDone={() => setMode("view")} />;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div>
        <p className="text-sm font-medium">
          {rate.rateToUsd} ({RATE_KIND_LABELS[rate.rateKind]})
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatDate(rate.rateDate)} · {INFO_STATE_LABELS[rate.informationState]}
          {source ? ` · ${source.provider}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          setAttempt((value) => value + 1);
          setMode("edit");
        }}
        className="text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        Edit
      </button>
    </div>
  );
}

function EditFxRateForm({
  rate,
  sources,
  onDone,
}: {
  rate: FxRate;
  sources: Source[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateFxRate, initialFormActionState);
  const [sourceChoice, setSourceChoice] = useState(rate.sourceId);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-2.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <input type="hidden" name="id" value={rate.id} />
      <div className="grid grid-cols-2 gap-2.5">
        <input name="currency" required defaultValue={rate.currency} aria-label="New currency" className={inputClass} />
        <select name="rateKind" required defaultValue={rate.rateKind} aria-label="New kind" className={inputClass}>
          {RATE_KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {RATE_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <input
          name="rateToUsd"
          type="number"
          step="0.000001"
          min="0.000001"
          required
          defaultValue={rate.rateToUsd}
          aria-label="New rate to USD"
          className={inputClass}
        />
        <input name="rateDate" type="date" required defaultValue={rate.rateDate} aria-label="New date" className={inputClass} />
      </div>
      <select
        name="informationState"
        defaultValue={rate.informationState}
        aria-label="New information state"
        className={inputClass}
      >
        {INFO_STATE_ORDER.map((value) => (
          <option key={value} value={value as InfoState}>
            {INFO_STATE_LABELS[value]}
          </option>
        ))}
      </select>

      <SourcePicker name="source" sources={sources} required value={sourceChoice} onChange={setSourceChoice} />

      <input
        name="reason"
        required
        aria-label="Reason for this change"
        placeholder="Reason for this change"
        className={inputClass}
      />

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
