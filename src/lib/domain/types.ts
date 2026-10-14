export type InfoState =
  | "confirmed"
  | "estimate"
  | "assumption"
  | "decision"
  | "pending"
  | "historical"
  | "conflicting";

export type BudgetCategory = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";

export type RateKind = "observed" | "planning_base" | "planning_conservative";

/** Target is the planning reference; conservative is the financial-safety test. */
export type Basis = "target" | "conservative";

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
