import { describe, expect, it } from "vitest";

import * as fixtures from "@/lib/data/fixtures";
import type { ProposalOp } from "@/lib/data/types";

import { checkAgainstForm, currentFields, type CurrentRows, type ResolveReference } from "./form-check";
import { UPDATE_CHANGES, type UpdateOp } from "./schema";

const TRIP_ID = "20000000-0000-0000-0000-000000000001";
const SCENARIO_ID = "50000000-0000-0000-0000-000000000001";
const LINE_ID = "70000000-0000-0000-0000-000000000002"; // Round-trip flight: 520 / 650 / 820 GBP
const SOURCE_ID = "30000000-0000-0000-0000-000000000001";
const LOCATION_ID = fixtures.locations[0].id;

const rows: CurrentRows = {
  trips: fixtures.trips,
  events: fixtures.events,
  scenarios: fixtures.scenarios,
  budgetLines: fixtures.budgetLines,
  payments: fixtures.payments,
  fxRates: fixtures.fxRates,
  savingsEntries: fixtures.savingsEntries,
  stays: fixtures.stays,
  movements: fixtures.movements,
  locations: fixtures.locations,
  flightOptions: fixtures.flightOptions,
  flightSegments: fixtures.flightSegments,
  accommodationOptions: fixtures.accommodationOptions,
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

  it("refuses an event with only one date", () => {
    expect(check("create_event", { data: { name: "x", startDate: "2028-07-01" } })).toEqual({
      ok: false,
      message: "Give both event dates (first and final day), or neither.",
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
      data: { description: "Deposit", currency: "EUR", totalAmount: 50, refundability: "refundable", timingType: "unknown" },
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

  it("accepts a quantity with its unit, and refuses a quantity with no unit", () => {
    expect(check("create_budget_line", { data: { ...validLine, quantity: 15, quantityUnit: "day" } })).toEqual({
      ok: true,
    });
    expect(check("create_budget_line", { data: { ...validLine, quantity: 15 } })).toEqual({
      ok: false,
      message: "A quantity needs a unit, and a unit needs a quantity -- set both, or neither.",
    });
  });

  it("accepts a valid stay", () => {
    expect(
      check("create_stay", {
        data: {
          scenario: { id: SCENARIO_ID },
          location: { id: LOCATION_ID },
          startDate: "2027-07-04",
          nights: 8,
          kind: "event",
          informationState: "estimate",
        },
      }),
    ).toEqual({ ok: true });
  });

  it("accepts an accommodation option whose observed window matches its stay", () => {
    const stay = fixtures.stays[0];
    expect(
      check("create_accommodation_option", {
        data: {
          stay: { id: stay.id },
          label: "A new candidate",
          propertyName: "Some Hotel",
          rateAmount: 100,
          rateUnit: "per_night",
          nights: stay.nights,
          mandatoryFees: 0,
          currency: "EUR",
          informationState: "estimate",
          source: { id: SOURCE_ID },
          observedOn: "2026-10-05",
          observedStartDate: stay.startDate,
          refundability: "unknown",
          conditionalRate: false,
          isHostel: false,
        },
      }),
    ).toEqual({ ok: true });
  });

  it("refuses an accommodation option observed for the wrong night, not just a warning (Phase 6.11)", () => {
    const stay = fixtures.stays[0];
    const result = check("create_accommodation_option", {
      data: {
        stay: { id: stay.id },
        label: "A new candidate",
        propertyName: "Some Hotel",
        rateAmount: 100,
        rateUnit: "per_night",
        nights: stay.nights,
        mandatoryFees: 0,
        currency: "EUR",
        informationState: "estimate",
        source: { id: SOURCE_ID },
        observedOn: "2026-10-05",
        observedStartDate: "2031-03-05", // the stay starts 2031-03-04
        refundability: "unknown",
        conditionalRate: false,
        isHostel: false,
      },
    });
    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).toContain("an accommodation figure must be backed by the nights it funds");
  });

  it("refuses a movement that arrives before it departs, a form-only cross-field rule", () => {
    const result = check("create_movement", {
      data: {
        scenario: { id: SCENARIO_ID },
        sequence: 1,
        fromLocation: { id: LOCATION_ID },
        toLocation: { id: LOCATION_ID },
        departDate: "2027-07-04",
        arriveDate: "2027-07-03",
        mode: "plane",
        informationState: "estimate",
      },
    });
    expect(result.ok).toBe(false);
  });

  // Unlike every other create op, no tripId is injected -- a trip has
  // no parent of its own to attach to.
  it("accepts a named trip, with no reference fields to resolve", () => {
    expect(check("create_trip", { data: { name: "Mexico City 2027" } })).toEqual({ ok: true });
  });

  it("refuses a blank trip name", () => {
    expect(check("create_trip", { data: { name: "  " } }).ok).toBe(false);
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

  it("refuses setting a quantity with no unit, same as create", () => {
    // LINE_ID's quantity/quantityUnit both start null -- see fixtures.ts.
    expect(
      check("update_budget_line", { changes: { quantity: { from: null, to: 13 } } }, LINE_ID),
    ).toEqual({
      ok: false,
      message: "A quantity needs a unit, and a unit needs a quantity -- set both, or neither.",
    });
  });

  it("accepts setting a quantity and its unit together", () => {
    expect(
      check(
        "update_budget_line",
        { changes: { quantity: { from: null, to: 13 }, quantityUnit: { from: null, to: "night" } } },
        LINE_ID,
      ),
    ).toEqual({ ok: true });
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

  it("applies a stay update on top of the current values", () => {
    const stay = fixtures.stays[0];
    expect(check("update_stay", { changes: { nights: { from: stay.nights, to: 9 } } }, stay.id)).toEqual({ ok: true });
  });

  it("resolves and applies a flightOption link on a stay, the field the Scenario page's own picker sets", () => {
    const stay = fixtures.stays[0];
    const flightOptionId = fixtures.flightOptions[0].id;
    const result = check(
      "update_stay",
      { changes: { flightOption: { from: stay.flightOptionId, to: { id: flightOptionId } } } },
      stay.id,
    );
    expect(result).toEqual({ ok: true });
  });

  it("refuses a movement update that would break the form's arrive-after-depart rule", () => {
    const movement = fixtures.movements[0];
    const result = check(
      "update_movement",
      { changes: { arriveDate: { from: movement.arriveDate, to: "2027-07-01" } } },
      movement.id,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses moving an accommodation option's observed night off its stay's own night (Phase 6.11)", () => {
    const option = fixtures.accommodationOptions[0]; // observed for 2031-03-04, matching its stay
    const result = check(
      "update_accommodation_option",
      { changes: { observedStartDate: { from: option.observedStartDate, to: "2031-03-05" } } },
      option.id,
    );
    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).toContain("an accommodation figure must be backed by the nights it funds");
  });

  it("accepts moving an accommodation option's observed night onto its stay's own night", () => {
    const option = fixtures.accommodationOptions[1]; // starts undated -- see fixtures.ts
    const stay = fixtures.stays.find((candidate) => candidate.id === option.stayId)!;
    expect(
      check(
        "update_accommodation_option",
        { changes: { observedStartDate: { from: option.observedStartDate, to: stay.startDate } } },
        option.id,
      ),
    ).toEqual({ ok: true });
  });

  it("applies a trip rename and status change on top of the current values", () => {
    const trip = fixtures.trips[0];
    const result = check(
      "update_trip",
      { changes: { name: { from: trip.name, to: "Renamed" }, status: { from: trip.status, to: "confirmed" } } },
      trip.id,
    );
    expect(result).toEqual({ ok: true });
  });

  it("refuses a blank trip name on update too", () => {
    const trip = fixtures.trips[0];
    const result = check("update_trip", { changes: { name: { from: trip.name, to: "  " } } }, trip.id);
    expect(result.ok).toBe(false);
  });
});

// currentFields() is the TypeScript twin of approve_proposal()'s
// v_current: if it ever left out a field the schema lets an update
// change, the review screen would show that field as stale forever.
describe("currentFields", () => {
  const targets: Record<UpdateOp, string> = {
    update_event: fixtures.events[0].id,
    update_scenario: fixtures.scenarios[0].id,
    update_budget_line: fixtures.budgetLines[0].id,
    update_payment: fixtures.payments[0].id,
    update_fx_rate: fixtures.fxRates[0].id,
    update_savings_entry: fixtures.savingsEntries[0].id,
    update_stay: fixtures.stays[0].id,
    update_movement: fixtures.movements[0].id,
    update_flight_option: fixtures.flightOptions[0].id,
    update_location: fixtures.locations[0].id,
    update_accommodation_option: fixtures.accommodationOptions[0].id,
    update_trip: fixtures.trips[0].id,
  };

  it.each(Object.keys(targets) as UpdateOp[])("covers exactly the fields %s can change", (op) => {
    const current = currentFields(op, targets[op], rows);
    expect(Object.keys(current!).sort()).toEqual(Object.keys(UPDATE_CHANGES[op].shape).sort());
  });

  it("returns null for a row that doesn't exist", () => {
    expect(currentFields("update_scenario", "50000000-0000-0000-0000-0000000000ff", rows)).toBeNull();
  });
});
