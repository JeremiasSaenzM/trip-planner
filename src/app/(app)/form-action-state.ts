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
