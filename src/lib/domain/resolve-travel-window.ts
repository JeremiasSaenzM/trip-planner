import type { InfoState } from "./types";

export type TravelWindowOrigin = "trip" | "scenario";

export type ResolvedTravelWindow = {
  departureDate: string | null;
  returnDate: string | null;
  travelDatesState: InfoState;
  travelDatesSourceId: string | null;
  origin: TravelWindowOrigin;
};

export type TravelWindowFields = {
  departureDate: string | null;
  returnDate: string | null;
  travelDatesState: InfoState;
  travelDatesSourceId: string | null;
};

/**
 * The one place that decides whether a scenario's own travel window, or
 * the trip's, is in effect. A scenario's window is all-or-nothing
 * (scenarios_travel_dates_together), so checking departureDate alone is
 * enough to tell the two apart -- same reasoning resolveDepartureDate()
 * already uses to tell the trip's own date from the competition's.
 *
 * Every reader of "the travel window" -- the travel-window check,
 * stay-nights-match-window, budget-line-nights-add-up, and
 * resolveDepartureDate()'s savings clamp -- calls this first and reads its
 * result, never trips.departureDate or scenarios.departureDate directly.
 * That's what keeps the two copies of this fact from disagreeing.
 */
export function resolveTravelWindow(scenario: TravelWindowFields, trip: TravelWindowFields): ResolvedTravelWindow {
  if (scenario.departureDate !== null) {
    return { ...scenario, origin: "scenario" };
  }
  return { ...trip, origin: "trip" };
}
