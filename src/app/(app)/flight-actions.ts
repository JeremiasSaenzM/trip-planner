"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import { createFlightRiskDecisionInput } from "@/lib/validation/flight-risk-decisions";
import {
  createFlightOptionInput,
  deleteFlightOptionInput,
  updateFlightOptionInput,
} from "@/lib/validation/flight-options";
import { createFlightSegmentInput, deleteFlightSegmentInput } from "@/lib/validation/flight-segments";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";
import { resolveSourceId } from "./source-actions";

// Server Actions behind the Scenario Overview page's Flight options
// section (see flight-write-ui.tsx). Mirrors itinerary-actions.ts's own
// conventions exactly: resolve a source first, Zod-parse the rest of
// FormData, call the matching dataSource write, translate Postgres
// errors, revalidate, report success/error.
function revalidateAll() {
  revalidatePath("/scenario");
}

export async function createFlightOption(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = createFlightOptionInput.safeParse({
    scenarioId: formData.get("scenarioId"),
    label: formData.get("label"),
    fare: Number(formData.get("fare")),
    bagFee: Number(formData.get("bagFee") || 0),
    mandatoryFees: Number(formData.get("mandatoryFees") || 0),
    currency: formData.get("currency"),
    informationState: formData.get("informationState"),
    sourceId,
    observedOn: formData.get("observedOn"),
    baggage: formData.get("baggage"),
    separateTickets: formData.get("separateTickets") === "on",
    refundability: formData.get("refundability"),
    competitionRelated: formData.get("competitionRelated") === "on",
    notes: optionalText(formData.get("notes")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createFlightOption(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}

export async function updateFlightOption(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = updateFlightOptionInput.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    fare: Number(formData.get("fare")),
    bagFee: Number(formData.get("bagFee") || 0),
    mandatoryFees: Number(formData.get("mandatoryFees") || 0),
    currency: formData.get("currency"),
    informationState: formData.get("informationState"),
    sourceId,
    observedOn: formData.get("observedOn"),
    baggage: formData.get("baggage"),
    separateTickets: formData.get("separateTickets") === "on",
    refundability: formData.get("refundability"),
    competitionRelated: formData.get("competitionRelated") === "on",
    status: formData.get("status"),
    bookingReference: optionalText(formData.get("bookingReference")),
    notes: optionalText(formData.get("notes")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateFlightOption(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}

export async function deleteFlightOption(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = deleteFlightOptionInput.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.deleteFlightOption(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

export async function createFlightSegment(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = createFlightSegmentInput.safeParse({
    flightOptionId: formData.get("flightOptionId"),
    direction: formData.get("direction"),
    segmentOrder: Number(formData.get("segmentOrder")),
    fromAirport: formData.get("fromAirport"),
    toAirport: formData.get("toAirport"),
    fromCountry: formData.get("fromCountry"),
    toCountry: formData.get("toCountry"),
    flightNumber: optionalText(formData.get("flightNumber")),
    departAt: formData.get("departAt"),
    arriveAt: formData.get("arriveAt"),
    isTechnicalStop: formData.get("isTechnicalStop") === "on",
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createFlightSegment(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}

export async function deleteFlightSegment(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = deleteFlightSegmentInput.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.deleteFlightSegment(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

// The "I accept this risk" form (check 4): a plain, one-shot write,
// never a retry of something a trigger blocked -- see
// createFlightRiskDecisionInput's own comment.
export async function createFlightRiskDecision(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = createFlightRiskDecisionInput.safeParse({
    tripId: formData.get("tripId"),
    competitionId: formData.get("competitionId"),
    flightOptionId: formData.get("flightOptionId"),
    optionLabel: formData.get("optionLabel"),
    rationale: formData.get("rationale"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createFlightRiskDecision(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}
