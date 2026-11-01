"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import {
  createAccommodationOptionInput,
  deleteAccommodationOptionInput,
  updateAccommodationOptionInput,
} from "@/lib/validation/accommodation-options";

import { type FormActionState, initialFormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";
import { resolveSourceId } from "./source-actions";

// Server Actions behind the Scenario Overview page's per-stay
// accommodation section (see accommodation-write-ui.tsx). Mirrors
// flight-actions.ts's own conventions exactly.
function revalidateAll() {
  revalidatePath("/scenario");
}

export async function createAccommodationOption(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = createAccommodationOptionInput.safeParse({
    stayId: formData.get("stayId"),
    label: formData.get("label"),
    propertyName: formData.get("propertyName"),
    address: optionalText(formData.get("address")),
    rateAmount: Number(formData.get("rateAmount")),
    rateUnit: formData.get("rateUnit"),
    nights: Number(formData.get("nights")),
    mandatoryFees: Number(formData.get("mandatoryFees") || 0),
    currency: formData.get("currency"),
    refundability: formData.get("refundability"),
    cancellationDeadline: optionalText(formData.get("cancellationDeadline")),
    bookingReference: optionalText(formData.get("bookingReference")),
    conditionalRate: formData.get("conditionalRate") === "on",
    undiscountedAmount: formData.get("undiscountedAmount")
      ? Number(formData.get("undiscountedAmount"))
      : undefined,
    isHostel: formData.get("isHostel") === "on",
    sourceId,
    observedOn: formData.get("observedOn"),
    informationState: formData.get("informationState"),
    notes: optionalText(formData.get("notes")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createAccommodationOption(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}

export async function updateAccommodationOption(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = updateAccommodationOptionInput.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    propertyName: formData.get("propertyName"),
    address: optionalText(formData.get("address")),
    rateAmount: Number(formData.get("rateAmount")),
    rateUnit: formData.get("rateUnit"),
    nights: Number(formData.get("nights")),
    mandatoryFees: Number(formData.get("mandatoryFees") || 0),
    currency: formData.get("currency"),
    status: formData.get("status"),
    refundability: formData.get("refundability"),
    cancellationDeadline: optionalText(formData.get("cancellationDeadline")),
    bookingReference: optionalText(formData.get("bookingReference")),
    conditionalRate: formData.get("conditionalRate") === "on",
    undiscountedAmount: formData.get("undiscountedAmount")
      ? Number(formData.get("undiscountedAmount"))
      : undefined,
    isHostel: formData.get("isHostel") === "on",
    sourceId,
    observedOn: formData.get("observedOn"),
    informationState: formData.get("informationState"),
    notes: optionalText(formData.get("notes")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateAccommodationOption(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}

export async function deleteAccommodationOption(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = deleteAccommodationOptionInput.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.deleteAccommodationOption(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}
