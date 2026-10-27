import { z } from "zod";

import { id } from "./shared";

// Deliberately not validation/decisions.ts's acceptPaymentRiskInput
// shape -- that one exists to retry a write a blocking trigger just
// refused (enforce_payment_acceptance_safeguard). Flights have no such
// trigger (booked only ever records what already happened, never
// blocked -- 20261028090000's own reasoning), so recording this
// decision is a plain, one-shot write: name the option, say why.
// tripId/competitionId are hidden fields the page fills in from data it
// already has (same reasoning as AcceptRiskForm's own hidden fields in
// payment-write-ui.tsx), not re-derived from a lookup inside the action.
export const createFlightRiskDecisionInput = z.object({
  tripId: id,
  competitionId: id,
  flightOptionId: id,
  optionLabel: z.string().trim().min(1),
  rationale: z.string().trim().min(1, "Say why you're accepting this risk"),
});

export type CreateFlightRiskDecisionInput = z.infer<typeof createFlightRiskDecisionInput>;

export type CanAcceptFlightRiskResult = { ok: true } | { ok: false; message: string };

// Mirrors checkCanAcceptPaymentRisk() in decisions.ts: createFlightRiskDecision's
// write requires a competitionId (CreateFlightRiskDecisionWrite in
// src/lib/data/types.ts), so a scenario with no competition has nothing
// for this decision to name -- call this before rendering the "accept
// this risk" form, not after a rationale has already been typed.
export function checkCanAcceptFlightRisk(scenarioCompetitionId: string | null): CanAcceptFlightRiskResult {
  if (!scenarioCompetitionId) {
    return {
      ok: false,
      message: "This scenario has no competition linked, so there's nothing for a risk-acceptance decision to name.",
    };
  }
  return { ok: true };
}
