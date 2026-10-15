import { describe, expect, it } from "vitest";

import type { FxRate } from "./convert-to-usd";
import { findMissingFxRates } from "./find-missing-fx-rates";

describe("findMissingFxRates", () => {
  it("never flags USD, even with no rates at all", () => {
    expect(findMissingFxRates({ currencies: ["USD"], rates: [], asOfDate: "2026-10-15" })).toEqual([]);
  });

  it("flags both kinds for a currency with no rates", () => {
    expect(findMissingFxRates({ currencies: ["EUR"], rates: [], asOfDate: "2026-10-15" })).toEqual([
      { currency: "EUR", rateKind: "planning_base" },
      { currency: "EUR", rateKind: "planning_conservative" },
    ]);
  });

  it("flags only the missing kind when the other already has a rate", () => {
    const rates: FxRate[] = [
      { currency: "EUR", rateKind: "planning_base", rateToUsd: 1.1, rateDate: "2026-10-01" },
    ];
    expect(findMissingFxRates({ currencies: ["EUR"], rates, asOfDate: "2026-10-15" })).toEqual([
      { currency: "EUR", rateKind: "planning_conservative" },
    ]);
  });

  it("never counts an observed rate towards either planning kind", () => {
    const rates: FxRate[] = [{ currency: "EUR", rateKind: "observed", rateToUsd: 1.08, rateDate: "2026-10-01" }];
    expect(findMissingFxRates({ currencies: ["EUR"], rates, asOfDate: "2026-10-15" })).toEqual([
      { currency: "EUR", rateKind: "planning_base" },
      { currency: "EUR", rateKind: "planning_conservative" },
    ]);
  });

  it("ignores a rate dated after asOfDate, same rule as convertToUsd", () => {
    const rates: FxRate[] = [
      { currency: "EUR", rateKind: "planning_base", rateToUsd: 1.1, rateDate: "2026-11-01" },
      { currency: "EUR", rateKind: "planning_conservative", rateToUsd: 1.15, rateDate: "2026-11-01" },
    ];
    expect(findMissingFxRates({ currencies: ["EUR"], rates, asOfDate: "2026-10-15" })).toEqual([
      { currency: "EUR", rateKind: "planning_base" },
      { currency: "EUR", rateKind: "planning_conservative" },
    ]);
  });

  it("dedupes repeated currencies and sorts the result", () => {
    const result = findMissingFxRates({ currencies: ["GBP", "EUR", "EUR", "USD"], rates: [], asOfDate: "2026-10-15" });
    expect(result.map((entry) => entry.currency)).toEqual(["EUR", "EUR", "GBP", "GBP"]);
  });

  it("is empty once every currency has both planning rates", () => {
    const rates: FxRate[] = [
      { currency: "EUR", rateKind: "planning_base", rateToUsd: 1.1, rateDate: "2026-10-01" },
      { currency: "EUR", rateKind: "planning_conservative", rateToUsd: 1.15, rateDate: "2026-10-01" },
    ];
    expect(findMissingFxRates({ currencies: ["EUR", "USD"], rates, asOfDate: "2026-10-15" })).toEqual([]);
  });
});
