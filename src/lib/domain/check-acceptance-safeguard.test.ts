import { describe, expect, it } from "vitest";

import { checkAcceptanceSafeguard } from "./check-acceptance-safeguard";

describe("checkAcceptanceSafeguard", () => {
  it("passes, with no acceptance needed, when the fare is refundable", () => {
    const result = checkAcceptanceSafeguard({
      refundability: "refundable",
      competitionRelated: true,
      competitionAccepted: false,
      riskAccepted: false,
    });
    expect(result).toEqual({
      status: "pass",
      requiresAcceptance: false,
      reasons: ["refundable or partially refundable -- no commitment at risk"],
    });
  });

  it("passes when partially refundable too", () => {
    const result = checkAcceptanceSafeguard({
      refundability: "partially_refundable",
      competitionRelated: true,
      competitionAccepted: false,
      riskAccepted: false,
    });
    expect(result.status).toBe("pass");
  });

  it("passes when the fare isn't competition-related, even if non-refundable", () => {
    const result = checkAcceptanceSafeguard({
      refundability: "non_refundable",
      competitionRelated: false,
      competitionAccepted: false,
      riskAccepted: false,
    });
    expect(result).toEqual({ status: "pass", requiresAcceptance: false, reasons: ["not competition-related"] });
  });

  it("raises -- never fails -- a non-refundable, competition-related fare with nothing accepted", () => {
    const result = checkAcceptanceSafeguard({
      refundability: "non_refundable",
      competitionRelated: true,
      competitionAccepted: false,
      riskAccepted: false,
    });
    expect(result.status).toBe("unknown");
    expect(result.requiresAcceptance).toBe(true);
  });

  it("treats unrecorded refundability the same as non-refundable, not as the safe kind", () => {
    const result = checkAcceptanceSafeguard({
      refundability: "unknown",
      competitionRelated: true,
      competitionAccepted: false,
      riskAccepted: false,
    });
    expect(result.status).toBe("unknown");
    expect(result.requiresAcceptance).toBe(true);
  });

  it("passes once the competition is accepted", () => {
    const result = checkAcceptanceSafeguard({
      refundability: "non_refundable",
      competitionRelated: true,
      competitionAccepted: true,
      riskAccepted: false,
    });
    expect(result).toEqual({ status: "pass", requiresAcceptance: false, reasons: ["the competition is accepted"] });
  });

  it("passes once this specific ticket's risk is explicitly accepted", () => {
    const result = checkAcceptanceSafeguard({
      refundability: "non_refundable",
      competitionRelated: true,
      competitionAccepted: false,
      riskAccepted: true,
    });
    expect(result).toEqual({
      status: "pass",
      requiresAcceptance: false,
      reasons: ["this ticket's risk has been explicitly accepted"],
    });
  });
});
