import type { z } from "zod";

// Shared by every "use server" actions file in this directory
// (bootstrap-actions.ts, savings-actions.ts, ...). Not itself a "use
// server" module, so it can export plain functions.

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That doesn't look right.";
}

// formData.get() returns "" for a blank optional field, not null --
// Zod's .optional() only treats undefined as absent, so an empty string
// would otherwise fail string().trim().min(1) rules it shouldn't even
// run against. Every optional text field goes through this first.
export function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : text;
}

// Same reasoning as optionalText, for a field that must come out as a
// number or not at all -- Number("") is 0, not undefined, which would
// turn "I didn't set a quantity" into "quantity is zero".
export function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  const text = optionalText(value);
  return text === undefined ? undefined : Number(text);
}
