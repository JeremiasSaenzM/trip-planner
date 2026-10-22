"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import {
  createMovementInput,
  deleteMovementInput,
  updateMovementInput,
} from "@/lib/validation/movements";
import { createStayInput, deleteStayInput, updateStayInput } from "@/lib/validation/stays";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";
import { resolveSourceId } from "./source-actions";

// Server Actions behind the Scenario Overview page's Itinerary section
// (see itinerary-write-ui.tsx). Creating a stay or a movement is a
// plain insert, same reasoning as createBudgetLine -- nothing existed
// before to justify changing. Editing and deleting both go through
// RPCs that set app.change_reason (20261023090000_stays_movements.sql).
function revalidateAll() {
  revalidatePath("/scenario");
}

export async function createStay(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = createStayInput.safeParse({
    scenarioId: formData.get("scenarioId"),
    location: formData.get("location"),
    startDate: formData.get("startDate"),
    nights: Number(formData.get("nights")),
    kind: formData.get("kind"),
    budgetLineId: optionalText(formData.get("budgetLineId")),
    informationState: formData.get("informationState"),
    sourceId,
    notes: optionalText(formData.get("notes")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createStay(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

export async function updateStay(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = updateStayInput.safeParse({
    id: formData.get("id"),
    location: formData.get("location"),
    startDate: formData.get("startDate"),
    nights: Number(formData.get("nights")),
    kind: formData.get("kind"),
    budgetLineId: optionalText(formData.get("budgetLineId")),
    informationState: formData.get("informationState"),
    sourceId,
    notes: optionalText(formData.get("notes")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateStay(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}

export async function deleteStay(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = deleteStayInput.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.deleteStay(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

export async function createMovement(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = createMovementInput.safeParse({
    scenarioId: formData.get("scenarioId"),
    sequence: Number(formData.get("sequence")),
    fromLocation: formData.get("fromLocation"),
    toLocation: formData.get("toLocation"),
    departDate: formData.get("departDate"),
    departTime: optionalText(formData.get("departTime")),
    arriveDate: formData.get("arriveDate"),
    arriveTime: optionalText(formData.get("arriveTime")),
    mode: formData.get("mode"),
    budgetLineId: optionalText(formData.get("budgetLineId")),
    bookingReference: optionalText(formData.get("bookingReference")),
    informationState: formData.get("informationState"),
    sourceId,
    notes: optionalText(formData.get("notes")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createMovement(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

export async function updateMovement(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = updateMovementInput.safeParse({
    id: formData.get("id"),
    sequence: Number(formData.get("sequence")),
    fromLocation: formData.get("fromLocation"),
    toLocation: formData.get("toLocation"),
    departDate: formData.get("departDate"),
    departTime: optionalText(formData.get("departTime")),
    arriveDate: formData.get("arriveDate"),
    arriveTime: optionalText(formData.get("arriveTime")),
    mode: formData.get("mode"),
    budgetLineId: optionalText(formData.get("budgetLineId")),
    bookingReference: optionalText(formData.get("bookingReference")),
    informationState: formData.get("informationState"),
    sourceId,
    notes: optionalText(formData.get("notes")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateMovement(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}

export async function deleteMovement(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = deleteMovementInput.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.deleteMovement(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}
