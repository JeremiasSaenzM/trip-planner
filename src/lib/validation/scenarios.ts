import { z } from "zod";

import { id } from "./shared";

// competitionId is required (the scenarios table itself allows a null
// one -- a shared budget scenario with no single competition yet is a
// legitimate later state). This form is the only thing that creates a
// scenario today, and a competition-less one dead-ends at
// checkCanAcceptPaymentRisk() the moment any payment needs the
// acceptance safeguard, so requiring it here avoids creating a scenario
// that can't support that path from the start.
export const createScenarioInput = z.object({
  tripId: id,
  name: z.string().trim().min(1, "Name the scenario"),
  competitionId: id,
  includesExtension: z.boolean().default(false),
  notes: z.string().trim().optional(),
});

export type CreateScenarioInput = z.infer<typeof createScenarioInput>;
