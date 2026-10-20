import { describe, expect, it } from "vitest";

import * as fixtures from "@/lib/data/fixtures";
import type { ProposalOp } from "@/lib/data/types";

import { checkAgainstForm, currentFields, type CurrentRows, type ResolveReference } from "./form-check";
import { UPDATE_CHANGES, type UpdateOp } from "./schema";

const TRIP_ID = "20000000-0000-0000-0000-000000000001";
const SCENARIO_ID = "50000000-0000-0000-0000-000000000001";
const LINE_ID = "70000000-0000-0000-0000-000000000002"; // Round-trip flight: 520 / 650 / 820 GBP
const SOURCE_ID = "30000000-0000-0000-0000-000000000001";

const rows: CurrentRows = {
  competitions: fixtures.competitions,
  scenarios: fixtures.scenarios,
  budgetLines: fixtures.budgetLines,
  payments: fixtures.payments,
  fxRates: fixtures.fxRates,
  savingsEntries: fixtures.savingsEntries,
};

const resolveIds: ResolveReference = (reference) => ("id" in reference ? reference.id : null);

function check(op: ProposalOp, payload: unknown, targetId: string | null = null, resolve = resolveIds) {
  return checkAgainstForm({ op, targetId, payload, reason: "A reason" }, { tripId: TRIP_ID, resolve, rows });
}

const validLine = {
  scenario: { id: SCENARIO_ID },
  category: "E",
  description: "Meals",
  amountMin: 100,
  amountTarget: 120,
  amountConservative: 150,
  currency: "EUR",
  informationState: "estimate",
};

describe("checkAgainstForm: creates go through the form's own schema", () => {
  it("accepts a valid budget line", () => {
    expect(check("create_budget_line", { data: validLine })).toEqual({ ok: true });
  });

  it("refuses amounts out of order with the form's message", () => {
    expect(check("create_budget_line", { data: { ...validLine, amountMin: 200 } })).toEqual({
      ok: false,
      message: "Minimum, target and conservative must stay in that order (min ≤ target ≤ conservative).",
    });
  });

  it("refuses 'confirmed' with no source, and accepts it with one", () => {
    expect(check("create_budget_line", { data: { ...validLine, informationState: "confirmed" } })).toEqual({
      ok: false,
      message: "Confirmed needs a source -- add one, or set this back to an estimate.",
    });
    expect(
      check("create_budget_line", { data: { ...validLine, informationState: "confirmed", source: { id: SOURCE_ID } } }),
    ).toEqual({ ok: true });
  });

  it("refuses a competition with only one festival date", () => {
    expect(check("create_competition", { data: { name: "x", startDate: "2028-07-01" } })).toEqual({
      ok: false,
      message: "Give both festival dates (first and final day), or neither.",
    });
  });

  it("refuses a source observed in the future", () => {
    expect(check("create_source", { data: { provider: "x", tier: 2, observedOn: "2099-01-01" } })).toEqual({
      ok: false,
      message: "Date can't be in the future",
    });
  });

  it("refuses a payment with neither a budget line nor a category", () => {
    const result = check("create_payment", {
      data: { description: "Deposit", currency: "EUR", totalAmount: 50, refundability: "refundable", timingType: "unknown", competitionRelated: false },
    });
    expect(result).toEqual({ ok: false, message: "Pick a budget category, or choose an existing budget line instead." });
  });

  it("refuses an FX rate whose source reference can't be resolved yet", () => {
    const result = check(
      "create_fx_rate",
      { data: { currency: "EUR", rateToUsd: 1.1, rateDate: "2026-10-01", rateKind: "observed", informationState: "estimate", source: { item: 0 } } },
      null,
      () => null,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a payload that doesn't match its operation", () => {
    expect(check("create_budget_line", { changes: {} })).toEqual({ ok: false, message: "This proposal's contents can't be read." });
  });
});

describe("checkAgainstForm: updates are checked as the row would end up", () => {
  it("applies the change on top of the current values", () => {
    expect(check("update_budget_line", { changes: { amountTarget: { from: 650, to: 600 } } }, LINE_ID)).toEqual({ ok: true });
  });

  it("refuses a change that would break the amount order once applied", () => {
    // 400 is below the line's current minimum of 520.
    expect(check("update_budget_line", { changes: { amountTarget: { from: 650, to: 400 } } }, LINE_ID)).toEqual({
      ok: false,
      message: "Minimum, target and conservative must stay in that order (min ≤ target ≤ conservative).",
    });
  });

  it("refuses an update whose target no longer exists", () => {
    expect(
      check("update_budget_line", { changes: { amountTarget: { from: 1, to: 2 } } }, "70000000-0000-0000-0000-0000000000ff"),
    ).toEqual({ ok: false, message: "The row this proposal updates no longer exists." });
  });

  it("resolves a reference in 'to' before checking", () => {
    const payment = fixtures.payments[0];
    const result = check(
      "update_payment",
      { changes: { informationState: { from: payment.informationState, to: "confirmed" }, source: { from: payment.sourceId, to: { id: SOURCE_ID } } } },
      payment.id,
    );
    expect(result).toEqual({ ok: true });
  });
});

// currentFields() is the TypeScript twin of approve_proposal()'s
// v_current: if it ever left out a field the schema lets an update
// change, the review screen would show that field as stale forever.
describe("currentFields", () => {
  const targets: Record<UpdateOp, string> = {
    update_competition: fixtures.competitions[0].id,
    update_scenario: fixtures.scenarios[0].id,
    update_budget_line: fixtures.budgetLines[0].id,
    update_payment: fixtures.payments[0].id,
    update_fx_rate: fixtures.fxRates[0].id,
    update_savings_entry: fixtures.savingsEntries[0].id,
  };

  it.each(Object.keys(targets) as UpdateOp[])("covers exactly the fields %s can change", (op) => {
    const current = currentFields(op, targets[op], rows);
    expect(Object.keys(current!).sort()).toEqual(Object.keys(UPDATE_CHANGES[op].shape).sort());
  });

  it("returns null for a row that doesn't exist", () => {
    expect(currentFields("update_scenario", "50000000-0000-0000-0000-0000000000ff", rows)).toBeNull();
  });
});
