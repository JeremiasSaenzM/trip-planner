import { z } from "zod";

import { changeReason, checkConfirmedNeedsSource, id, infoState } from "./shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

// Everything but the name is optional: a competition can be worth
// costing before its host city or festival dates are announced.
const competitionFields = z.object({
  name: z.string().trim().min(1, "Name the competition"),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
  venue: z.string().trim().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  timezone: z.string().trim().optional(),
  datesSourceId: id.optional(),
});

// Mirrors competitions_dates_together, competitions_end_after_start,
// competitions_confirmed_dates_need_dates and
// competitions_dates_confirmed_needs_source.
function refineCompetition(
  value: z.infer<typeof competitionFields> & { datesState: z.infer<typeof infoState> },
  ctx: z.RefinementCtx,
) {
  if ((value.startDate === undefined) !== (value.endDate === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: [value.startDate === undefined ? "startDate" : "endDate"],
      message: "Give both festival dates (first and final day), or neither.",
    });
  }
  if (value.startDate !== undefined && value.endDate !== undefined && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "The festival can't end before it starts." });
  }
  if (value.datesState === "confirmed" && value.startDate === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["startDate"],
      message: "Confirmed dates need the dates themselves -- add them, or leave the dates pending.",
    });
  }
  checkConfirmedNeedsSource(ctx, value.datesState, value.datesSourceId, ["datesSourceId"]);
}

export const createCompetitionInput = competitionFields
  .extend({
    tripId: id,
    datesState: infoState.default("pending"),
  })
  .superRefine(refineCompetition);

// acceptanceStatus is deliberately not a field here -- accepting a
// competition lifts the non-refundable-payment safeguard, so it gets its
// own flow (see update_competition's comment in
// 20261019090000_manage_competitions_scenarios.sql).
export const updateCompetitionInput = competitionFields
  .extend({
    id,
    datesState: infoState,
    reason: changeReason,
  })
  .superRefine(refineCompetition);

export type CreateCompetitionInput = z.infer<typeof createCompetitionInput>;
export type UpdateCompetitionInput = z.infer<typeof updateCompetitionInput>;
