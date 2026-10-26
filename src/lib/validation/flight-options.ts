import { z } from "zod";

import type { FlightOptionStatus } from "@/lib/data/types";
import type { FlightBaggage } from "@/lib/domain/types";

import { refundability } from "./payments";
import { changeReason, currencyCode, id, infoState } from "./shared";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

export const flightBaggage = z.enum([
  "included",
  "paid_addon",
  "not_allowed",
  "unknown",
] satisfies [FlightBaggage, ...FlightBaggage[]]);

export const flightOptionStatus = z.enum([
  "candidate",
  "selected",
  "rejected",
  "booked",
] satisfies [FlightOptionStatus, ...FlightOptionStatus[]]);

// No "confirmed needs a source" refinement -- sourceId is required
// unconditionally here, same reasoning as flight_options itself
// (20261012131300): "never invent a source" applies to every flight
// fare, not only a confirmed one.
const flightOptionFields = z.object({
  label: z.string().trim().min(1, "Give this option a short label"),
  fare: z.number().nonnegative(),
  bagFee: z.number().nonnegative(),
  mandatoryFees: z.number().nonnegative(),
  currency: currencyCode,
  informationState: infoState,
  sourceId: id,
  observedOn: isoDate,
  baggage: flightBaggage,
  separateTickets: z.boolean(),
  refundability,
  competitionRelated: z.boolean(),
  notes: z.string().trim().optional(),
});

export const createFlightOptionInput = flightOptionFields.extend({ scenarioId: id });
export const updateFlightOptionInput = flightOptionFields.extend({
  id,
  status: flightOptionStatus,
  bookingReference: z.string().trim().optional(),
  reason: changeReason,
});
export const deleteFlightOptionInput = z.object({ id, reason: changeReason });

export type CreateFlightOptionInput = z.infer<typeof createFlightOptionInput>;
export type UpdateFlightOptionInput = z.infer<typeof updateFlightOptionInput>;
export type DeleteFlightOptionInput = z.infer<typeof deleteFlightOptionInput>;
