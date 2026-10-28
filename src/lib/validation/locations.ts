import { z } from "zod";

import { changeReason, id } from "./shared";

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

// Mirrors locations' own before-insert-or-update trigger (validated
// against pg_timezone_names, 20261029090000) -- the form-side half of
// that same rule, so a typo like "Europe/Pairs" shows up before the
// request reaches the database, same reasoning as changeReason below.
export const ianaTimezone = z
  .string()
  .refine((value) => VALID_TIMEZONES.has(value), "Not a recognized time zone");

const locationFields = z.object({
  name: z.string().trim().min(1, "Say what to call this place"),
  timezone: ianaTimezone.optional(),
  notes: z.string().trim().optional(),
});

export const createLocationInput = locationFields;
export const updateLocationInput = locationFields.extend({ id, reason: changeReason });
export const deleteLocationInput = z.object({ id, reason: changeReason });

export type CreateLocationInput = z.infer<typeof createLocationInput>;
export type UpdateLocationInput = z.infer<typeof updateLocationInput>;
export type DeleteLocationInput = z.infer<typeof deleteLocationInput>;
