import type { ConstraintStatus } from "@/lib/domain/types";

// Three visually distinct states for the three hard-constraint checks
// (US/Canada stop, festival arrival/departure, baggage) -- never colour
// alone, so "unknown" can't be mistaken for "pass" by a colour-blind
// reading or a black-and-white printout. Each pairs its own icon, text
// label, and border style (solid vs. dashed) with its colour: a solid
// emerald check, a solid red cross, or a dashed zinc question mark.
const TONE: Record<ConstraintStatus, { icon: string; label: string; className: string }> = {
  pass: {
    icon: "✓",
    label: "Pass",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  fail: {
    icon: "✕",
    label: "Fail",
    className: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  },
  unknown: {
    icon: "?",
    label: "Unknown",
    className:
      "border-dashed border-zinc-400 bg-zinc-50 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
  },
};

export function ConstraintBadge({ status }: { status: ConstraintStatus }) {
  const tone = TONE[status];
  return (
    <span
      data-testid="constraint-badge"
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone.className}`}
    >
      <span aria-hidden="true">{tone.icon}</span>
      {tone.label}
    </span>
  );
}

// Check 4 (the acceptance safeguard) is never "fail" -- buying a
// non-refundable, competition-related ticket before acceptance isn't a
// defect in the option, it's a risk the person can choose to take. This
// renders as a statement about what buying it would mean, with its own
// icon and style (an exclamation mark in a dashed amber pill, not a
// question mark or a cross), so it reads as neither "Pass" nor "Fail"
// nor "Unknown" even though it shares the same row as those three.
export function AcceptanceSafeguardBadge({ status }: { status: "pass" | "unknown" }) {
  if (status === "pass") {
    return (
      <span
        data-testid="acceptance-safeguard-badge"
        data-status={status}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      >
        <span aria-hidden="true">✓</span> Safe to buy
      </span>
    );
  }
  return (
    <span
      data-testid="acceptance-safeguard-badge"
      data-status={status}
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
    >
      <span aria-hidden="true">!</span> Needs a decision first
    </span>
  );
}
