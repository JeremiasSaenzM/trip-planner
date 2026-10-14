import { z } from "zod";

export const createScenarioInput = z.object({
  tripId: z.string().uuid(),
  name: z.string().trim().min(1, "Name the scenario"),
  competitionId: z.string().uuid().optional(),
  includesExtension: z.boolean().default(false),
  notes: z.string().trim().optional(),
});

export type CreateScenarioInput = z.infer<typeof createScenarioInput>;
