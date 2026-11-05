import { describe, expect, it } from "vitest";

import { buildUnconfirmedDateFacts, type BuildUnconfirmedDateFactsInput } from "./build-unconfirmed-date-facts";

const event = { name: "Thornmere International Choir Festival", startDate: "2029-11-06", datesState: "pending" as const };

describe("buildUnconfirmedDateFacts", () => {
  it("returns nothing when the event is confirmed and the departure window is confirmed", () => {
    const input: BuildUnconfirmedDateFactsInput = {
      event: { ...event, datesState: "confirmed" },
      departure: { source: "trip", confirmed: true },
    };
    expect(buildUnconfirmedDateFacts(input)).toEqual([]);
  });

  it("merges into one fact touching all three figures when the departure date fell back to the event's own, unconfirmed start date", () => {
    const facts = buildUnconfirmedDateFacts({
      event,
      departure: { source: "event", confirmed: false },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0].statement).toContain(event.name);
    expect(facts[0].touchesFlightOptions).toBe(true);
    expect(facts[0].touchesPayments).toBe(true);
    expect(facts[0].touchesSavingsDeadline).toBe(true);
  });

  it("reports the event's unconfirmed dates alone when the window has its own, separately confirmed departure date", () => {
    const facts = buildUnconfirmedDateFacts({
      event,
      departure: { source: "trip", confirmed: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0].statement).toContain(event.name);
    expect(facts[0].touchesFlightOptions).toBe(true);
    expect(facts[0].touchesPayments).toBe(false);
    expect(facts[0].touchesSavingsDeadline).toBe(false);
  });

  it("reports the window's unconfirmed date alone when the event is confirmed but the window isn't", () => {
    const facts = buildUnconfirmedDateFacts({
      event: { ...event, datesState: "confirmed" },
      departure: { source: "trip", confirmed: false },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0].touchesFlightOptions).toBe(false);
    expect(facts[0].touchesPayments).toBe(true);
    expect(facts[0].touchesSavingsDeadline).toBe(true);
  });

  it("names the trip's window when the resolved departure came from the trip's own window", () => {
    const facts = buildUnconfirmedDateFacts({
      event: { ...event, datesState: "confirmed" },
      departure: { source: "trip", confirmed: false },
    });
    expect(facts[0].statement).toMatch(/trip's travel window/);
  });

  it("names the scenario's own window, not the trip's, when the resolved departure came from a scenario override", () => {
    const facts = buildUnconfirmedDateFacts({
      event: { ...event, datesState: "confirmed" },
      departure: { source: "scenario", confirmed: false },
    });
    expect(facts[0].statement).toMatch(/scenario's own travel window/);
  });

  it("returns two separate facts when the event's dates and the window's own dates are both unconfirmed, but independently", () => {
    const facts = buildUnconfirmedDateFacts({
      event,
      departure: { source: "scenario", confirmed: false },
    });
    expect(facts).toHaveLength(2);
    const eventFact = facts.find((f) => f.touchesFlightOptions)!;
    const windowFact = facts.find((f) => !f.touchesFlightOptions)!;
    expect(eventFact.touchesPayments).toBe(false);
    expect(windowFact.touchesPayments).toBe(true);
  });

  // "A trip with no event contributes no unconfirmed event dates"
  // (phase-6.8-provisional-dates.md) -- the trip's own window is still
  // reported "on its own terms".

  it("contributes no event-dates fact at all when the scenario has no event", () => {
    const facts = buildUnconfirmedDateFacts({
      event: null,
      departure: { source: "trip", confirmed: false },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0].touchesFlightOptions).toBe(false);
  });

  it("contributes no event-dates fact when the event exists but its dates aren't published at all yet -- same as checkEventPresence's not_applicable, not provisional", () => {
    const facts = buildUnconfirmedDateFacts({
      event: { name: "Dateless event", startDate: null, datesState: "pending" },
      departure: null,
    });
    expect(facts).toEqual([]);
  });

  it("returns nothing at all when there is no event and no departure to plan against", () => {
    expect(buildUnconfirmedDateFacts({ event: null, departure: null })).toEqual([]);
  });
});
