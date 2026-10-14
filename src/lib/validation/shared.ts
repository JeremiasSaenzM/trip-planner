import { z } from "zod";

import type { InfoState } from "@/lib/domain/types";

// Mirrors every table's "currency text ... check (currency ~ '^[A-Z]{3}$')"
// constraint (budget_lines, payments, savings_entries, fx_rates).
export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code (e.g. USD)");

export const infoState = z.enum([
  "confirmed",
  "estimate",
  "assumption",
  "decision",
  "pending",
  "historical",
  "conflicting",
] satisfies [InfoState, ...InfoState[]]);

// A reason is required for every edit and delete -- change_log's trigger
// (supabase/migrations/20261012131400_change_log.sql) already refuses an
// UPDATE/DELETE with no app.change_reason set, for anything but seed data.
// This is the form-side half of that same rule, so the error shows up
// before the request even reaches the database.
export const changeReason = z.string().trim().min(1, "Say why you're making this change");

/**
 * Mirrors "confirmed needs a source": budget_lines_confirmed_needs_source,
 * payments_confirmed_needs_source, payments_dates_confirmed_needs_source,
 * competitions_dates_confirmed_needs_source. Call from a schema's
 * `.superRefine()` so the error attaches to the source field, not the
 * state field -- that's the one the person needs to go fill in.
 */
export function checkConfirmedNeedsSource(
  ctx: z.RefinementCtx,
  state: InfoState,
  sourceId: string | null | undefined,
  sourcePath: (string | number)[],
) {
  if (state === "confirmed" && !sourceId) {
    ctx.addIssue({
      code: "custom",
      path: sourcePath,
      message: "Confirmed needs a source -- add one, or set this back to an estimate.",
    });
  }
}

/**
 * Mirrors "amount_min <= amount_target <= amount_conservative"
 * (budget_lines_amount_order). Attaches to amountTarget, the one value
 * most likely to be the odd one out.
 */
export function checkAmountOrder(
  ctx: z.RefinementCtx,
  amounts: { min: number; target: number; conservative: number },
  targetPath: (string | number)[],
) {
  if (!(amounts.min <= amounts.target && amounts.target <= amounts.conservative)) {
    ctx.addIssue({
      code: "custom",
      path: targetPath,
      message: "Minimum, target and conservative must stay in that order (min ≤ target ≤ conservative).",
    });
  }
}
