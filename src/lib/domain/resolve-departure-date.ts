import type { TravelWindowOrigin } from "./resolve-travel-window";
import type { InfoState } from "./types";

export type DepartureSource = TravelWindowOrigin | "event";

export type ResolvedDeparture = {
  /** YYYY-MM-DD -- the date every savings deadline is measured against. */
  date: string;
  /** Where it came from: the traveller's own departure date (the trip's
   * own, or a scenario's override of it), or -- until one of those is
   * set -- the event's first official day. */
  source: DepartureSource;
  /** Whichever date was used is itself confirmed. */
  confirmed: boolean;
};

export type ResolveDepartureDateInput = {
  /** The already-resolved window (resolveTravelWindow()) -- this never
   * re-derives trip-vs-scenario itself, so there's one place deciding
   * that, not two. */
  windowDepartureDate: string | null;
  windowTravelDatesState: InfoState;
  windowOrigin: TravelWindowOrigin;
  /** null when the scenario has no event, or it has no dates yet. */
  eventStartDate: string | null;
  eventDatesState: InfoState | null;
};

/**
 * The date the savings plan treats as "you leave". The resolved travel
 * window's own departure date wins whenever it's set: that's the day
 * income stops being available to save from, and for a routing that
 * arrives days before the event (a Paris arrival, say) it's earlier
 * than the event's first day. Without one, the event's first
 * official day is the best available stand-in, so data recorded before
 * trips had a travel window keeps working unchanged. null when neither
 * exists.
 */
export function resolveDepartureDate(input: ResolveDepartureDateInput): ResolvedDeparture | null {
  if (input.windowDepartureDate !== null) {
    return {
      date: input.windowDepartureDate,
      source: input.windowOrigin,
      confirmed: input.windowTravelDatesState === "confirmed",
    };
  }
  if (input.eventStartDate !== null) {
    return {
      date: input.eventStartDate,
      source: "event",
      confirmed: input.eventDatesState === "confirmed",
    };
  }
  return null;
}
