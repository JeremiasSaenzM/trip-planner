import { z } from "zod";

import type { RateKind } from "@/lib/domain/types";

import { changeReason, currencyCode, infoState } from "./shared";

const rateKind = z.enum(["observed", "planning_base", "planning_conservative"] satisfies [
  RateKind,
  ...RateKind[],
]);

// Mirrors fx_rates: source_id is "not null references sources" with no
// "confirmed" gate at all -- unlike budget lines/payments, even a
// planning-rate estimate has to cite something (a tier-6 model guess
// still counts). fx_rates_currency_date_kind_unique (one row per
// currency/date/kind) is a DB-side uniqueness check this schema can't
// see across rows -- that one surfaces through error-messages.ts instead.
const fxRateFields = z.object({
  currency: currencyCode,
  rateToUsd: z.number().positive(),
  rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
  rateKind,
  informationState: infoState,
  sourceId: z.string().uuid("Even a planning rate needs a source"),
});

export const createFxRateInput = fxRateFields;

export const updateFxRateInput = fxRateFields.extend({
  id: z.string().uuid(),
  reason: changeReason,
});

export type CreateFxRateInput = z.infer<typeof createFxRateInput>;
export type UpdateFxRateInput = z.infer<typeof updateFxRateInput>;
