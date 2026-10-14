import { z } from "zod";

import { checkConfirmedNeedsSource, infoState } from "./shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

// Mirrors competitions: competitions_end_after_start (end_date >=
// start_date) and competitions_dates_confirmed_needs_source.
export const createCompetitionInput = z
  .object({
    tripId: z.string().uuid(),
    name: z.string().trim().min(1, "Name the competition"),
    city: z.string().trim().min(1),
    country: z.string().trim().min(1),
    venue: z.string().trim().optional(),
    startDate: isoDate,
    endDate: isoDate,
    timezone: z.string().trim().min(1, "Pick the competition's own time zone, e.g. Europe/Paris"),
    datesState: infoState.default("pending"),
    datesSourceId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "The festival can't end before it starts." });
    }
    checkConfirmedNeedsSource(ctx, value.datesState, value.datesSourceId, ["datesSourceId"]);
  });

export type CreateCompetitionInput = z.infer<typeof createCompetitionInput>;
