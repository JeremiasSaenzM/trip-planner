"use client";

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

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <label htmlFor={`${name}-choice`} className={labelClass}>
        {label}
        {required ? "" : " (optional)"}
      </label>
      <select
        id={`${name}-choice`}
        name={`${name}Choice`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        {!required && <option value="">No source</option>}
        {sorted.map((source) => (
          <option key={source.id} value={source.id}>
            {source.provider} — tier {source.tier} ({formatDate(source.observedOn)})
          </option>
        ))}
        <option value="__new__">Add a new source…</option>
      </select>

      {value === "__new__" && (
        <div className="space-y-2.5 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
          <input
            name={`${name}NewProvider`}
            required
            placeholder="Provider"
            aria-label={`${label}: new source provider`}
            className={inputClass}
          />
          <select
            name={`${name}NewTier`}
            required
            defaultValue=""
            aria-label={`${label}: new source tier`}
            className={inputClass}
          >
            <option value="" disabled>
              Tier
            </option>
            {SOURCE_TIER_ORDER.map((tier) => (
              <option key={tier} value={tier}>
                {tier} — {SOURCE_TIER_LABELS[tier]}
              </option>
            ))}
          </select>
          <input
            name={`${name}NewUrl`}
            type="url"
            placeholder="URL (optional)"
            aria-label={`${label}: new source URL`}
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              name={`${name}NewObservedOn`}
              type="date"
              required
              max={todayUtc()}
              aria-label={`${label}: new source observation date`}
              className={inputClass}
            />
            <input
              name={`${name}NewNotes`}
              placeholder="Notes (optional)"
              aria-label={`${label}: new source notes`}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              name={`${name}NewApplicablePeriodStart`}
              type="date"
              placeholder="Applies from"
              aria-label={`${label}: new source applies from`}
              className={inputClass}
            />
            <input
              name={`${name}NewApplicablePeriodEnd`}
              type="date"
              placeholder="Applies until"
              aria-label={`${label}: new source applies until`}
              className={inputClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}
