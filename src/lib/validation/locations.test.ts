import { describe, expect, it } from "vitest";

import { createLocationInput, deleteLocationInput, updateLocationInput } from "./locations";

describe("createLocationInput", () => {
  it("accepts a name alone, with no time zone or notes", () => {
    expect(createLocationInput.safeParse({ name: "Fontvieux" }).success).toBe(true);
  });

  it("accepts a valid IANA time zone and notes", () => {
    const result = createLocationInput.safeParse({ name: "Fontvieux", timezone: "Europe/Paris", notes: "Festival venue" });
    expect(result.success).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(createLocationInput.safeParse({ name: "  " }).success).toBe(false);
  });

  // Mirrors the locations table's own before-insert-or-update trigger,
  // which checks the same value against pg_timezone_names.
  it("rejects a time zone that isn't a recognized IANA name", () => {
    expect(createLocationInput.safeParse({ name: "Fontvieux", timezone: "Europe/Pairs" }).success).toBe(false);
  });
});

describe("updateLocationInput", () => {
  it("requires a reason", () => {
    const base = { id: "11111111-1111-4111-8111-111111111111", name: "Fontvieux" };
    expect(updateLocationInput.safeParse(base).success).toBe(false);
    expect(updateLocationInput.safeParse({ ...base, reason: "Fixed a typo" }).success).toBe(true);
  });
});

describe("deleteLocationInput", () => {
  it("requires a reason", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(deleteLocationInput.safeParse({ id }).success).toBe(false);
    expect(deleteLocationInput.safeParse({ id, reason: "Duplicate of another location" }).success).toBe(true);
  });
});
