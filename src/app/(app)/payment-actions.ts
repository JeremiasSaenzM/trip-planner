"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { isAcceptanceSafeguardError, translatePostgresError } from "@/lib/data/error-messages";
import { acceptPaymentRiskInput, acceptRiskBaseInput } from "@/lib/validation/decisions";
import {
  createPaymentInput,
  deletePaymentInput,
  recordPaymentInput,
  updatePaymentDetailsInput,
  updatePaymentStatusInput,
} from "@/lib/validation/payments";

import {
  initialFormActionState,
  type FormActionState,
  type PaymentStatusActionState,
  type UpdatePaymentDetailsActionState,
} from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";

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
    competitionRelated: formData.get("competitionRelated") === "on",
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

export async function updatePaymentStatus(
  _previous: PaymentStatusActionState,
  formData: FormData,
): Promise<PaymentStatusActionState> {
  const parsed = updatePaymentStatusInput.safeParse({
    paymentId: formData.get("paymentId"),
    status: formData.get("status"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updatePaymentStatus(parsed.data);
  } catch (error) {
    const err = error as { message: string };
    if (isAcceptanceSafeguardError(err)) {
      return { status: "blocked", message: translatePostgresError(err) };
    }
    return { status: "error", message: translatePostgresError(err) };
  }

  revalidateBoth();
  return { status: "success" };
}

export async function updatePaymentDetails(
  _previous: UpdatePaymentDetailsActionState,
  formData: FormData,
): Promise<UpdatePaymentDetailsActionState> {
  const parsed = updatePaymentDetailsInput.safeParse({
    paymentId: formData.get("paymentId"),
    description: formData.get("description"),
    totalAmount: Number(formData.get("totalAmount")),
    currency: formData.get("currency"),
    dueDate: optionalText(formData.get("dueDate")),
    cancellationDeadline: optionalText(formData.get("cancellationDeadline")),
    datesState: formData.get("datesState"),
    datesSourceId: optionalText(formData.get("datesSourceId")),
    timingType: formData.get("timingType"),
    informationState: formData.get("informationState"),
    sourceId: optionalText(formData.get("sourceId")),
    refundability: formData.get("refundability"),
    competitionRelated: formData.get("competitionRelated") === "on",
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updatePaymentDetails(parsed.data);
  } catch (error) {
    const err = error as { message: string };
    if (isAcceptanceSafeguardError(err)) {
      return { status: "blocked", message: translatePostgresError(err), pending: parsed.data };
    }
    return { status: "error", message: translatePostgresError(err) };
  }

  revalidateBoth();
  return { status: "success" };
}

// The "I accept this risk" retry for a *details* edit specifically
// (payment-write-ui.tsx's EditPaymentForm): raising total_amount, or
// changing currency, past what a risk-accepted decision covers blocks
// the same safeguard a status change can
// (20261015100000_payment_risk_amount_check.sql), but the amount being
// accepted is the *new*, not-yet-written value, so it can't be read
// back off the stored payment the way acceptPaymentRisk reads its
// current amount -- the blocked edit's own already-validated fields
// (echoed back as UpdatePaymentDetailsActionState's "pending") are
// resubmitted here as hidden fields instead.
export async function acceptPaymentRiskForDetails(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsedRisk = acceptRiskBaseInput.safeParse({
    paymentId: formData.get("paymentId"),
    tripId: formData.get("tripId"),
    competitionId: formData.get("competitionId"),
    rationale: formData.get("rationale"),
  });
  if (!parsedRisk.success) return { status: "error", message: firstIssueMessage(parsedRisk.error) };

  const parsedDetails = updatePaymentDetailsInput.safeParse({
    paymentId: formData.get("paymentId"),
    description: formData.get("description"),
    totalAmount: Number(formData.get("totalAmount")),
    currency: formData.get("currency"),
    dueDate: optionalText(formData.get("dueDate")),
    cancellationDeadline: optionalText(formData.get("cancellationDeadline")),
    datesState: formData.get("datesState"),
    datesSourceId: optionalText(formData.get("datesSourceId")),
    timingType: formData.get("timingType"),
    informationState: formData.get("informationState"),
    sourceId: optionalText(formData.get("sourceId")),
    refundability: formData.get("refundability"),
    competitionRelated: formData.get("competitionRelated") === "on",
    // The same rationale covers both: why the risk is accepted, and why
    // the payment is being edited -- there is only one reason to give.
    reason: parsedRisk.data.rationale,
  });
  if (!parsedDetails.success) return { status: "error", message: firstIssueMessage(parsedDetails.error) };

  try {
    const decision = await dataSource.createPaymentRiskDecision({
      tripId: parsedRisk.data.tripId,
      competitionId: parsedRisk.data.competitionId,
      paymentId: parsedRisk.data.paymentId,
      paymentDescription: parsedDetails.data.description,
      rationale: parsedRisk.data.rationale,
      acceptedAmount: parsedDetails.data.totalAmount,
      acceptedCurrency: parsedDetails.data.currency,
    });

    await dataSource.updatePaymentDetails({ ...parsedDetails.data, riskAcceptedDecisionId: decision.id });
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

// The "I accept this risk" retry: creates the decision (snapshotting
// the payment's *current* amount/currency/description, not whatever a
// hidden form field might carry, so the record reflects what the
// payment actually was at acceptance time), then retries the exact
// status change that was blocked.
export async function acceptPaymentRisk(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = acceptPaymentRiskInput.safeParse({
    paymentId: formData.get("paymentId"),
    tripId: formData.get("tripId"),
    competitionId: formData.get("competitionId"),
    rationale: formData.get("rationale"),
    targetStatus: formData.get("targetStatus"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  const payments = await dataSource.getPayments();
  const payment = payments.find((candidate) => candidate.id === parsed.data.paymentId);
  if (!payment) return { status: "error", message: "That payment doesn't exist anymore." };

  try {
    const decision = await dataSource.createPaymentRiskDecision({
      tripId: parsed.data.tripId,
      competitionId: parsed.data.competitionId,
      paymentId: parsed.data.paymentId,
      paymentDescription: payment.description,
      rationale: parsed.data.rationale,
      acceptedAmount: payment.totalAmount,
      acceptedCurrency: payment.currency,
    });

    await dataSource.updatePaymentStatus({
      paymentId: parsed.data.paymentId,
      status: parsed.data.targetStatus,
      reason: parsed.data.rationale,
      riskAcceptedDecisionId: decision.id,
    });
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateBoth();
  return { status: "success" };
}
