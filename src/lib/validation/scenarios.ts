import { z } from "zod";

import { changeReason, id } from "./shared";

// competitionId is optional: a scenario can cost a competition whose
// host isn't announced yet, and be linked to one later (updateScenario
// below). Until it is, the payment acceptance safeguard has nothing to
// record a risk decision against (checkCanAcceptPaymentRisk() in
// decisions.ts says so), and the dashboard has no departure date.
export const createScenarioInput = z.object({
  tripId: id,
  name: z.string().trim().min(1, "Name the scenario"),
  competitionId: id.optional(),
  includesExtension: z.boolean().default(false),
  notes: z.string().trim().optional(),
});

// competitionId absent = unlink. update_scenario refuses to change it
// under a committed non-refundable competition payment -- the DB is the
// one that can see those, so there's no client-side mirror of that rule.
export const updateScenarioInput = z.object({
  id,
  name: z.string().trim().min(1, "Name the scenario"),
  competitionId: id.optional(),
  reason: changeReason,
});

// delete_scenario refuses while budget lines, payments or flight
// options reference the scenario, so this only rules out a blank reason.
export const deleteScenarioInput = z.object({
  id,
  reason: changeReason,
});

export type CreateScenarioInput = z.infer<typeof createScenarioInput>;
export type UpdateScenarioInput = z.infer<typeof updateScenarioInput>;
export type DeleteScenarioInput = z.infer<typeof deleteScenarioInput>;
