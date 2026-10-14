import { describe, expect, it } from "vitest";

import { translatePostgresError } from "./error-messages";

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

  it("falls back to the raw message for anything unmapped, instead of going blank", () => {
    const message = translatePostgresError({ message: "some brand-new constraint failed" });
    expect(message).toBe("some brand-new constraint failed");
  });
});
