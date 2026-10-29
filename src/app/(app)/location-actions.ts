"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import { createLocationInput, updateLocationInput } from "@/lib/validation/locations";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";

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

// Edits an existing location in place -- name, timezone, notes -- the
// only form that reaches update_location/updateLocation (resolveLocationId
// above only ever creates). Lives wherever a location shows "(no time
// zone yet)" (itinerary-write-ui.tsx's LocationList), so the fact and the
// fix are on the same page, not split across a dedicated route nobody
// would otherwise visit.
export async function updateLocation(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = updateLocationInput.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    timezone: optionalText(formData.get("timezone")),
    notes: optionalText(formData.get("notes")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateLocation(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidatePath("/scenario");
  return { status: "success" };
}
