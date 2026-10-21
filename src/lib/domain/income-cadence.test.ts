import { describe, expect, it } from "vitest";

import { incomeDatesBetween, lastIncomeDateOnOrBefore, TRAVELLER_INCOME_CADENCE } from "./income-cadence";

const monthEnd = TRAVELLER_INCOME_CADENCE;

describe("lastIncomeDateOnOrBefore, month-end income", () => {
  it("moves the 1st of a month back to the previous month-end", () => {
    expect(lastIncomeDateOnOrBefore("2028-07-01", monthEnd)).toBe("2028-06-30");
  });

  it("moves a mid-month date back to the previous month-end", () => {
    expect(lastIncomeDateOnOrBefore("2028-07-15", monthEnd)).toBe("2028-06-30");
  });

  it("keeps a date that is already a month-end", () => {
    expect(lastIncomeDateOnOrBefore("2028-01-31", monthEnd)).toBe("2028-01-31");
    expect(lastIncomeDateOnOrBefore("2028-06-30", monthEnd)).toBe("2028-06-30");
  });

  it("knows February's month-end, leap year or not", () => {
    expect(lastIncomeDateOnOrBefore("2028-02-29", monthEnd)).toBe("2028-02-29");
    expect(lastIncomeDateOnOrBefore("2028-03-01", monthEnd)).toBe("2028-02-29");
    expect(lastIncomeDateOnOrBefore("2027-02-28", monthEnd)).toBe("2027-02-28");
    expect(lastIncomeDateOnOrBefore("2027-03-10", monthEnd)).toBe("2027-02-28");
  });

  it("crosses a year boundary", () => {
    expect(lastIncomeDateOnOrBefore("2028-01-05", monthEnd)).toBe("2027-12-31");
  });
});

describe("incomeDatesBetween, month-end income", () => {
  it("counts every month-end after today up to the deadline", () => {
    // 31 Oct, 30 Nov, ..., 30 Jun.
    expect(incomeDatesBetween("2026-10-20", "2027-06-30", monthEnd)).toBe(9);
  });

  it("doesn't count today's income when today is a month-end", () => {
    expect(incomeDatesBetween("2026-10-31", "2027-06-30", monthEnd)).toBe(8);
  });

  it("counts none when the deadline comes before the next income", () => {
    expect(incomeDatesBetween("2026-10-20", "2026-10-25", monthEnd)).toBe(0);
    expect(incomeDatesBetween("2026-10-20", "2026-10-20", monthEnd)).toBe(0);
  });

  it("counts one for a deadline on the next month-end", () => {
    expect(incomeDatesBetween("2026-10-20", "2026-10-31", monthEnd)).toBe(1);
  });

  it("adds up across consecutive stretches", () => {
    const whole = incomeDatesBetween("2026-10-20", "2028-06-30", monthEnd);
    const parts =
      incomeDatesBetween("2026-10-20", "2027-01-31", monthEnd) +
      incomeDatesBetween("2027-01-31", "2028-02-29", monthEnd) +
      incomeDatesBetween("2028-02-29", "2028-06-30", monthEnd);
    expect(parts).toBe(whole);
    expect(whole).toBe(21);
  });
});
