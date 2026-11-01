import { z } from "zod";

import type { AccommodationOptionStatus } from "@/lib/data/types";
import type { AccommodationRateUnit } from "@/lib/domain/types";

import { refundability } from "./payments";
import { changeReason, currencyCode, id, infoState } from "./shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

export const accommodationRateUnit = z.enum([
  "per_night",
  "per_stay",
] satisfies [AccommodationRateUnit, ...AccommodationRateUnit[]]);

export const accommodationOptionStatus = z.enum([
  "candidate",
  "selected",
  "rejected",
  "booked",
] satisfies [AccommodationOptionStatus, ...AccommodationOptionStatus[]]);

// No "confirmed needs a source" refinement -- sourceId is required
// unconditionally here, same reasoning as flight_options: "never
// invent a source" applies to every rate, not only a confirmed one.
const accommodationOptionFields = z
  .object({
    label: z.string().trim().min(1, "Give this option a short label"),
    propertyName: z.string().trim().min(1, "Give this option a property name"),
    address: z.string().trim().optional(),
    rateAmount: z.number().nonnegative(),
    rateUnit: accommodationRateUnit,
    nights: z.number().int().positive(),
    mandatoryFees: z.number().nonnegative(),
    currency: currencyCode,
    refundability,
    cancellationDeadline: isoDate.optional(),
    bookingReference: z.string().trim().optional(),
    conditionalRate: z.boolean(),
    // Enforced client-side too, not just by the conditional_rate
    // check constraint in the migration: a confusing partial submit
    // shouldn't need a round trip to the database to catch.
    undiscountedAmount: z.number().nonnegative().optional(),
    isHostel: z.boolean(),
    informationState: infoState,
    sourceId: id,
    observedOn: isoDate,
    notes: z.string().trim().optional(),
  })
  .refine((value) => !value.conditionalRate || value.undiscountedAmount !== undefined, {
    message: "A conditional rate needs the undiscounted amount it's conditional on",
    path: ["undiscountedAmount"],
  });

export const createAccommodationOptionInput = accommodationOptionFields.and(z.object({ stayId: id }));
export const updateAccommodationOptionInput = accommodationOptionFields.and(
  z.object({ id, status: accommodationOptionStatus, reason: changeReason }),
);
export const deleteAccommodationOptionInput = z.object({ id, reason: changeReason });

export type CreateAccommodationOptionInput = z.infer<typeof createAccommodationOptionInput>;
export type UpdateAccommodationOptionInput = z.infer<typeof updateAccommodationOptionInput>;
export type DeleteAccommodationOptionInput = z.infer<typeof deleteAccommodationOptionInput>;
