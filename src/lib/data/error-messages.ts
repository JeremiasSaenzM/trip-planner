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
  trips_return_after_departure: "You can't come home before you leave -- check the return date.",
  trips_travel_dates_confirmed_needs_source:
    "Confirmed travel dates need a source -- add one, or set them back to an estimate.",
  trips_confirmed_travel_dates_need_dates:
    "Confirmed travel dates need both the departure and the return date.",
  competitions_dates_together: "Give both festival dates (first and final day), or neither.",
  competitions_confirmed_dates_need_dates:
    "Confirmed dates need the dates themselves -- add them, or leave the dates pending.",
  fx_rates_currency_date_kind_unique: "There's already a rate for this currency, date and kind -- edit that one instead.",
  savings_entries_amount_positive: "The amount has to be more than zero.",
  savings_entries_recorded_on_not_future: "That date can't be in the future.",
  decisions_payment_risk_needs_rationale: "Say why you're accepting this risk.",
  decisions_accepted_currency_format: "Currency must be a 3-letter code (e.g. USD).",
  payments_risk_accepted_decision_id_unique: "That decision already covers a different payment.",
};

const CHECK_CONSTRAINT_PATTERN = /violates (?:check|unique) constraint "([^"]+)"/;

// enforce_payment_acceptance_safeguard() (payments.sql) raises this with
// a dynamic status interpolated in, so it's matched by its stable
// prefix rather than the full text.
const ACCEPTANCE_SAFEGUARD_PREFIX = "Payment is a non-refundable/unknown, competition-related commitment";
const ACCEPTANCE_SAFEGUARD_MESSAGE =
  "This is a non-refundable (or unknown-refundability) commitment, but the competition isn't accepted yet. " +
  "Use \"I accept this risk\" to record why, or leave it as Planned until the competition is accepted.";

// enforce_payment_acceptance_safeguard() raises this one instead when a
// risk-accepted decision names this exact payment but no longer covers
// its current amount/currency (20261015100000) -- the amount was raised,
// or the currency changed, after the risk was accepted.
const AMOUNT_EXCEEDED_PREFIX = "Payment's amount exceeds what was risk-accepted for it";
const AMOUNT_EXCEEDED_MESSAGE =
  "This payment's amount or currency is now higher than, or different from, what you accepted the risk for. " +
  "Use \"I accept this risk\" again to cover the new amount.";

// delete_budget_line() raises this with a dynamic id interpolated in
// (20261015110000_budget_lines_fx_rates_writes.sql), matched by its
// stable suffix rather than the full text.
const BUDGET_LINE_HAS_PAYMENTS_SUFFIX = "still has payments attached -- delete or reassign them first.";
const BUDGET_LINE_HAS_PAYMENTS_MESSAGE =
  "This budget line still has payments attached -- delete or reassign them first.";

// delete_scenario()/update_scenario() raise these with a dynamic id
// interpolated in (20261019090000_manage_competitions_scenarios.sql),
// matched by their stable suffixes.
const SCENARIO_REFUSAL_MESSAGES: [suffix: string, message: string][] = [
  [
    "still has budget lines -- delete them first.",
    "This scenario still has budget lines -- delete them first (on the Budget page, with this scenario selected).",
  ],
  [
    "still has payments -- delete them first.",
    "This scenario still has payments -- delete them first (on the Payments page, with this scenario selected).",
  ],
  ["still has flight options -- delete them first.", "This scenario still has flight options -- delete them first."],
  [
    "has committed non-refundable competition payments -- its competition can't be changed.",
    "This scenario has committed non-refundable payments tied to its competition, so its competition can't be " +
      "changed -- that would move those commitments under a different competition. You can still rename it.",
  ],
];

// approve_proposal() and its helpers (20261021090000_import_proposals.sql)
// -- each raised with dynamic details interpolated in, so matched by a
// stable prefix. "Out of date" is the race the review screen can't see:
// the value moved between loading the page and pressing Approve.
const PROPOSAL_MESSAGES: [prefix: string, message: string][] = [
  [
    "Proposal is out of date",
    "This changed since the proposal was written, so it wasn't applied. Reject it and ask for a fresh proposal.",
  ],
  ["Proposal depends on", "This depends on another item of the batch that isn't approved yet -- approve that one first."],
  ["Proposal changes a field it can't", "This proposal tries to change a field that can't be changed this way."],
];
const PROPOSAL_ALREADY_DECIDED_PATTERN = /^Proposal \S+ was already (approved|rejected)\.$/;

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

// Lets a Server Action tell "this specific rule blocked the write" apart
// from any other error, so it can offer "I accept this risk" specifically
// rather than just showing a generic error message. See
// payment-actions.ts's updatePaymentStatus.
export function isAcceptanceSafeguardError(error: { message: string }): boolean {
  return error.message.startsWith(ACCEPTANCE_SAFEGUARD_PREFIX) || error.message.startsWith(AMOUNT_EXCEEDED_PREFIX);
}

export function translatePostgresError(error: { message: string }): string {
  if (error.message.startsWith(AMOUNT_EXCEEDED_PREFIX)) {
    return AMOUNT_EXCEEDED_MESSAGE;
  }
  if (error.message.startsWith(ACCEPTANCE_SAFEGUARD_PREFIX)) {
    return ACCEPTANCE_SAFEGUARD_MESSAGE;
  }
  if (error.message.startsWith(REASON_REQUIRED_PREFIX)) {
    return REASON_REQUIRED_MESSAGE;
  }
  if (error.message.endsWith(BUDGET_LINE_HAS_PAYMENTS_SUFFIX)) {
    return BUDGET_LINE_HAS_PAYMENTS_MESSAGE;
  }
  for (const [suffix, message] of SCENARIO_REFUSAL_MESSAGES) {
    if (error.message.endsWith(suffix)) return message;
  }
  for (const [prefix, message] of PROPOSAL_MESSAGES) {
    if (error.message.startsWith(prefix)) return message;
  }
  const decided = error.message.match(PROPOSAL_ALREADY_DECIDED_PATTERN);
  if (decided) {
    return `This proposal was already ${decided[1]}.`;
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
