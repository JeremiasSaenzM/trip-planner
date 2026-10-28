import { z } from "zod";

import type { StayKind } from "@/lib/domain/types";

import { changeReason, id, infoState } from "./shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

export const stayKind = z.enum(["festival", "independent", "transit"] satisfies [StayKind, ...StayKind[]]);

// No "confirmed needs a source" refinement here -- stays_movements.sql's
// own comment explains why: the column exists so a later booking
// confirmation has somewhere to go, but nothing enforces it yet.
const stayFields = z.object({
  locationId: id,
  startDate: isoDate,
  nights: z.number().int().positive("Nights must be more than zero"),
  kind: stayKind,
  budgetLineId: id.optional(),
  informationState: infoState,
  sourceId: id.optional(),
  notes: z.string().trim().optional(),
  flightOptionId: id.optional(),
});

export const createStayInput = stayFields.extend({ scenarioId: id });
export const updateStayInput = stayFields.extend({ id, reason: changeReason });
export const deleteStayInput = z.object({ id, reason: changeReason });

export type CreateStayInput = z.infer<typeof createStayInput>;
export type UpdateStayInput = z.infer<typeof updateStayInput>;
export type DeleteStayInput = z.infer<typeof deleteStayInput>;
