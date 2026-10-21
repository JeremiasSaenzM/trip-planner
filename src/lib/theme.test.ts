import { afterEach, describe, expect, it, vi } from "vitest";

import { readStoredTheme, storeTheme } from "./theme";

// vitest.config.ts runs with environment: "node" (see its own comment on
// why) -- there's no real localStorage, so each test stubs just enough
// of it on globalThis to exercise the try/catch paths.
describe("readStoredTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the stored value when it's a valid theme", () => {
    vi.stubGlobal("localStorage", { getItem: () => "dark" });
    expect(readStoredTheme()).toBe("dark");
  });

  it("falls back to system when nothing is stored", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    expect(readStoredTheme()).toBe("system");
  });

  it("falls back to system for an unrecognized stored value", () => {
    vi.stubGlobal("localStorage", { getItem: () => "sepia" });
    expect(readStoredTheme()).toBe("system");
  });

  it("falls back to system when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readStoredTheme()).toBe("system");
  });
});

describe("storeTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes the preference under the same key readStoredTheme reads", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    storeTheme("light");
    expect(setItem).toHaveBeenCalledWith("theme", "light");
  });

  it("swallows a write failure instead of throwing", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("full");
      },
    });
    expect(() => storeTheme("dark")).not.toThrow();
  });
});
