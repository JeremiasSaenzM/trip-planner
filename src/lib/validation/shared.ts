import { z } from "zod";

import type { InfoState } from "@/lib/domain/types";

// Every foreign key in this app is a Postgres uuid column, but not every
// id in it is a freshly-generated v4 uuid: supabase/seed.sql and
// src/lib/data/fixtures.ts deliberately use memorable, sequential ids
// like "20000000-0000-0000-0000-000000000001" so fixtures are easy to
// cross-reference by eye. Zod v4's .uuid() checks the actual version/
// variant bits and rejects those -- z.guid() checks only the general
// 8-4-4-4-12 hex shape, which is what every id here actually needs.
export const id = z.guid();

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

// A YYYY-MM-DD value is a calendar date, not an instant -- compared in
// UTC explicitly here, the same rule format.ts/charts.tsx/
// savings-plan-charts.tsx already follow, rather than the server's
// ambient time zone (which "today" would otherwise silently depend on).
// Mirrors savings_entries_recorded_on_not_future on the DB side.
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const dateNotInFuture = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((date) => date <= todayUtc(), "Date can't be in the future");

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
