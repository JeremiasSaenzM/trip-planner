import { z } from "zod";

import type { BudgetCategory } from "@/lib/domain/types";

import {
  changeReason,
  checkAmountOrder,
  checkConfirmedNeedsSource,
  confidence,
  currencyCode,
  id,
  infoState,
} from "./shared";

export const budgetCategory = z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] satisfies [
  BudgetCategory,
  ...BudgetCategory[],
]);

const budgetLineFields = z.object({
  category: budgetCategory,
  description: z.string().trim().min(1),
  amountMin: z.number().nonnegative(),
  amountTarget: z.number().nonnegative(),
  amountConservative: z.number().nonnegative(),
  currency: currencyCode,
  informationState: infoState,
  sourceId: id.optional(),
  notes: z.string().trim().optional(),
  // Optional: absent means "not assessed" (null in budget_lines).
  confidence: confidence.optional(),
});

function refineBudgetLine(value: z.infer<typeof budgetLineFields>, ctx: z.RefinementCtx) {
  checkAmountOrder(
    ctx,
    { min: value.amountMin, target: value.amountTarget, conservative: value.amountConservative },
    ["amountTarget"],
  );
  checkConfirmedNeedsSource(ctx, value.informationState, value.sourceId, ["sourceId"]);
}

// Mirrors budget_lines: budget_lines_amount_order and
// budget_lines_confirmed_needs_source. A new line has nothing to justify
// yet, so no reason required (matches change_log's trigger).
export const createBudgetLineInput = budgetLineFields
  .extend({
    tripId: id,
    scenarioId: id.optional(),
  })
  .superRefine(refineBudgetLine);

// An edit touches a value that already meant something -- change_log's
// trigger refuses the UPDATE without app.change_reason set, so the form
// must collect it up front.
export const updateBudgetLineInput = budgetLineFields
  .extend({
    id,
    reason: changeReason,
  })
  .superRefine(refineBudgetLine);

// delete_budget_line (20261015110000_budget_lines_fx_rates_writes.sql)
// refuses while any payment still references the line -- see its own
// comment for why -- so this schema only has to rule out a blank reason.
export const deleteBudgetLineInput = z.object({
  id,
  reason: changeReason,
});

export type CreateBudgetLineInput = z.infer<typeof createBudgetLineInput>;
export type UpdateBudgetLineInput = z.infer<typeof updateBudgetLineInput>;
export type DeleteBudgetLineInput = z.infer<typeof deleteBudgetLineInput>;
