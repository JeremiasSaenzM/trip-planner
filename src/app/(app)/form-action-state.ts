import type { UpdatePaymentDetailsInput } from "@/lib/validation/payments";

// Shared between the "use server" action files (which can only export
// async functions -- not this type or constant) and the client form
// components that call those actions through useActionState.
//
// "success" exists for the rare case where the caller needs to tell a
// *successful* submission apart from "no submission yet" -- most forms
// don't: revalidatePath() causes an unmount/full re-render that already
// makes the old form disappear, and nothing further needs to track it.
// updateSavingsEntry is the one action that returns it today, because
// that form's row doesn't unmount on success (same entry.id) and has to
// notice the outcome itself to switch back out of edit mode.
export type FormActionState = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

export const initialFormActionState: FormActionState = { status: "idle" };

// updatePaymentStatus's own state: a "blocked" status change (the
// acceptance safeguard) is not a normal error -- the form offers "I
// accept this risk" for it specifically, so it needs to be told apart
// from every other error. See isAcceptanceSafeguardError() in
// src/lib/data/error-messages.ts and payment-actions.ts.
export type PaymentStatusActionState = FormActionState | { status: "blocked"; message: string };

export const initialPaymentStatusActionState: PaymentStatusActionState = { status: "idle" };

// updatePaymentDetails's own state: raising total_amount (or changing
// currency) past what a risk-accepted decision covers blocks the same
// way a status change can (20261015100000_payment_risk_amount_check.sql)
// -- but the retry here needs every edited field, not just a target
// status, since accepting the risk at the new amount and re-saving the
// edit happen together. "pending" is the already-Zod-validated input the
// blocked attempt tried to write, so the retry form can resubmit it as
// hidden fields without the client needing its own copy of the form
// state. See payment-actions.ts's updatePaymentDetails/
// acceptPaymentRiskForDetails.
export type UpdatePaymentDetailsActionState =
  | FormActionState
  | { status: "blocked"; message: string; pending: UpdatePaymentDetailsInput };

export const initialUpdatePaymentDetailsActionState: UpdatePaymentDetailsActionState = { status: "idle" };

// /import's paste form: a paste is all or nothing, so a refused one
// lists every problem at once rather than only the first.
export type ProposalPasteActionState = { status: "idle" } | { status: "error"; problems: string[] };

export const initialProposalPasteActionState: ProposalPasteActionState = { status: "idle" };

// "Approve all ready": each item is its own transaction, so the result
// is a tally -- what went through, and each failure with its own message.
export type ApproveAllReadyActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; approved: number; failures: { position: number; message: string }[] };

export const initialApproveAllReadyActionState: ApproveAllReadyActionState = { status: "idle" };
