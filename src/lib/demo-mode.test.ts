import { afterEach, describe, expect, it, vi } from "vitest";

import { assertDemoModeIsSafe, assertWritesAllowed, isDemoMode } from "./demo-mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDemoMode", () => {
  it("is false when DEMO_MODE is unset", () => {
    vi.stubEnv("DEMO_MODE", undefined);
    expect(isDemoMode()).toBe(false);
  });

  it("is true only for the literal string 'true'", () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect(isDemoMode()).toBe(true);

    vi.stubEnv("DEMO_MODE", "1");
    expect(isDemoMode()).toBe(false);
  });
});

describe("assertDemoModeIsSafe", () => {
  it("throws when demo mode is on in production", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(() => assertDemoModeIsSafe()).toThrow(/must only ever be scoped to Preview/);
  });

  it("does not throw when demo mode is on in preview", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(() => assertDemoModeIsSafe()).not.toThrow();
  });

  it("does not throw when demo mode is off in production", () => {
    vi.stubEnv("DEMO_MODE", undefined);
    vi.stubEnv("VERCEL_ENV", "production");

    expect(() => assertDemoModeIsSafe()).not.toThrow();
  });
});

describe("assertWritesAllowed", () => {
  it("throws in demo mode", () => {
    vi.stubEnv("DEMO_MODE", "true");

    expect(() => assertWritesAllowed()).toThrow(/disabled in demo mode/);
  });

  it("does not throw outside demo mode", () => {
    vi.stubEnv("DEMO_MODE", undefined);

    expect(() => assertWritesAllowed()).not.toThrow();
  });
});
