import { z } from "zod";

import type { MovementMode } from "@/lib/data/types";

import { changeReason, id, infoState } from "./shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use an HH:MM time");

export const movementMode = z.enum([
  "plane",
  "train",
  "bus",
  "ferry",
  "car",
  "other",
] satisfies [MovementMode, ...MovementMode[]]);

const movementFields = z.object({
  sequence: z.number().int(),
  fromLocation: z.string().trim().min(1, "Say where this leg starts"),
  toLocation: z.string().trim().min(1, "Say where this leg ends"),
  departDate: isoDate,
  departTime: isoTime.optional(),
  arriveDate: isoDate,
  arriveTime: isoTime.optional(),
  mode: movementMode,
  budgetLineId: id.optional(),
  bookingReference: z.string().trim().optional(),
  informationState: infoState,
  sourceId: id.optional(),
  notes: z.string().trim().optional(),
  flightOptionId: id.optional(),
});

// Mirrors movements_arrive_after_depart.
function refineMovement(value: z.infer<typeof movementFields>, ctx: z.RefinementCtx) {
  if (value.arriveDate < value.departDate) {
    ctx.addIssue({ code: "custom", path: ["arriveDate"], message: "Arrival can't be before departure." });
  }
}

export const createMovementInput = movementFields.extend({ scenarioId: id }).superRefine(refineMovement);
export const updateMovementInput = movementFields.extend({ id, reason: changeReason }).superRefine(refineMovement);
export const deleteMovementInput = z.object({ id, reason: changeReason });

export type CreateMovementInput = z.infer<typeof createMovementInput>;
export type UpdateMovementInput = z.infer<typeof updateMovementInput>;
export type DeleteMovementInput = z.infer<typeof deleteMovementInput>;
