import { describe, expect, it } from "vitest";

import { lastIncomeDateOnOrBefore, TRAVELLER_INCOME_CADENCE } from "./income-cadence";

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
