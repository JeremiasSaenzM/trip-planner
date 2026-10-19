"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import { createBudgetLineInput, deleteBudgetLineInput, updateBudgetLineInput } from "@/lib/validation/budget-lines";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage, optionalText } from "./server-action-helpers";
import { resolveSourceId } from "./source-actions";

// Server Actions behind /budget-lines' budget-line section (see
// budget-line-write-ui.tsx). Creating a line is a plain insert, same
// reasoning as createCompetition/createScenario -- unlike create_payment
// it never touches a second table, so no RPC is needed just for
// atomicity. Editing and deleting both go through RPCs that set
// app.change_reason (20261015110000_budget_lines_fx_rates_writes.sql).
//
// Every action revalidates "/budget-lines", "/payments" (its
// existing-budget-line picker) and "/" (the Overview cost range and
// category chart).
function revalidateAll() {
  revalidatePath("/budget-lines");
  revalidatePath("/payments");
  revalidatePath("/");
}

export async function createBudgetLine(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = createBudgetLineInput.safeParse({
    tripId: formData.get("tripId"),
    scenarioId: optionalText(formData.get("scenarioId")),
    category: formData.get("category"),
    description: formData.get("description"),
    amountMin: Number(formData.get("amountMin")),
    amountTarget: Number(formData.get("amountTarget")),
    amountConservative: Number(formData.get("amountConservative")),
    currency: formData.get("currency"),
    informationState: formData.get("informationState"),
    sourceId,
    notes: optionalText(formData.get("notes")),
    confidence: optionalText(formData.get("confidence")),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createBudgetLine(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

export async function updateBudgetLine(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const parsed = updateBudgetLineInput.safeParse({
    id: formData.get("id"),
    category: formData.get("category"),
    description: formData.get("description"),
    amountMin: Number(formData.get("amountMin")),
    amountTarget: Number(formData.get("amountTarget")),
    amountConservative: Number(formData.get("amountConservative")),
    currency: formData.get("currency"),
    informationState: formData.get("informationState"),
    sourceId,
    notes: optionalText(formData.get("notes")),
    confidence: optionalText(formData.get("confidence")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateBudgetLine(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  // Not initialFormActionState: the row doesn't unmount on its own
  // (same id), so BudgetLineRowActions needs "success" to know to
  // switch itself back to view mode -- see savings-entries-ui.tsx's
  // own comment on the same pattern.
  return { status: "success" };
}

export async function deleteBudgetLine(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = deleteBudgetLineInput.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.deleteBudgetLine(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}
