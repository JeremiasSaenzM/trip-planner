"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import {
  deleteSavingsEntryInput,
  recordSavingsEntryInput,
  updateSavingsEntryInput,
} from "@/lib/validation/savings-entries";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";

// Server Actions behind the "Money set aside" card on the Overview page
// (see savings-entries-ui.tsx). Recording a new entry is a plain insert
// (nothing existed before to justify changing); editing and deleting
// both go through RPCs that set app.change_reason in the same call
// (supabase/migrations/20261014200000_savings_entries_writes.sql).

export async function recordSavingsEntry(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = recordSavingsEntryInput.safeParse({
    tripId: formData.get("tripId"),
    amount: Number(formData.get("amount")),
    recordedOn: formData.get("recordedOn"),
    note: optionalText(formData.get("note")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.recordSavingsEntry(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidatePath("/");
  return initialFormActionState;
}

export async function updateSavingsEntry(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = updateSavingsEntryInput.safeParse({
    id: formData.get("id"),
    amount: Number(formData.get("amount")),
    recordedOn: formData.get("recordedOn"),
    note: optionalText(formData.get("note")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateSavingsEntry(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidatePath("/");
  return initialFormActionState;
}

export async function deleteSavingsEntry(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const parsed = deleteSavingsEntryInput.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.deleteSavingsEntry(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidatePath("/");
  return initialFormActionState;
}
