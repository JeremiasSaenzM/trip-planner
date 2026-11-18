// Which pair of savings charts the dashboard shows -- ?savings= in the
// URL, carried between pages like ?basis= (dashboard-query.ts).
//
// This is the start of Phase 7's saving-method selector ("flat / one
// phase at a time / one pot per payment; show only that chart; the
// headline follows the choice"), not a one-off toggle. A new method is
// one more entry in SAVINGS_VIEWS plus its label; every place that
// renders charts per view takes a Record<SavingsView, ...>, so TypeScript
// refuses to build until the new view has its charts.
export const SAVINGS_VIEWS = ["by-deadline", "running-total"] as const;

export type SavingsView = (typeof SAVINGS_VIEWS)[number];

export const DEFAULT_SAVINGS_VIEW: SavingsView = "by-deadline";

// Plain words, not the app's own vocabulary ("pots", "cumulative").
export const SAVINGS_VIEW_LABELS: Record<SavingsView, string> = {
  "by-deadline": "By deadline",
  "running-total": "Running total",
};

/** ?savings= as a SavingsView. Anything else, or nothing, is the default. */
export function parseSavingsView(value: unknown): SavingsView {
  return typeof value === "string" && (SAVINGS_VIEWS as readonly string[]).includes(value)
    ? (value as SavingsView)
    : DEFAULT_SAVINGS_VIEW;
}
