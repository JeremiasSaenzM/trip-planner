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
// The competition and scenario forms are reused on /scenarios to add
// more of each -- and every page's scenario selector lists them -- so
// those two revalidate everything under the root layout.
function revalidateCompetitionsAndScenarios() {
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
    city: optionalText(formData.get("city")),
    country: optionalText(formData.get("country")),
    venue: optionalText(formData.get("venue")),
    startDate: optionalText(formData.get("startDate")),
    endDate: optionalText(formData.get("endDate")),
    timezone: optionalText(formData.get("timezone")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createCompetition(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateCompetitionsAndScenarios();
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

  revalidateCompetitionsAndScenarios();
  return initialFormActionState;
}
