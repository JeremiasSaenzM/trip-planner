import { z } from "zod";

import type { PaymentStatus } from "@/lib/data/types";

import { id } from "./shared";

const paymentStatus = z.enum(["planned", "committed", "paid", "cancelled"] satisfies [
  PaymentStatus,
  ...PaymentStatus[],
]);

// The "I accept this risk" path: when enforce_payment_acceptance_safeguard()
// (supabase/migrations/20261012130900_payments.sql) blocks a commit/paid
// status change, the form offers this instead of bypassing the trigger.
// Submitting it inserts a decisions row (decided_by: "traveler", this
// rationale, linked to the competition) and then retries the original
// status change with riskAcceptedDecisionId set to the new row's id.
// decisions rows are plain inserts, so no change_reason is needed for
// this step -- only the payment update that follows needs one.
//
// competitionId is required, not optional: the trigger only ever matches
// a traveler decision "where d.competition_id is not distinct from
// v_competition_id" -- a decision with no competition can only satisfy a
// payment whose scenario *also* has no competition, which is exactly the
// case checkCanAcceptPaymentRisk() below blocks before this form even
// shows. There is no scenario where a null competitionId here leads to
// a decision that unblocks anything.
export const acceptPaymentRiskInput = z.object({
  paymentId: id,
  tripId: id,
  competitionId: id,
  rationale: z.string().trim().min(1, "Say why you're accepting this risk"),
  // The status the original, blocked attempt was trying to reach --
  // carried through as a hidden field so accepting the risk can retry
  // that exact transition once the decision exists, instead of asking
  // the person to choose it again.
  targetStatus: paymentStatus,
});

export type AcceptPaymentRiskInput = z.infer<typeof acceptPaymentRiskInput>;

export type CanAcceptPaymentRiskResult = { ok: true } | { ok: false; message: string };

/**
 * Whether the "I accept this risk" form can even be shown for a given
 * payment. The safeguard trigger can only be satisfied by a decision
 * linked to the *same* competition as the payment's scenario -- if that
 * scenario has no competition yet, there is nothing for a decision to
 * link to, so accepting the risk can never unblock the payment. Call
 * this with the payment's scenario's competitionId before rendering the
 * form, not after the person has already typed a rationale.
 */
export function checkCanAcceptPaymentRisk(scenarioCompetitionId: string | null): CanAcceptPaymentRiskResult {
  if (!scenarioCompetitionId) {
    return {
      ok: false,
      message:
        "This payment belongs to a scenario with no competition, so the acceptance safeguard can't be " +
        "satisfied. Link a competition to the scenario first.",
    };
  }
  return { ok: true };
}
