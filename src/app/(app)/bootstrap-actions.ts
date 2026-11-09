"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import { createEventInput } from "@/lib/validation/events";
import { createScenarioInput } from "@/lib/validation/scenarios";
import { createTripInput, updateTripInput } from "@/lib/validation/trips";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";

// Server Actions for the Overview page's "no_trip"/"no_scenario" empty
// states (see bootstrap-forms.tsx), plus /trips (trips-ui.tsx). The
// hosted database starts out completely empty, so creating a trip here
// is the only way into the rest of the app. Every one of these can
// change what the trip selector on every dashboard page lists or
// highlights, so each revalidates everything under the root layout, not
// just the page it was submitted from.
function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createTrip(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = createTripInput.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createTrip(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

// /trips' rename/status form (trips-ui.tsx) -- the travel window has
// its own edit control on /scenarios (TravelWindowActions), untouched
// here.
export async function updateTrip(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = updateTripInput.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    status: formData.get("status"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateTrip(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}

export async function createEvent(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = createEventInput.safeParse({
    tripId: formData.get("tripId"),
    name: formData.get("name"),
    city: optionalText(formData.get("city")),
    country: optionalText(formData.get("country")),
    venue: optionalText(formData.get("venue")),
    startDate: optionalText(formData.get("startDate")),
    endDate: optionalText(formData.get("endDate")),
    timezone: optionalText(formData.get("timezone")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createEvent(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

export async function createScenario(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = createScenarioInput.safeParse({
    tripId: formData.get("tripId"),
    name: formData.get("name"),
    eventId: optionalText(formData.get("eventId")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createScenario(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}
