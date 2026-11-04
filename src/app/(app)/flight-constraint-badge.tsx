import type { ConstraintStatus } from "@/lib/domain/types";

// Four visually distinct states for the three hard-constraint checks
// (US/Canada stop, event presence, baggage) -- never colour alone, so
// "unknown" can't be mistaken for "pass" by a colour-blind reading or a
// black-and-white printout. Each pairs its own icon, text label, and
// border style with its colour: a solid emerald check, a solid red
// cross, a dashed zinc question mark for "unknown" (a fact is missing,
// could still resolve either way), or a solid zinc dash for
// "not_applicable" (nothing to resolve -- settled, not missing, so it
// gets a solid border like pass/fail rather than unknown's dashed one,
// while staying the same neutral colour as unknown so it never reads as
// a problem).
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
  not_applicable: {
    icon: "–",
    label: "Not applicable",
    className:
      "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
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
