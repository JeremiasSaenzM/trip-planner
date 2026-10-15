import { z } from "zod";

import { dateNotInFuture } from "./shared";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

// Mirrors sources: tier 1 (official) through 6 (model estimate),
// sources_tier_range check (tier between 1 and 6). observed_on is
// required in the DB (not null, no default) -- a source with no
// observation date isn't a source yet, and can't be dated in the
// future (same rule as savings_entries_recorded_on_not_future -- see
// shared.ts's dateNotInFuture). applicablePeriodStart/End are both
// optional (the DB column itself, applicable_period, is nullable) --
// composeDateRange() in real.ts turns whichever are given into a
// Postgres daterange literal.
export const createSourceInput = z
  .object({
    provider: z.string().trim().min(1, "Say where this came from"),
    tier: z.number().int().min(1).max(6),
    url: z.string().trim().url().optional().or(z.literal("")),
    observedOn: dateNotInFuture,
    applicablePeriodStart: dateOnly.optional(),
    applicablePeriodEnd: dateOnly.optional(),
    notes: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.applicablePeriodStart &&
      value.applicablePeriodEnd &&
      value.applicablePeriodStart > value.applicablePeriodEnd
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["applicablePeriodEnd"],
        message: "\"Applies until\" can't be before \"Applies from\".",
      });
    }
  });

export type CreateSourceInput = z.infer<typeof createSourceInput>;
