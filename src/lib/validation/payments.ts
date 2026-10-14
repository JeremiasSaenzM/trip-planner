import { z } from "zod";

import type { PaymentStatus, PaymentTiming, Refundability } from "@/lib/data/types";

import { changeReason, checkConfirmedNeedsSource, currencyCode, id, infoState } from "./shared";

const paymentStatus = z.enum(["planned", "committed", "paid", "cancelled"] satisfies [
  PaymentStatus,
  ...PaymentStatus[],
]);

const paymentTiming = z.enum([
  "paid_now",
  "due_on_date",
  "pay_before_arrival",
  "pay_at_property",
  "unknown",
  "optional",
] satisfies [PaymentTiming, ...PaymentTiming[]]);

const refundability = z.enum([
  "refundable",
  "partially_refundable",
  "non_refundable",
  "unknown",
] satisfies [Refundability, ...Refundability[]]);

// "Record a payment" adds to paid_amount -- it's how a partial payment
// gets entered, not a status flip. payments_paid_not_over_total (paid
// <= total) is already enforced by the DB; this schema only rules out
// the shapes that can never be valid (zero/negative).
export const recordPaymentInput = z.object({
  paymentId: id,
  amount: z.number().positive(),
  reason: changeReason,
});

// Status changes (including "cancelled") always go through the RPC that
// sets app.change_reason, so a reason is always required here -- there's
// no insert-exempt case for a status update. riskAcceptedDecisionId is
// only ever set by the "I accept this risk" retry path below, never
// typed in directly.
export const updatePaymentStatusInput = z.object({
  paymentId: id,
  status: paymentStatus,
  reason: changeReason,
  riskAcceptedDecisionId: id.optional(),
});

// Mirrors payments_confirmed_needs_source and
// payments_dates_confirmed_needs_source -- two independent state/source
// pairs on the same row (what the payment itself is, and when it's due).
export const updatePaymentDetailsInput = z
  .object({
    paymentId: id,
    description: z.string().trim().min(1),
    totalAmount: z.number().nonnegative(),
    currency: currencyCode,
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    cancellationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    datesState: infoState,
    datesSourceId: id.optional(),
    timingType: paymentTiming,
    informationState: infoState,
    sourceId: id.optional(),
    refundability,
    competitionRelated: z.boolean(),
    reason: changeReason,
  })
  .superRefine((value, ctx) => {
    checkConfirmedNeedsSource(ctx, value.informationState, value.sourceId, ["sourceId"]);
    checkConfirmedNeedsSource(ctx, value.datesState, value.datesSourceId, ["datesSourceId"]);
  });

export type RecordPaymentInput = z.infer<typeof recordPaymentInput>;
export type UpdatePaymentStatusInput = z.infer<typeof updatePaymentStatusInput>;
export type UpdatePaymentDetailsInput = z.infer<typeof updatePaymentDetailsInput>;
