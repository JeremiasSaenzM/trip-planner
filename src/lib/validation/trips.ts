import { z } from "zod";

import { changeReason, checkConfirmedNeedsSource, id, infoState } from "./shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

export const tripStatus = z.enum(["planning", "confirmed", "completed", "cancelled"]);

// The hosted database starts out completely empty -- this is the form
// behind the Overview page's "no_trip" empty state.
export const createTripInput = z.object({
  name: z.string().trim().min(1, "Name your trip"),
});

// Renames the trip and/or changes its status -- the travel window is a
// separate, full-row-replace write (updateTripTravelWindowInput below),
// never touched by this one.
export const updateTripInput = z.object({
  id,
  name: z.string().trim().min(1, "Name your trip"),
  status: tripStatus,
  reason: changeReason,
});

// Mirrors trips_return_after_departure,
// trips_travel_dates_confirmed_needs_source and
// trips_confirmed_travel_dates_need_dates. Either date can be left out
// while it's undecided -- a departure date alone is already enough to
// anchor the savings plan.
export const updateTripTravelWindowInput = z
  .object({
    tripId: id,
    departureDate: isoDate.optional(),
    returnDate: isoDate.optional(),
    travelDatesState: infoState,
    travelDatesSourceId: id.optional(),
    reason: changeReason,
  })
  .superRefine((value, ctx) => {
    if (value.departureDate && value.returnDate && value.returnDate < value.departureDate) {
      ctx.addIssue({
        code: "custom",
        path: ["returnDate"],
        message: "You can't come home before you leave -- check the return date.",
      });
    }
    if (value.travelDatesState === "confirmed" && (!value.departureDate || !value.returnDate)) {
      ctx.addIssue({
        code: "custom",
        path: ["departureDate"],
        message: "Confirmed travel dates need both the departure and the return date.",
      });
    }
    checkConfirmedNeedsSource(ctx, value.travelDatesState, value.travelDatesSourceId, ["travelDatesSourceId"]);
  });

export type CreateTripInput = z.infer<typeof createTripInput>;
export type UpdateTripInput = z.infer<typeof updateTripInput>;
export type UpdateTripTravelWindowInput = z.infer<typeof updateTripTravelWindowInput>;
