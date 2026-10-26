import { z } from "zod";

import type { FlightDirection } from "@/lib/data/types";

import { changeReason, id } from "./shared";

export const flightDirection = z.enum(["outbound", "return"] satisfies [FlightDirection, ...FlightDirection[]]);

export const airportCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter airport code (e.g. CDG)");
export const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a 2-letter country code (e.g. FR)");
// Luxon's own ISO parser (used throughout src/lib/domain) accepts an
// offset or "Z"; a bare local time with no offset would silently be
// read as UTC, which is exactly the kind of mistake checkUsCanadaStop/
// checkFestivalArrivalDeparture can't catch after the fact.
export const isoInstant = z
  .string()
  .refine((value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value), "Include a time zone offset (e.g. +02:00 or Z)");

export const createFlightSegmentInput = z.object({
  flightOptionId: id,
  direction: flightDirection,
  segmentOrder: z.number().int().positive(),
  fromAirport: airportCode,
  toAirport: airportCode,
  fromCountry: countryCode,
  toCountry: countryCode,
  flightNumber: z.string().trim().optional(),
  departAt: isoInstant,
  arriveAt: isoInstant,
  isTechnicalStop: z.boolean(),
});

export const deleteFlightSegmentInput = z.object({ id, reason: changeReason });

export type CreateFlightSegmentInput = z.infer<typeof createFlightSegmentInput>;
export type DeleteFlightSegmentInput = z.infer<typeof deleteFlightSegmentInput>;
