import { z } from "zod";

import { changeReason, checkConfirmedNeedsSource, id, infoState } from "./shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

// Everything but the name is optional: an event can be worth costing
// before its host city or dates are announced.
const eventFields = z.object({
  name: z.string().trim().min(1, "Name the event"),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
  venue: z.string().trim().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  timezone: z.string().trim().optional(),
  datesSourceId: id.optional(),
});

// Mirrors events_dates_together, events_end_after_start,
// events_confirmed_dates_need_dates and
// events_dates_confirmed_needs_source.
function refineEvent(
  value: z.infer<typeof eventFields> & { datesState: z.infer<typeof infoState> },
  ctx: z.RefinementCtx,
) {
  if ((value.startDate === undefined) !== (value.endDate === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: [value.startDate === undefined ? "startDate" : "endDate"],
      message: "Give both event dates (first and final day), or neither.",
    });
  }
  if (value.startDate !== undefined && value.endDate !== undefined && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "The event can't end before it starts." });
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

export const createEventInput = eventFields
  .extend({
    tripId: id,
    datesState: infoState.default("pending"),
  })
  .superRefine(refineEvent);

export const updateEventInput = eventFields
  .extend({
    id,
    datesState: infoState,
    reason: changeReason,
  })
  .superRefine(refineEvent);

export type CreateEventInput = z.infer<typeof createEventInput>;
export type UpdateEventInput = z.infer<typeof updateEventInput>;
