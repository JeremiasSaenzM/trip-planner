import { z } from "zod";

import { id } from "./shared";

// Deliberately not validation/decisions.ts's acceptPaymentRiskInput
// shape -- that one exists to retry a write a blocking trigger just
// refused (enforce_payment_acceptance_safeguard). Flights have no such
// trigger (booked only ever records what already happened, never
// blocked -- 20261028090000's own reasoning), so recording this
// decision is a plain, one-shot write: name the option, say why.
export const createFlightRiskDecisionInput = z.object({
  flightOptionId: id,
  rationale: z.string().trim().min(1, "Say why you're accepting this risk"),
});

export type CreateFlightRiskDecisionInput = z.infer<typeof createFlightRiskDecisionInput>;
