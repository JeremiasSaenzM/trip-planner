"use client";

import { useId } from "react";

import type { Source } from "@/lib/data/types";
import { todayUtc } from "@/lib/validation/shared";

import { formatDate } from "./format";
import { inputClass, labelClass } from "./form-styles";
import { SOURCE_TIER_LABELS, SOURCE_TIER_ORDER } from "./source-labels";

// The "pick an existing source, or add a new one inline" control --
// there's no standalone sources screen, so this is the only way a
// source ever gets created (budget lines, FX rates, and payments'
// informationState/sourceId and datesState/datesSourceId pairs all use
// it). A controlled component: the parent owns `value` so it can also
// enforce "confirmed needs a source" itself (see budget-line-write-ui.tsx),
// not just rely on the server round-trip to say so.
//
// Submits as "${name}Choice" (an existing source's id, "" for no
// source, or the sentinel "__new__"), plus "${name}New*" fields for the
// new-source sub-form -- resolveSourceId() in source-actions.ts reads
// exactly these names back off the FormData.
export function SourcePicker({
  name,
  sources,
  required,
  value,
  onChange,
  label = "Source",
}: {
  name: string;
  sources: Source[];
  required: boolean;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const sorted = [...sources].sort((a, b) => b.observedOn.localeCompare(a.observedOn));
  // `name` only has to be unique within one <form> (it's a field name);
  // two SourcePickers with the same `name` can easily render on the
  // same page at once (e.g. the budget-line and FX-rate add forms both
  // use name="source"). A DOM id has to be unique page-wide, or the
  // <label>'s htmlFor pairs with whichever element happens to come
  // first in the DOM -- useId() gives each instance its own, regardless
  // of how many share the same `name`.
  const domId = useId();
  // A required picker with no sources to pick from has exactly one
  // path: create one. Without this, the select's only option is "Add a
  // new source…", the browser shows it as selected while `value` is
  // still "", and choosing it again is no change at all -- no onChange,
  // so the new-source fields below never appear. Derived here rather
  // than in each parent's initial state, so it also holds for every
  // caller at once.
  const mustCreate = required && sorted.length === 0;
  const selected = mustCreate ? "__new__" : value;

  // Each new-source field's accessible name is the picker's own label
  // plus the field's visible one ("Source Provider", "Source (when it's
  // due) Provider"), via aria-labelledby -- EditPaymentForm renders two
  // SourcePickers in one form, so a bare "Provider" twice over wouldn't
  // say which source it belongs to.
  const nameId = `${domId}-name`;
  const fieldId = (field: string) => `${domId}-${field}`;
  const labelledBy = (...fields: string[]) => [nameId, ...fields.map((field) => `${fieldId(field)}-label`)].join(" ");

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <label htmlFor={domId} className={labelClass}>
        <span id={nameId}>{label}</span>
        {required ? "" : " (optional)"}
      </label>
      <select
        id={domId}
        name={`${name}Choice`}
        value={selected}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className={inputClass}
      >
        {/* Every state `value` can start in ("") has a matching option,
            so what the select shows is always what React thinks is
            picked -- and picking any real option is a real change. A
            required picker's placeholder is disabled, so the browser's
            own required-field check refuses to submit it. */}
        {required ? (
          <option value="" disabled>
            Choose a source
          </option>
        ) : (
          <option value="">No source</option>
        )}
        {sorted.map((source) => (
          <option key={source.id} value={source.id}>
            {source.provider} — tier {source.tier} ({formatDate(source.observedOn)})
          </option>
        ))}
        <option value="__new__">Add a new source…</option>
      </select>

      {selected === "__new__" && (
        <div className="space-y-2.5 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
          <div className="space-y-1.5">
            <label id={`${fieldId("provider")}-label`} htmlFor={fieldId("provider")} className={labelClass}>
              Provider
            </label>
            <input
              id={fieldId("provider")}
              name={`${name}NewProvider`}
              required
              aria-labelledby={labelledBy("provider")}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label id={`${fieldId("tier")}-label`} htmlFor={fieldId("tier")} className={labelClass}>
              Tier
            </label>
            <select
              id={fieldId("tier")}
              name={`${name}NewTier`}
              required
              defaultValue=""
              aria-labelledby={labelledBy("tier")}
              className={inputClass}
            >
              <option value="" disabled>
                Choose a tier
              </option>
              {SOURCE_TIER_ORDER.map((tier) => (
                <option key={tier} value={tier}>
                  {tier} — {SOURCE_TIER_LABELS[tier]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label id={`${fieldId("url")}-label`} htmlFor={fieldId("url")} className={labelClass}>
              URL (optional)
            </label>
            <input
              id={fieldId("url")}
              name={`${name}NewUrl`}
              type="url"
              aria-labelledby={labelledBy("url")}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <label id={`${fieldId("observedOn")}-label`} htmlFor={fieldId("observedOn")} className={labelClass}>
                Observation date
              </label>
              <input
                id={fieldId("observedOn")}
                name={`${name}NewObservedOn`}
                type="date"
                required
                max={todayUtc()}
                aria-labelledby={labelledBy("observedOn")}
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
          {/* One visible heading over the two period dates, so they read
              as a pair and never get mistaken for the observation date
              next to them. */}
          <div className="space-y-1.5">
            <p id={`${fieldId("period")}-label`} className={labelClass}>
              Applicable period (optional)
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label
                  id={`${fieldId("periodStart")}-label`}
                  htmlFor={fieldId("periodStart")}
                  className="block text-xs text-zinc-600 dark:text-zinc-400"
                >
                  From
                </label>
                <input
                  id={fieldId("periodStart")}
                  name={`${name}NewApplicablePeriodStart`}
                  type="date"
                  aria-labelledby={labelledBy("period", "periodStart")}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label
                  id={`${fieldId("periodEnd")}-label`}
                  htmlFor={fieldId("periodEnd")}
                  className="block text-xs text-zinc-600 dark:text-zinc-400"
                >
                  To
                </label>
                <input
                  id={fieldId("periodEnd")}
                  name={`${name}NewApplicablePeriodEnd`}
                  type="date"
                  aria-labelledby={labelledBy("period", "periodEnd")}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
