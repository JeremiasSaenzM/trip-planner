export type InfoState =
  | "confirmed"
  | "estimate"
  | "assumption"
  | "decision"
  | "pending"
  | "historical"
  | "conflicting";

export type BudgetCategory = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";

/** How well-founded a budget line's number is (planning system 07 §8).
 * Separate from InfoState, which says what kind of claim a value is. */
export type Confidence = "low" | "medium" | "high";

export type RateKind = "observed" | "planning_base" | "planning_conservative";

/** Target is the planning reference; conservative is the financial-safety
 * test (07 §7). Minimum is neither: it's the floor of what's actually
 * been observed, viewable but never the default. Ordered low to high. */
export const BASES = ["minimum", "target", "conservative"] as const;
export type Basis = (typeof BASES)[number];

export type FlightBaggage = "included" | "paid_addon" | "not_allowed" | "unknown";

export type ConstraintStatus = "pass" | "fail" | "unknown";

export type HardConstraintResult = {
  status: ConstraintStatus;
  reasons: string[];
};

/** fail outranks unknown, which outranks pass -- a definite problem is
 * never hidden behind a merely-missing piece of information elsewhere. */
export function worstStatus(statuses: ConstraintStatus[]): ConstraintStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("unknown")) return "unknown";
  return "pass";
}
