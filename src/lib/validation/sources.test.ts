import { describe, expect, it } from "vitest";

import { createSourceInput } from "./sources";

const VALID = { provider: "Choir festival website", tier: 2, observedOn: "2026-01-01" };

describe("createSourceInput", () => {
  it("accepts a valid source", () => {
    expect(createSourceInput.safeParse(VALID).success).toBe(true);
  });

  it("accepts an optional url and notes", () => {
    const result = createSourceInput.safeParse({ ...VALID, url: "https://example.com", notes: "Checked twice" });
    expect(result.success).toBe(true);
  });

  // Source URLs are rendered as links on the import review screen, so
  // only a scheme a browser navigates to is allowed -- .url() alone
  // accepts these.
  it.each(["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd", "ftp://example.com"])(
    "rejects a non-http(s) url: %s",
    (url) => {
      expect(createSourceInput.safeParse({ ...VALID, url }).success).toBe(false);
    },
  );

  it("accepts an http url as well as https", () => {
    expect(createSourceInput.safeParse({ ...VALID, url: "http://example.com/fares" }).success).toBe(true);
  });

  it("rejects a tier outside 1-6", () => {
    expect(createSourceInput.safeParse({ ...VALID, tier: 7 }).success).toBe(false);
  });

  it("rejects a malformed observation date", () => {
    expect(createSourceInput.safeParse({ ...VALID, observedOn: "01/01/2027" }).success).toBe(false);
  });

  it("rejects an observation date in the future", () => {
    expect(createSourceInput.safeParse({ ...VALID, observedOn: "2099-01-01" }).success).toBe(false);
  });

  it("accepts an optional, open-ended applicable period", () => {
    const result = createSourceInput.safeParse({ ...VALID, applicablePeriodStart: "2027-01-01" });
    expect(result.success).toBe(true);
  });

  it("rejects an applicable period that ends before it starts", () => {
    const result = createSourceInput.safeParse({
      ...VALID,
      applicablePeriodStart: "2027-02-01",
      applicablePeriodEnd: "2027-01-01",
    });
    expect(result.success).toBe(false);
  });
});
