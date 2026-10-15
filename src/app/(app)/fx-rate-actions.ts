"use server";

import { revalidatePath } from "next/cache";

import { dataSource } from "@/lib/data";
import { translatePostgresError } from "@/lib/data/error-messages";
import { createFxRateInput, updateFxRateInput } from "@/lib/validation/fx-rates";

import { initialFormActionState, type FormActionState } from "./form-action-state";
import { firstIssueMessage } from "./server-action-helpers";
import { resolveSourceId } from "./source-actions";

// Server Actions behind /budget-lines' FX section (fx-rate-write-ui.tsx).
// Creating a rate is a plain insert; editing goes through update_fx_rate
// (sets app.change_reason). There's no delete -- removing a rate other
// rollups/obligations already used could silently change historical
// figures, and nothing asked for it.
function revalidateAll() {
  revalidatePath("/budget-lines");
  revalidatePath("/payments");
  revalidatePath("/");
}

// fx_rates.source_id is "not null" -- unlike budget lines/payments,
// there's no "no source" option in its SourcePicker (required: true),
// so an empty resolveSourceId() result here means the picker's own
// required attribute was somehow bypassed, not a real user choice.
export async function createFxRate(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }
  if (!sourceId) return { status: "error", message: "Even a planning rate needs a source." };

  const parsed = createFxRateInput.safeParse({
    currency: formData.get("currency"),
    rateToUsd: Number(formData.get("rateToUsd")),
    rateDate: formData.get("rateDate"),
    rateKind: formData.get("rateKind"),
    informationState: formData.get("informationState"),
    sourceId,
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.createFxRate(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return initialFormActionState;
}

export async function updateFxRate(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  let sourceId: string | undefined;
  try {
    sourceId = await resolveSourceId(formData, "source");
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }
  if (!sourceId) return { status: "error", message: "Even a planning rate needs a source." };

  const parsed = updateFxRateInput.safeParse({
    id: formData.get("id"),
    currency: formData.get("currency"),
    rateToUsd: Number(formData.get("rateToUsd")),
    rateDate: formData.get("rateDate"),
    rateKind: formData.get("rateKind"),
    informationState: formData.get("informationState"),
    sourceId,
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: firstIssueMessage(parsed.error) };

  try {
    await dataSource.updateFxRate(parsed.data);
  } catch (error) {
    return { status: "error", message: translatePostgresError(error as { message: string }) };
  }

  revalidateAll();
  return { status: "success" };
}
