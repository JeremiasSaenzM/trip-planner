import { z } from "zod";

import { changeReason, dateNotInFuture, id } from "./shared";

// savings_entries' own currency column is free-text in the database, but
// SavingsEntry.currency is already typed as the literal "USD" in
// src/lib/data/types.ts: every entry is recorded in the base currency,
// never in whatever currency the money happened to start in -- that's
// what lets calculateRequiredSavings() treat every entry as
// already-converted, with no FX lookup of its own. So this form never
// asks for a currency; the write function hardcodes "USD".
//
// amount > 0 and recordedOn not in the future both mirror DB check
// constraints (savings_entries_amount_positive,
// savings_entries_recorded_on_not_future) added alongside the write
// RPCs -- those are the real enforcement; this is just where the error
// shows up before the request reaches the database.
export const recordSavingsEntryInput = z.object({
  tripId: id,
  amount: z.number().positive(),
  recordedOn: dateNotInFuture,
  note: z.string().trim().optional(),
});

// Edits and deletes both require a reason -- see change_reason's own
// doc comment in shared.ts, and the two RPCs in
// supabase/migrations/20261014200000_savings_entries_writes.sql, which
// enforce it themselves rather than trusting the caller.
export const updateSavingsEntryInput = z.object({
  id,
  amount: z.number().positive(),
  recordedOn: dateNotInFuture,
  note: z.string().trim().optional(),
  reason: changeReason,
});

export const deleteSavingsEntryInput = z.object({
  id,
  reason: changeReason,
});

export type RecordSavingsEntryInput = z.infer<typeof recordSavingsEntryInput>;
export type UpdateSavingsEntryInput = z.infer<typeof updateSavingsEntryInput>;
export type DeleteSavingsEntryInput = z.infer<typeof deleteSavingsEntryInput>;
