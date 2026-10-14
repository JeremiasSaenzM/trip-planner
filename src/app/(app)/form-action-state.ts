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
