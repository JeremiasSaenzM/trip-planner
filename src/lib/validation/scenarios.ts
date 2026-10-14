import { z } from "zod";

import { id } from "./shared";

export const createScenarioInput = z.object({
  tripId: id,
  name: z.string().trim().min(1, "Name the scenario"),
  competitionId: id.optional(),
  includesExtension: z.boolean().default(false),
  notes: z.string().trim().optional(),
});

export type CreateScenarioInput = z.infer<typeof createScenarioInput>;
