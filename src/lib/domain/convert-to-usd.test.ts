import { describe, expect, it } from "vitest";
import { convertToUsd, type FxRate } from "./convert-to-usd";

const rates: FxRate[] = [
  { currency: "EUR", rateKind: "observed", rateToUsd: 1.08, rateDate: "2026-10-01" },
  { currency: "EUR", rateKind: "planning_base", rateToUsd: 1.1, rateDate: "2026-10-01" },
  { currency: "EUR", rateKind: "planning_conservative", rateToUsd: 1.15, rateDate: "2026-10-01" },
];

describe("convertToUsd", () => {
  it("passes USD through unchanged with rate 1", () => {
    const result = convertToUsd({ amount: 100, currency: "USD", rateKind: "observed", rates, asOfDate: "2026-10-05" });
    expect(result).toEqual({ amountUsd: 100, rateUsed: 1, rateDate: "2026-10-05" });
  });

  it("converts EUR using the matching observed rate", () => {
    const result = convertToUsd({ amount: 100, currency: "EUR", rateKind: "observed", rates, asOfDate: "2026-10-05" });
    expect(result).toEqual({ amountUsd: 108, rateUsed: 1.08, rateDate: "2026-10-01" });
  });

  it("picks a different rate for the same currency when rateKind differs", () => {
    const observed = convertToUsd({ amount: 100, currency: "EUR", rateKind: "observed", rates, asOfDate: "2026-10-05" });
    const conservative = convertToUsd({
      amount: 100,
      currency: "EUR",
      rateKind: "planning_conservative",
      rates,
      asOfDate: "2026-10-05",
    });
    expect(conservative?.amountUsd).not.toBe(observed?.amountUsd);
    expect(conservative?.rateUsed).toBe(1.15);
  });

  it("returns null when no rate matches the currency/kind -- it never guesses", () => {
    const result = convertToUsd({ amount: 100, currency: "GBP", rateKind: "observed", rates, asOfDate: "2026-10-05" });
    expect(result).toBeNull();
  });

  it("picks the most recent rate on or before asOfDate, never a future-dated one", () => {
    const multiDate: FxRate[] = [
      { currency: "EUR", rateKind: "observed", rateToUsd: 1.05, rateDate: "2026-09-01" },
      { currency: "EUR", rateKind: "observed", rateToUsd: 1.08, rateDate: "2026-10-01" },
      { currency: "EUR", rateKind: "observed", rateToUsd: 1.5, rateDate: "2026-11-01" }, // after asOfDate
    ];
    const result = convertToUsd({
      amount: 100,
      currency: "EUR",
      rateKind: "observed",
      rates: multiDate,
      asOfDate: "2026-10-15",
    });
    expect(result).toEqual({ amountUsd: 108, rateUsed: 1.08, rateDate: "2026-10-01" });
  });
});
