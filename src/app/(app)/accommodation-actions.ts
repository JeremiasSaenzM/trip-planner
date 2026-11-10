"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import { checkObservationCoversStay, describeObservationMismatch } from "@/lib/domain/check-observation-covers-stay";
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

// Refuses the write before it ever reaches dataSource -- an
// unfounded figure is a defect, not something to flag after the
// fact (Phase 6.11). The database trigger on accommodation_options
// is the backstop this mirrors; this check just gives the form a
// readable message instead of a round trip.
async function checkAgainstStay(stayId: string, observedStartDate: string | undefined, nights: number) {
  const stays = await dataSource.getStays();
  const stay = stays.find((candidate) => candidate.id === stayId);
  if (!stay) return null;

  const result = checkObservationCoversStay({
    option: { observedStartDate: observedStartDate ?? null, nights },
    stay: { startDate: stay.startDate, nights: stay.nights },
  });
  if (result.status === "ok" || result.status === "undated") return null;
  return describeObservationMismatch(result);
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
    observedStartDate: optionalText(formData.get("observedStartDate")),
    informationState: formData.get("informationState"),
    notes: optionalText(formData.get("notes")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  const mismatch = await checkAgainstStay(parsed.data.stayId, parsed.data.observedStartDate, parsed.data.nights);
  if (mismatch) return { status: "error", message: mismatch };

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
    observedStartDate: optionalText(formData.get("observedStartDate")),
    informationState: formData.get("informationState"),
    notes: optionalText(formData.get("notes")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  const existing = (await dataSource.getAccommodationOptions()).find((option) => option.id === parsed.data.id);
  if (existing) {
    const mismatch = await checkAgainstStay(existing.stayId, parsed.data.observedStartDate, parsed.data.nights);
    if (mismatch) return { status: "error", message: mismatch };
  }

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
