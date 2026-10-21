import type { InfoState } from "./types";

export type DepartureSource = "trip" | "competition";

export type ResolvedDeparture = {
  /** YYYY-MM-DD -- the date every savings deadline is measured against. */
  date: string;
  /** Where it came from: the traveller's own departure date, or -- until
   * that's set -- the competition's first official day. */
  source: DepartureSource;
  /** Whichever date was used is itself confirmed. */
  confirmed: boolean;
};

export type ResolveDepartureDateInput = {
  tripDepartureDate: string | null;
  tripTravelDatesState: InfoState;
  /** null when the scenario has no competition, or it has no dates yet. */
  competitionStartDate: string | null;
  competitionDatesState: InfoState | null;
};

/**
 * The date the savings plan treats as "you leave". The trip's own
 * departure date wins whenever it's set: that's the day income stops
 * being available to save from, and for a routing that arrives days
 * before the festival (a Paris arrival, say) it's earlier than the
 * competition's first day. Without one, the competition's first official
 * day is the best available stand-in, so data recorded before trips had
 * a travel window keeps working unchanged. null when neither exists.
 */
export function resolveDepartureDate(input: ResolveDepartureDateInput): ResolvedDeparture | null {
  if (input.tripDepartureDate !== null) {
    return {
      date: input.tripDepartureDate,
      source: "trip",
      confirmed: input.tripTravelDatesState === "confirmed",
    };
  }
  if (input.competitionStartDate !== null) {
    return {
      date: input.competitionStartDate,
      source: "competition",
      confirmed: input.competitionDatesState === "confirmed",
    };
  }
  return null;
}
