import type { RateKind } from "./types";

export type FxRate = {
  currency: string;
  rateKind: RateKind;
  rateToUsd: number;
  /** YYYY-MM-DD */
  rateDate: string;
};

export type ConvertToUsdInput = {
  amount: number;
  currency: string;
  rateKind: RateKind;
  rates: FxRate[];
  /** YYYY-MM-DD */
  asOfDate: string;
};

export type ConvertToUsdResult = {
  amountUsd: number;
  rateUsed: number;
  rateDate: string;
};

/**
 * Converts an amount to USD using the most recent rate of the requested
 * kind on or before asOfDate -- never a future-dated one, and never a
 * guess: no matching rate returns null rather than inventing a source.
 */
export function convertToUsd(input: ConvertToUsdInput): ConvertToUsdResult | null {
  if (input.currency === "USD") {
    return { amountUsd: input.amount, rateUsed: 1, rateDate: input.asOfDate };
  }

  const candidates = input.rates.filter(
    (rate) =>
      rate.currency === input.currency &&
      rate.rateKind === input.rateKind &&
      rate.rateDate <= input.asOfDate,
  );

  if (candidates.length === 0) {
    return null;
  }

  const mostRecent = candidates.reduce((best, candidate) =>
    candidate.rateDate > best.rateDate ? candidate : best,
  );

  return {
    amountUsd: input.amount * mostRecent.rateToUsd,
    rateUsed: mostRecent.rateToUsd,
    rateDate: mostRecent.rateDate,
  };
}
