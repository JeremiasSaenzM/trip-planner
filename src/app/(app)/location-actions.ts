"use server";

import { dataSource } from "@/lib/data";
import { createLocationInput } from "@/lib/validation/locations";

import { optionalText } from "./server-action-helpers";

// Shared by every write form that needs a locationId: LocationPicker
// (itinerary-write-ui.tsx) submits "${name}Choice" plus "${name}New*"
// sub-fields, and this reads exactly those back off the FormData. Same
// shape as resolveSourceId (source-actions.ts): a separate, sequential
// write when a new location is needed, not part of whatever RPC/
// transaction the stay or movement itself goes through.
//
// Unlike resolveSourceId, the result here is never allowed to be
// undefined to the caller -- locationId/fromLocationId/toLocationId
// are required fields -- so LocationPicker never renders an empty
// "no location" choice (see required={true}, always, there).
export async function resolveLocationId(formData: FormData, name: string): Promise<string> {
  const choice = String(formData.get(`${name}Choice`) ?? "");
  if (choice !== "__new__") return choice;

  const parsed = createLocationInput.safeParse({
    name: formData.get(`${name}NewName`),
    timezone: optionalText(formData.get(`${name}NewTimezone`)),
    notes: optionalText(formData.get(`${name}NewNotes`)),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "That new location doesn't look right.");
  }

  const location = await dataSource.createLocation(parsed.data);
  return location.id;
}
