import { describe, expect, it } from "vitest";

import { checkNightsAccountedFor } from "./build-itinerary-timeline";
import { checkBudgetLineNightsAddUp } from "./check-budget-line-nights-add-up";
import { checkStayNightsMatchWindow } from "./check-stay-nights-match-window";

// checkStayNightsMatchWindow, checkNightsAccountedFor and
// checkBudgetLineNightsAddUp all read countNightsInBeds() rather than
// each counting nights its own way -- this is what let check 1 and
// check 4 disagree in the first place (06.4b). Once they share one
// function this should be trivially true; it's pinned anyway, the
// same way savings-pipeline.test.ts pins its own set of checks, so a
// future change that splits them apart again fails loudly instead of
// quietly.
describe("the nights-in-beds checks agree with each other", () => {
  it("agrees for a scenario with an overnight movement crossing midnight", () => {
    const movements = [
      { sequence: 1, fromLocation: "Home", toLocation: "Away", departDate: "2027-07-02", arriveDate: "2027-07-03" },
      { sequence: 2, fromLocation: "Away", toLocation: "Home", departDate: "2027-07-14", arriveDate: "2027-07-14" },
    ];
    const stays = [{ nights: 11 }];
    const tripDepartureDate = "2027-07-02";
    const tripReturnDate = "2027-07-14";

    const stayCheck = checkStayNightsMatchWindow({ stays, movements, tripDepartureDate, tripReturnDate });
    const linesCheck = checkBudgetLineNightsAddUp({
      budgetLines: [{ quantity: 11, quantityUnit: "night" }],
      movements,
      tripDepartureDate,
      tripReturnDate,
    });
    const unaccounted = checkNightsAccountedFor(movements, [{ location: "Away", startDate: "2027-07-03", nights: 11 }]);

    expect(stayCheck).toEqual({ status: "ok" });
    expect(linesCheck).toEqual({ status: "ok" });
    // No night with nobody to attribute it to -- check 4 agrees there
    // were only 11 nights that needed a bed, same as the other two.
    expect(unaccounted).toEqual([]);
  });

  it("agrees when a scenario's nights genuinely don't add up", () => {
    const movements = [
      { sequence: 1, fromLocation: "Home", toLocation: "Away", departDate: "2027-07-02", arriveDate: "2027-07-03" },
      { sequence: 2, fromLocation: "Away", toLocation: "Home", departDate: "2027-07-14", arriveDate: "2027-07-14" },
    ];
    const tripDepartureDate = "2027-07-02";
    const tripReturnDate = "2027-07-14";

    const stayCheck = checkStayNightsMatchWindow({
      stays: [{ nights: 10 }],
      movements,
      tripDepartureDate,
      tripReturnDate,
    });
    const linesCheck = checkBudgetLineNightsAddUp({
      budgetLines: [{ quantity: 10, quantityUnit: "night" }],
      movements,
      tripDepartureDate,
      tripReturnDate,
    });

    expect(stayCheck).toEqual({ status: "mismatch", staysNights: 10, windowNights: 11 });
    expect(linesCheck).toEqual({ status: "mismatch", linesNights: 10, bedsNights: 11 });
  });
});
