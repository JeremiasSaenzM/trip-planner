"use server";

import { dataSource } from "@/lib/data";
import { createSourceInput } from "@/lib/validation/sources";

import { optionalText } from "./server-action-helpers";

// Shared by every write form that needs a sourceId: SourcePicker
// (source-picker.tsx) submits "${name}Choice" plus "${name}New*"
// sub-fields, and this reads exactly those back off the FormData. Not
// its own RPC/transaction with whatever the source is attached to --
// creating the source first and then using its id is a separate,
// sequential write, same precedent as createPaymentRiskDecision followed
// by updatePaymentStatus in payment-actions.ts's acceptPaymentRisk.
//
// Throws (a plain Error for a validation failure, or whatever
// dataSource.createSource throws) rather than returning a result --
// every caller already has its own try/catch around the rest of its
// write and run its error through translatePostgresError, so there's
// no need for a second error-shape here.
export async function resolveSourceId(formData: FormData, name: string): Promise<string | undefined> {
  const choice = String(formData.get(`${name}Choice`) ?? "");
  if (choice === "") return undefined;
  if (choice !== "__new__") return choice;

  const parsed = createSourceInput.safeParse({
    provider: formData.get(`${name}NewProvider`),
    tier: Number(formData.get(`${name}NewTier`)),
    url: optionalText(formData.get(`${name}NewUrl`)),
    observedOn: formData.get(`${name}NewObservedOn`),
    applicablePeriodStart: optionalText(formData.get(`${name}NewApplicablePeriodStart`)),
    applicablePeriodEnd: optionalText(formData.get(`${name}NewApplicablePeriodEnd`)),
    notes: optionalText(formData.get(`${name}NewNotes`)),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "That new source doesn't look right.");
  }

  const source = await dataSource.createSource(parsed.data);
  return source.id;
}
