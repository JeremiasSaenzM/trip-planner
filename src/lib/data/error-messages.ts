// Translates a Postgres error from a write RPC into something a form can
// show directly. The DB is the real enforcement for every rule here (see
// the migrations under supabase/migrations/) -- this only exists because
// its own error text is written for a database, not a person:
//   new row for relation "budget_lines" violates check constraint
//   "budget_lines_confirmed_needs_source"
// An unmapped constraint still shows its raw message rather than going
// blank, so a rule added later without a matching entry here fails loud,
// not silently.
const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  budget_lines_confirmed_needs_source: "Confirmed needs a source -- add one, or set this back to an estimate.",
  payments_confirmed_needs_source: "Confirmed needs a source -- add one, or set this back to an estimate.",
  payments_dates_confirmed_needs_source:
    "A confirmed date needs a source -- add one, or set the date back to an estimate.",
  competitions_dates_confirmed_needs_source:
    "A confirmed date needs a source -- add one, or set the date back to an estimate.",
  budget_lines_amount_order: "Minimum, target and conservative must stay in that order (min ≤ target ≤ conservative).",
  payments_paid_not_over_total: "The amount paid can't be more than the total.",
  competitions_end_after_start: "The festival can't end before it starts.",
  fx_rates_currency_date_kind_unique: "There's already a rate for this currency, date and kind -- edit that one instead.",
  savings_entries_amount_positive: "The amount has to be more than zero.",
  savings_entries_recorded_on_not_future: "That date can't be in the future.",
};

const CHECK_CONSTRAINT_PATTERN = /violates (?:check|unique) constraint "([^"]+)"/;

// enforce_payment_acceptance_safeguard() (payments.sql) raises this with
// a dynamic status interpolated in, so it's matched by its stable
// prefix rather than the full text.
const ACCEPTANCE_SAFEGUARD_PREFIX = "Payment is a non-refundable/unknown, competition-related commitment";
const ACCEPTANCE_SAFEGUARD_MESSAGE =
  "This is a non-refundable (or unknown-refundability) commitment, but the competition isn't accepted yet. " +
  "Use \"I accept this risk\" to record why, or leave it as Planned until the competition is accepted.";

// change_log_capture()'s own reason requirement (change_log.sql) --
// reached only if a write somehow skips the form's own changeReason
// validation (shared.ts).
const REASON_REQUIRED_PREFIX = "A reason is required for";
const REASON_REQUIRED_MESSAGE = "Say why you're making this change -- a reason is required for edits and deletes.";

// The standard suffix every edit/delete RPC's own ownership check raises
// with (e.g. update_savings_entry/delete_savings_entry in
// 20261014200000_savings_entries_writes.sql) -- RLS makes "where id =
// p_id" match zero rows for an id you don't own, which reads the same
// as a plain unknown id, so the message doesn't try to tell them apart.
const NOT_FOUND_SUFFIX = "not found (or not yours)";
const NOT_FOUND_MESSAGE = "That doesn't exist, or isn't yours.";

export function translatePostgresError(error: { message: string }): string {
  if (error.message.startsWith(ACCEPTANCE_SAFEGUARD_PREFIX)) {
    return ACCEPTANCE_SAFEGUARD_MESSAGE;
  }
  if (error.message.startsWith(REASON_REQUIRED_PREFIX)) {
    return REASON_REQUIRED_MESSAGE;
  }
  if (error.message.includes(NOT_FOUND_SUFFIX)) {
    return NOT_FOUND_MESSAGE;
  }

  const constraintMatch = error.message.match(CHECK_CONSTRAINT_PATTERN);
  if (constraintMatch) {
    const friendly = CHECK_CONSTRAINT_MESSAGES[constraintMatch[1]];
    if (friendly) return friendly;
  }

  return error.message;
}
