"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import {
  createPaymentInput,
  deletePaymentInput,
  recordPaymentInput,
  updatePaymentDetailsInput,
  updatePaymentStatusInput,
} from "@/lib/validation/payments";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";
import { resolveSourceId } from "./source-actions";

// Server Actions behind /payments (see payment-write-ui.tsx). Creating a
// payment is a plain insert, done through the create_payment RPC only
// for atomicity (it may also insert a new budget line in the same
// call) -- not because it needs a reason. Every edit, status change
// and delete goes through its own RPC that sets app.change_reason, same
// pattern as savings-actions.ts.
//
// Every action revalidates both "/" and "/payments": a payment write
// changes what both the Overview charts/figures and this screen show.
function revalidateBoth() {
  revalidatePath("/payments");
  revalidatePath("/");
}

export async function createPayment(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = createPaymentInput.safeParse({
    tripId: formData.get("tripId"),
    scenarioId: optionalText(formData.get("scenarioId")),
    budgetLineId: optionalText(formData.get("budgetLineId")),
    category: optionalText(formData.get("category")),
    description: formData.get("description"),
    currency: formData.get("currency"),
    totalAmount: Number(formData.get("totalAmount")),
    refundability: formData.get("refundability"),
    cancellationDeadline: optionalText(formData.get("cancellationDeadline")),
    timingType: formData.get("timingType"),
    dueDate: optionalText(formData.get("dueDate")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createPayment(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateBoth();
  return initialFormActionState;
}

export async function recordPayment(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = recordPaymentInput.safeParse({
    paymentId: formData.get("paymentId"),
    amount: Number(formData.get("amount")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.recordPayment(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateBoth();
  return { status: "success" };
}

export async function updatePaymentStatus(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = updatePaymentStatusInput.safeParse({
    paymentId: formData.get("paymentId"),
    status: formData.get("status"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updatePaymentStatus(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateBoth();
  return { status: "success" };
}

export async function updatePaymentDetails(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  let datesSourceId: string | undefined;
  try {
    [sourceId, datesSourceId] = await Promise.all([
      resolveSourceId(formData, "source"),
      resolveSourceId(formData, "datesSource"),
    ]);
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = updatePaymentDetailsInput.safeParse({
    paymentId: formData.get("paymentId"),
    description: formData.get("description"),
    totalAmount: Number(formData.get("totalAmount")),
    currency: formData.get("currency"),
    dueDate: optionalText(formData.get("dueDate")),
    cancellationDeadline: optionalText(formData.get("cancellationDeadline")),
    datesState: formData.get("datesState"),
    datesSourceId,
    timingType: formData.get("timingType"),
    informationState: formData.get("informationState"),
    sourceId,
    refundability: formData.get("refundability"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updatePaymentDetails(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateBoth();
  return { status: "success" };
}

export async function deletePayment(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = deletePaymentInput.safeParse({
    paymentId: formData.get("paymentId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.deletePayment(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateBoth();
  return initialFormActionState;
}
