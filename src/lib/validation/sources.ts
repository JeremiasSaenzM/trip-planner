import { z } from "zod";

// Mirrors sources: tier 1 (official) through 6 (model estimate),
// sources_tier_range check (tier between 1 and 6). observed_on is
// required in the DB (not null, no default) -- a source with no
// observation date isn't a source yet.
export const createSourceInput = z.object({
  provider: z.string().trim().min(1, "Say where this came from"),
  tier: z.number().int().min(1).max(6),
  url: z.string().trim().url().optional().or(z.literal("")),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
  notes: z.string().trim().optional(),
});

export type CreateSourceInput = z.infer<typeof createSourceInput>;
