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

  it("returns false for every other error", () => {
    expect(isAcceptanceSafeguardError({ message: "Payment f0000000 not found (or not yours)" })).toBe(false);
    expect(isAcceptanceSafeguardError({ message: "A reason is required for this change." })).toBe(false);
  });
});
