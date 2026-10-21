"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import { updateCompetitionInput } from "@/lib/validation/competitions";
import { deleteScenarioInput, updateScenarioInput } from "@/lib/validation/scenarios";
import { updateTripTravelWindowInput } from "@/lib/validation/trips";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";
import { resolveSourceId } from "./source-actions";

// Server Actions behind /scenarios' edit and delete forms (see
// scenarios-ui.tsx). Adding a competition or a scenario reuses
// bootstrap-actions.ts. Every one of these goes through an RPC that sets
// app.change_reason (20261019090000_manage_competitions_scenarios.sql).
//
// A competition's dates drive Overview, Payments and Deadlines, and every
// page's scenario selector lists scenarios by name -- so each action
// revalidates everything under the root layout, not one page.
function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function updateCompetition(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let datesSourceId: string | undefined;
  try {
    datesSourceId = await resolveSourceId(formData, "datesSource");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = updateCompetitionInput.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    city: optionalText(formData.get("city")),
    country: optionalText(formData.get("country")),
    venue: optionalText(formData.get("venue")),
    startDate: optionalText(formData.get("startDate")),
    endDate: optionalText(formData.get("endDate")),
    timezone: optionalText(formData.get("timezone")),
    datesState: formData.get("datesState"),
    datesSourceId,
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateCompetition(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  // The row doesn't unmount on success (same id), so the form needs
  // "success" to switch itself back to view mode -- same as
  // updateBudgetLine.
  return { status: "success" };
}

export async function updateScenario(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = updateScenarioInput.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    competitionId: optionalText(formData.get("competitionId")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateScenario(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}

export async function deleteScenario(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = deleteScenarioInput.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.deleteScenario(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

// The trip's travel window. Its departure date moves every savings
// deadline (resolveDepartureDate()), so -- like the competition edits
// above -- this revalidates everything.
export async function updateTripTravelWindow(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let travelDatesSourceId: string | undefined;
  try {
    travelDatesSourceId = await resolveSourceId(formData, "travelDatesSource");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = updateTripTravelWindowInput.safeParse({
    tripId: formData.get("tripId"),
    departureDate: optionalText(formData.get("departureDate")),
    returnDate: optionalText(formData.get("returnDate")),
    travelDatesState: formData.get("travelDatesState"),
    travelDatesSourceId,
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateTripTravelWindow(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}
