import { z } from "zod";

import { changeReason, checkConfirmedNeedsSource, id, infoState } from "./shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

// Mirrors scenarios_travel_dates_together and
// scenarios_return_after_departure -- either both dates are set or
// neither is, and return can't come before departure.
function checkTravelWindowTogether(
  ctx: z.RefinementCtx,
  departureDate: string | undefined,
  returnDate: string | undefined,
  departurePath: (string | number)[],
  returnPath: (string | number)[],
) {
  if ((departureDate === undefined) !== (returnDate === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: departureDate === undefined ? departurePath : returnPath,
      message: "Set both the departure and return date, or neither.",
    });
  }
  if (departureDate && returnDate && returnDate < departureDate) {
    ctx.addIssue({
      code: "custom",
      path: returnPath,
      message: "You can't come home before you leave -- check the return date.",
    });
  }
}

// competitionId is optional: a scenario can cost a competition whose
// host isn't announced yet, and be linked to one later (updateScenario
// below). includesExtension/notes describe the routing; departureDate/
// returnDate/travelDatesSourceId are accepted here mainly for import
// proposals that already know a candidate's own window -- the "create
// scenario" form itself doesn't expose them, since setting an override
// is a deliberate edit, not a creation-time field.
export const createScenarioInput = z
  .object({
    tripId: id,
    name: z.string().trim().min(1, "Name the scenario"),
    competitionId: id.optional(),
    includesExtension: z.boolean().default(false),
    notes: z.string().trim().optional(),
    departureDate: isoDate.optional(),
    returnDate: isoDate.optional(),
    travelDatesSourceId: id.optional(),
  })
  .superRefine((value, ctx) => {
    checkTravelWindowTogether(ctx, value.departureDate, value.returnDate, ["departureDate"], ["returnDate"]);
  });

// competitionId absent = unlink. update_scenario refuses to change it
// under a committed non-refundable competition payment -- the DB is the
// one that can see those, so there's no client-side mirror of that rule.
//
// departureDate/returnDate absent = inherit the trip's window. This form
// is full-row-replace (same as update_budget_line/update_stay), and both
// date inputs are required in the UI whenever it's used to set or change
// an override, so "absent" here only ever means "this scenario doesn't
// have one" -- never an accidental blank field. Clearing an override uses
// a separate action (clearScenarioTravelWindowInput below), not this one.
export const updateScenarioInput = z
  .object({
    id,
    name: z.string().trim().min(1, "Name the scenario"),
    competitionId: id.optional(),
    departureDate: isoDate.optional(),
    returnDate: isoDate.optional(),
    travelDatesState: infoState,
    travelDatesSourceId: id.optional(),
    reason: changeReason,
  })
  .superRefine((value, ctx) => {
    checkTravelWindowTogether(ctx, value.departureDate, value.returnDate, ["departureDate"], ["returnDate"]);
    if (value.travelDatesState === "confirmed" && (!value.departureDate || !value.returnDate)) {
      ctx.addIssue({
        code: "custom",
        path: ["departureDate"],
        message: "Confirmed travel dates need both the departure and the return date.",
      });
    }
    checkConfirmedNeedsSource(ctx, value.travelDatesState, value.travelDatesSourceId, ["travelDatesSourceId"]);
  });

// Reverting a scenario to the trip's window is a separate, deliberate
// action from the general edit above -- no date fields at all here, so
// there's nothing a blank field could accidentally clear. name/
// competitionId are carried through unchanged (update_scenario is a
// full-row replace); the caller reads them off the existing scenario,
// never from an editable field in this form.
export const clearScenarioTravelWindowInput = z.object({
  id,
  name: z.string().trim().min(1),
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
export type ClearScenarioTravelWindowInput = z.infer<typeof clearScenarioTravelWindowInput>;
export type DeleteScenarioInput = z.infer<typeof deleteScenarioInput>;
