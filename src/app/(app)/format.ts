import { DateTime } from "luxon";

export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatAmount(amount: number, currency: string): string {
  return amount.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
}

// Same, without trailing ".00" on a whole amount -- for prose, where
// "$1,005" reads better than "$1,005.00" and a real fraction ("£96.50")
// still shows.
export function formatAmountCompact(amount: number, currency: string): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// YYYY-MM-DD values are calendar dates, not instants -- they must never
// go through a time-zone conversion. Parsing as UTC and formatting as
// the runtime's local zone (what the old Date-based version here did)
// is exactly that bug: a server in UTC and a browser in, say,
// America/Guatemala (UTC-6) disagree on which day "midnight UTC" falls
// on, so the same date string renders one day apart depending on where
// it runs. Pinning both the parse and the format to "utc" sidesteps the
// ambient zone entirely, so the result is always the calendar date in
// the string itself. See format.test.ts.
export function formatDate(date: string): string {
  return DateTime.fromISO(date, { zone: "utc" }).toFormat("MMM d, yyyy");
}
