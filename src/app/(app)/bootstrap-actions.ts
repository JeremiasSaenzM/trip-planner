"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import { createCompetitionInput } from "@/lib/validation/competitions";
import { createScenarioInput } from "@/lib/validation/scenarios";
import { createTripInput } from "@/lib/validation/trips";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";

// Server Actions for the Overview page's "no_trip"/"no_scenario" empty
// states (see bootstrap-forms.tsx). The hosted database starts out
// completely empty, so this is the only way into the rest of the app.

export async function createTrip(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = createTripInput.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createTrip(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidatePath("/");
  return initialFormActionState;
}

export async function createCompetition(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = createCompetitionInput.safeParse({
    tripId: formData.get("tripId"),
    name: formData.get("name"),
    city: formData.get("city"),
    country: formData.get("country"),
    venue: optionalText(formData.get("venue")),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createCompetition(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidatePath("/");
  return initialFormActionState;
}

export async function createScenario(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = createScenarioInput.safeParse({
    tripId: formData.get("tripId"),
    name: formData.get("name"),
    competitionId: optionalText(formData.get("competitionId")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createScenario(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidatePath("/");
  return initialFormActionState;
}
