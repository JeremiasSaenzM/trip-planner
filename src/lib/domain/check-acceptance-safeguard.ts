import type { Refundability } from "@/lib/data/types";

export type AcceptanceSafeguardInput = {
  refundability: Refundability;
  competitionRelated: boolean;
  /** competitions.acceptance_status === 'accepted'. */
  competitionAccepted: boolean;
  /** A decisions row names this exact option (decisions.flight_option_id). */
  riskAccepted: boolean;
};

export type AcceptanceSafeguardResult = {
  // Never "fail" -- this is a statement of what buying the ticket would
  // mean, not a defect in the option itself. "unknown" means "this
  // can't be bought without deciding something first", same reading as
  // a missing date elsewhere in this file.
  status: "pass" | "unknown";
  requiresAcceptance: boolean;
  reasons: string[];
};

/**
 * Check 4 / hard constraint 3: no non-refundable competition-related
 * commitment before the choir is officially accepted, unless the risk
 * is explicitly accepted. Mirrors
 * enforce_payment_acceptance_safeguard() (20261015090000) exactly,
 * including which refundability values count as "non-refundable" here:
 * 'non_refundable' and 'unknown' both do -- an unrecorded refundability
 * is not assumed to be the safe kind. Unlike that trigger, nothing here
 * blocks booking: booked only ever records what already happened
 * (see delete_scenario_cascade's own reasoning), so this only reports
 * the result for the UI to show before a purchase, never to refuse one
 * after.
 */
export function checkAcceptanceSafeguard(input: AcceptanceSafeguardInput): AcceptanceSafeguardResult {
  const nonRefundable = input.refundability === "non_refundable" || input.refundability === "unknown";

  if (!nonRefundable || !input.competitionRelated) {
    return {
      status: "pass",
      requiresAcceptance: false,
      reasons: [
        !input.competitionRelated
          ? "not competition-related"
          : "refundable or partially refundable -- no commitment at risk",
      ],
    };
  }

  if (input.competitionAccepted) {
    return { status: "pass", requiresAcceptance: false, reasons: ["the competition is accepted"] };
  }
  if (input.riskAccepted) {
    return { status: "pass", requiresAcceptance: false, reasons: ["this ticket's risk has been explicitly accepted"] };
  }

  return {
    status: "unknown",
    requiresAcceptance: true,
    reasons: [
      "a non-refundable (or unknown-refundability), competition-related commitment, but the competition isn't " +
        "accepted yet and this ticket's risk hasn't been accepted either",
    ],
  };
}
