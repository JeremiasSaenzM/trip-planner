import { z } from "zod";

// The "I accept this risk" path: when enforce_payment_acceptance_safeguard()
// (supabase/migrations/20261012130900_payments.sql) blocks a commit/paid
// status change, the form offers this instead of bypassing the trigger.
// Submitting it inserts a decisions row (decided_by: "traveler", this
// rationale, linked to the competition) and then retries the original
// status change with riskAcceptedDecisionId set to the new row's id.
// decisions rows are plain inserts, so no change_reason is needed for
// this step -- only the payment update that follows needs one.
export const acceptPaymentRiskInput = z.object({
  paymentId: z.string().uuid(),
  tripId: z.string().uuid(),
  competitionId: z.string().uuid().nullable(),
  rationale: z.string().trim().min(1, "Say why you're accepting this risk"),
});

export type AcceptPaymentRiskInput = z.infer<typeof acceptPaymentRiskInput>;
