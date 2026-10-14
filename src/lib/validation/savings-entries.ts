import { z } from "zod";

// savings_entries' own currency column is free-text in the database, but
// SavingsEntry.currency is already typed as the literal "USD" in
// src/lib/data/types.ts: every entry is recorded in the base currency,
// never in whatever currency the money happened to start in -- that's
// what lets calculateRequiredSavings() treat every entry as
// already-converted, with no FX lookup of its own. So this form never
// asks for a currency; the write function hardcodes "USD".
export const recordSavingsEntryInput = z.object({
  tripId: z.string().uuid(),
  amount: z.number().positive(),
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
  note: z.string().trim().optional(),
});

export type RecordSavingsEntryInput = z.infer<typeof recordSavingsEntryInput>;
