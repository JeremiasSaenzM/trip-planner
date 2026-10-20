import { describe, expect, it } from "vitest";

import { isAcceptanceSafeguardError, translatePostgresError } from "./error-messages";

describe("translatePostgresError", () => {
  it("translates a known check-constraint violation", () => {
    const message = translatePostgresError({
      message:
        'new row for relation "budget_lines" violates check constraint "budget_lines_confirmed_needs_source"',
    });
    expect(message).toBe("Confirmed needs a source -- add one, or set this back to an estimate.");
  });

  it("translates a unique-constraint violation", () => {
    const message = translatePostgresError({
      message: 'duplicate key value violates unique constraint "fx_rates_currency_date_kind_unique"',
    });
    expect(message).toBe("There's already a rate for this currency, date and kind -- edit that one instead.");
  });

  it("translates the payment acceptance safeguard's raised exception", () => {
    const message = translatePostgresError({
      message:
        "Payment is a non-refundable/unknown, competition-related commitment (status committed) but the " +
        "competition is not accepted and risk_accepted_decision_id does not point to a traveler decision for it.",
    });
    expect(message).toMatch(/I accept this risk/);
  });

  it("translates the competition both-or-neither dates check", () => {
    const message = translatePostgresError({
      message: 'new row for relation "competitions" violates check constraint "competitions_dates_together"',
    });
    expect(message).toBe("Give both festival dates (first and final day), or neither.");
  });

  it("translates delete_scenario's refusals by their suffix", () => {
    expect(
      translatePostgresError({
        message: "Scenario a1000000-0000-0000-0000-000000000012 still has budget lines -- delete them first.",
      }),
    ).toMatch(/^This scenario still has budget lines/);
    expect(
      translatePostgresError({
        message: "Scenario a1000000-0000-0000-0000-000000000013 still has payments -- delete them first.",
      }),
    ).toMatch(/^This scenario still has payments/);
    expect(
      translatePostgresError({
        message: "Scenario a1000000-0000-0000-0000-000000000014 still has flight options -- delete them first.",
      }),
    ).toMatch(/^This scenario still has flight options/);
  });

  it("translates update_scenario's committed-payments refusal", () => {
    const message = translatePostgresError({
      message:
        "Scenario a1000000-0000-0000-0000-000000000012 has committed non-refundable competition payments -- " +
        "its competition can't be changed.",
    });
    expect(message).toMatch(/can't be changed/);
    expect(message).toMatch(/still rename it/);
  });

  it("translates the change-reason trigger's raised exception", () => {
    const message = translatePostgresError({
      message: "A reason is required for UPDATE on public.budget_lines (set app.change_reason before writing)",
    });
    expect(message).toMatch(/reason is required/);
  });

  it("translates a write RPC's own blank-reason guard the same way, since it uses the same prefix", () => {
    const message = translatePostgresError({ message: "A reason is required for this change." });
    expect(message).toMatch(/reason is required/);
  });

  it("translates a write RPC's ownership-check exception", () => {
    const message = translatePostgresError({
      message: "Savings entry 90000000-0000-0000-0000-000000000001 not found (or not yours)",
    });
    expect(message).toBe("That doesn't exist, or isn't yours.");
  });

  it("translates the new savings_entries check constraints", () => {
    expect(
      translatePostgresError({
        message: 'new row for relation "savings_entries" violates check constraint "savings_entries_amount_positive"',
      }),
    ).toBe("The amount has to be more than zero.");
    expect(
      translatePostgresError({
        message:
          'new row for relation "savings_entries" violates check constraint "savings_entries_recorded_on_not_future"',
      }),
    ).toBe("That date can't be in the future.");
  });

  it("translates the payment-risk-acceptance constraints", () => {
    expect(
      translatePostgresError({
        message: 'new row for relation "decisions" violates check constraint "decisions_payment_risk_needs_rationale"',
      }),
    ).toBe("Say why you're accepting this risk.");
    expect(
      translatePostgresError({
        message: 'new row for relation "decisions" violates check constraint "decisions_accepted_currency_format"',
      }),
    ).toBe("Currency must be a 3-letter code (e.g. USD).");
    expect(
      translatePostgresError({
        message: 'duplicate key value violates unique constraint "payments_risk_accepted_decision_id_unique"',
      }),
    ).toBe("That decision already covers a different payment.");
  });

  it("translates the amount-exceeded variant of the acceptance safeguard's raised exception", () => {
    const message = translatePostgresError({
      message:
        "Payment's amount exceeds what was risk-accepted for it (accepted 100 EUR, now 150 EUR) -- accept the " +
        "risk again at the new amount.",
    });
    expect(message).toMatch(/I accept this risk/);
  });

  it("falls back to the raw message for anything unmapped, instead of going blank", () => {
    const message = translatePostgresError({ message: "some brand-new constraint failed" });
    expect(message).toBe("some brand-new constraint failed");
  });
});

describe("isAcceptanceSafeguardError", () => {
  it("recognizes the acceptance safeguard's own raised exception", () => {
    expect(
      isAcceptanceSafeguardError({
        message:
          "Payment is a non-refundable/unknown, competition-related commitment (status committed) but the " +
          "competition is not accepted and risk_accepted_decision_id does not point to a traveler decision for it.",
      }),
    ).toBe(true);
  });

  it("also recognizes the amount-exceeded variant", () => {
    expect(
      isAcceptanceSafeguardError({
        message: "Payment's amount exceeds what was risk-accepted for it (accepted 100 EUR, now 150 EUR) -- accept the risk again at the new amount.",
      }),
    ).toBe(true);
  });

  it("returns false for every other error", () => {
    expect(isAcceptanceSafeguardError({ message: "Payment f0000000 not found (or not yours)" })).toBe(false);
    expect(isAcceptanceSafeguardError({ message: "A reason is required for this change." })).toBe(false);
  });
});

// approve_proposal() and its helpers (20261021090000_import_proposals.sql).
describe("translatePostgresError: import proposals", () => {
  it("says a proposal went stale between loading the page and approving it", () => {
    expect(
      translatePostgresError({
        message: "Proposal is out of date: amountMin is now 1500.00, but the proposal expected 1.",
      }),
    ).toBe("This changed since the proposal was written, so it wasn't applied. Reject it and ask for a fresh proposal.");
  });

  it("says what to approve first", () => {
    expect(
      translatePostgresError({ message: "Proposal depends on item 2 of this batch, which isn't an approved scenario." }),
    ).toBe("This depends on another item of the batch that isn't approved yet -- approve that one first.");
  });

  it("refuses a field outside the whitelist in words", () => {
    expect(translatePostgresError({ message: "Proposal changes a field it can't: tripId" })).toBe(
      "This proposal tries to change a field that can't be changed this way.",
    );
  });

  it("says an item was already decided", () => {
    expect(
      translatePostgresError({ message: "Proposal f1000000-0000-0000-0000-000000000001 was already approved." }),
    ).toBe("This proposal was already approved.");
  });

  it("covers Claude's own reason rule with the existing reason message", () => {
    expect(
      translatePostgresError({
        message: "A reason is required for every Claude-originated write (INSERT on public.sources)",
      }),
    ).toBe("Say why you're making this change -- a reason is required for edits and deletes.");
  });

  it("gives the same safeguard message an approval would get from the payment form", () => {
    expect(
      translatePostgresError({
        message:
          "Payment is a non-refundable/unknown, competition-related commitment (status committed) but the " +
          "competition is not accepted and risk_accepted_decision_id does not point to a traveler decision for it.",
      }),
    ).toMatch(/^This is a non-refundable/);
  });
});
