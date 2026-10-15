import type { FxRate } from "./convert-to-usd";
import type { RateKind } from "./types";

// The two kinds anything in this app ever looks up through convertToUsd()
// -- rollUpBudgetByScenario() and buildObligations() each check exactly
// these two. "observed" is never looked up by either, so it's not part
// of "missing" here.
const RATE_KINDS_NEEDED: RateKind[] = ["planning_base", "planning_conservative"];

export type MissingFxRate = { currency: string; rateKind: RateKind };

export type FindMissingFxRatesInput = {
  /** Every currency actually in use trip-wide (budget lines' and
   * payments' own currency columns) -- USD is filtered out below, since
   * convertToUsd() never needs a rate for it. Duplicates are fine. */
  currencies: string[];
  rates: FxRate[];
  /** YYYY-MM-DD. A rate dated after this isn't usable yet, matching
   * convertToUsd()'s own "on or before asOfDate" rule -- a future-dated
   * rate must not make a currency look covered before it actually is. */
  asOfDate: string;
};

/**
 * The trip-wide, explicit answer to "which FX rates am I missing": every
 * (currency, rateKind) pair actually needed by a budget line or payment
 * that has no usable rate yet. Unlike rollUpBudgetByScenario's and
 * buildObligations's own missingRates (scenario/obligation-scoped, and
 * only as a side effect of converting something), this is the dedicated,
 * trip-wide list the Budget Lines page's FX section renders directly --
 * never a currency code to guess at.
 */
export function findMissingFxRates(input: FindMissingFxRatesInput): MissingFxRate[] {
  const currencies = Array.from(new Set(input.currencies.filter((currency) => currency !== "USD"))).sort();

  const missing: MissingFxRate[] = [];
  for (const currency of currencies) {
    for (const rateKind of RATE_KINDS_NEEDED) {
      const hasUsableRate = input.rates.some(
        (rate) => rate.currency === currency && rate.rateKind === rateKind && rate.rateDate <= input.asOfDate,
      );
      if (!hasUsableRate) {
        missing.push({ currency, rateKind });
      }
    }
  }

  return missing;
}
