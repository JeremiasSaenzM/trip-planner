import { DateTime } from "luxon";

/**
 * When the traveller's income arrives -- a property of the traveller, not
 * of the savings calculation. Money can only be set aside from income
 * that has already arrived, so a saving deadline is really the last
 * income date on or before the day the money is owed.
 *
 * Only one cadence exists so far. A new one (a mid-month payday, every
 * other Friday) is a new `kind` here plus a case in
 * lastIncomeDateOnOrBefore(); nothing else in the pipeline knows which
 * cadence it's given.
 */
export type IncomeCadence = { kind: "month_end" };

/** The traveller's own cadence: income arrives on the last day of each month. */
export const TRAVELLER_INCOME_CADENCE: IncomeCadence = { kind: "month_end" };

/**
 * YYYY-MM-DD: the last income date on or before `date`. A date that is
 * itself an income date stays put; a payment owed on 1 or 2 July, at
 * month-end cadence, has to be saved for by 30 June, because July's
 * income arrives too late for it.
 */
export function lastIncomeDateOnOrBefore(date: string, cadence: IncomeCadence): string {
  const day = DateTime.fromISO(date, { zone: "utc" });
  switch (cadence.kind) {
    case "month_end": {
      if (day.day === day.daysInMonth) return date;
      return day.startOf("month").minus({ days: 1 }).toISODate()!;
    }
  }
}

/**
 * How many income dates fall after `afterDate` and on or before
 * `onOrBeforeDate` -- the number of times money can still be set aside
 * before a deadline. Income arriving on `afterDate` itself ("today") is
 * not counted: by then it's already in, or about to be in, what's been
 * set aside. 0 when no income arrives in between.
 *
 * This is what a monthly saving divides by. At month-end cadence it's a
 * whole number of months, never a fraction: 20 October to 30 June is 9
 * paydays (31 Oct ... 30 Jun), not 8.3 months.
 */
export function incomeDatesBetween(afterDate: string, onOrBeforeDate: string, cadence: IncomeCadence): number {
  if (onOrBeforeDate <= afterDate) return 0;
  switch (cadence.kind) {
    case "month_end": {
      // Both ends snapped back to a month-end: the month-ends strictly
      // after the first and up to the second are exactly the months
      // between those two.
      const monthIndex = (date: string) => {
        const day = DateTime.fromISO(lastIncomeDateOnOrBefore(date, cadence), { zone: "utc" });
        return day.year * 12 + day.month;
      };
      return monthIndex(onOrBeforeDate) - monthIndex(afterDate);
    }
  }
}
