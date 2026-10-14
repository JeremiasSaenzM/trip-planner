import { z } from "zod";

import type { BudgetCategory } from "@/lib/domain/types";

import { changeReason, checkAmountOrder, checkConfirmedNeedsSource, currencyCode, infoState } from "./shared";

const budgetCategory = z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] satisfies [
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
  sourceId: z.string().uuid().optional(),
  notes: z.string().trim().optional(),
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
    tripId: z.string().uuid(),
    scenarioId: z.string().uuid().optional(),
  })
  .superRefine(refineBudgetLine);

// An edit touches a value that already meant something -- change_log's
// trigger refuses the UPDATE without app.change_reason set, so the form
// must collect it up front.
export const updateBudgetLineInput = budgetLineFields
  .extend({
    id: z.string().uuid(),
    reason: changeReason,
  })
  .superRefine(refineBudgetLine);

export type CreateBudgetLineInput = z.infer<typeof createBudgetLineInput>;
export type UpdateBudgetLineInput = z.infer<typeof updateBudgetLineInput>;
