import { describe, expect, it } from "vitest";
import { checkBaggageAllowance } from "./check-baggage-allowance";

describe("checkBaggageAllowance", () => {
  it("passes when baggage is included, with no add-on fee required", () => {
    const result = checkBaggageAllowance({ baggage: "included" });
    expect(result.status).toBe("pass");
    expect(result.requiresAddonFee).toBe(false);
  });

  it("passes when baggage is a paid add-on, flagging the fee", () => {
    const result = checkBaggageAllowance({ baggage: "paid_addon" });
    expect(result.status).toBe("pass");
    expect(result.requiresAddonFee).toBe(true);
  });

  it("fails when baggage is not allowed", () => {
    const result = checkBaggageAllowance({ baggage: "not_allowed" });
    expect(result.status).toBe("fail");
  });

  it("returns unknown when baggage allowance is unknown -- never a conservative fail", () => {
    const result = checkBaggageAllowance({ baggage: "unknown" });
    expect(result.status).toBe("unknown");
  });
});
