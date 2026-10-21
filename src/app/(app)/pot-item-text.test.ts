import { describe, expect, it } from "vitest";

import type { DeadlinePotItem } from "@/lib/domain/build-deadline-pots";

import { departureAnchorText, potItemText } from "./pot-item-text";

function item(overrides: Partial<DeadlinePotItem>): DeadlinePotItem {
  return {
    description: "Item",
    amountUsd: 0,
    originalAmount: 0,
    originalCurrency: "USD",
    originalDueDate: null,
    timing: "on_date",
    ...overrides,
  };
}

describe("potItemText", () => {
  it("names the real due date of a payment due on its own date", () => {
    expect(
      potItemText(item({ description: "London nights", originalAmount: 96, originalCurrency: "GBP", originalDueDate: "2028-07-04" })),
    ).toBe("London nights — £96, due Jul 4, 2028");
  });

  it("says a payment due after departure is needed before you leave, keeping its own date", () => {
    expect(
      potItemText(
        item({ description: "Paris nights", originalAmount: 1005, originalDueDate: "2028-07-10", timing: "moved_to_departure" }),
      ),
    ).toBe("Paris nights — $1,005, due Jul 10, 2028, needed before you leave");
  });

  it("says an undated payment has no due date and is assumed due at departure", () => {
    expect(potItemText(item({ description: "Competition fee", originalAmount: 50, timing: "undated" }))).toBe(
      "Competition fee — $50, no due date, assumed due at departure",
    );
  });

  it("says an unallocated remainder has no payment yet", () => {
    expect(potItemText(item({ description: "Food (unallocated)", originalAmount: 400, timing: "unallocated" }))).toBe(
      "Food (unallocated) — $400, no payment recorded yet, assumed due at departure",
    );
  });
});

describe("departureAnchorText", () => {
  it("names the trip's own departure date when that's the anchor", () => {
    expect(departureAnchorText({ date: "2028-07-02", source: "trip", confirmed: false })).toBe(
      "Saving toward your departure on Jul 2, 2028.",
    );
  });

  it("says the festival's first day is a stand-in when the trip has no departure date", () => {
    expect(departureAnchorText({ date: "2028-07-05", source: "competition", confirmed: true })).toBe(
      "No departure date set for the trip yet, so saving toward the festival's first day, Jul 5, 2028.",
    );
  });
});
