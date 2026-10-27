import { DateTime } from "luxon";

import {
  earliestPossibleInstant,
  latestPossibleInstant,
  NAIVE_LOCAL_TIME_CAVEAT,
  type OnwardTravelMovement,
  type OnwardTravelResult,
} from "./calculate-onward-travel-minutes";

export type CalculateTravelToAirportMinutesInput = {
  flightOptionId: string;
  /** This scenario's full movement chain, any order. */
  movements: OnwardTravelMovement[];
  /** The festival-kind stay's location -- null when no festival-kind
   * stay is recorded yet. */
  festivalStayLocation: string | null;
};

function toLocalInstant(date: string, time: string): DateTime {
  return DateTime.fromISO(`${date}T${time}`, { zone: "utc" });
}

/**
 * "Minutes from leaving the festival stay to being at the departure
 * airport" (checkFestivalArrivalDeparture's travelToAirport) --
 * the departure-side mirror of calculateOnwardTravelMinutes. One flight
 * option covers both directions (FlightSegment.direction), so a round
 * trip can link the SAME flightOptionId to two movements -- the
 * outbound one first in sequence, the return one last. This walks
 * backward from the LAST movement linked to this option, by sequence,
 * to the festival-kind stay's location, summing waiting and travel time
 * exactly as the onward side does, just in the other direction -- and,
 * when a time of day is missing along the way, bounding the total from
 * the two endpoints' recorded dates rather than giving up, exactly as
 * the onward side does too.
 */
export function calculateTravelToAirportMinutes(input: CalculateTravelToAirportMinutesInput): OnwardTravelResult {
  if (input.festivalStayLocation === null) {
    return { status: "unknown", reason: "no festival-kind stay recorded to travel from" };
  }

  const sorted = [...input.movements].sort((a, b) => a.sequence - b.sequence);
  let flightIndex = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].flightOptionId === input.flightOptionId) {
      flightIndex = i;
      break;
    }
  }
  if (flightIndex === -1) {
    return { status: "unknown", reason: "no movement in this scenario is linked to this flight option" };
  }

  const flightMovement = sorted[flightIndex];
  if (flightMovement.fromLocation === input.festivalStayLocation) {
    return { status: "known", minutes: 0, caveat: NAIVE_LOCAL_TIME_CAVEAT };
  }

  let originIndex = -1;
  for (let i = flightIndex - 1; i >= 0; i--) {
    if (sorted[i].fromLocation === input.festivalStayLocation) {
      originIndex = i;
      break;
    }
  }
  if (originIndex === -1) {
    return {
      status: "unknown",
      reason: "the movement chain before this flight never starts from the festival stay's location",
    };
  }

  // Same telescoping as the onward side, walked backward: only the
  // flight's own departure and the origin leg's own departure ever
  // determine the total, so those two endpoints -- bounded by their own
  // recorded date where a time is missing -- still bound it even when
  // an intermediate leg's time doesn't.
  const priorLegs = sorted.slice(originIndex, flightIndex);
  const origin = sorted[originIndex];
  const allTimesKnown =
    flightMovement.departTime !== null && priorLegs.every((leg) => leg.departTime !== null && leg.arriveTime !== null);

  if (allTimesKnown) {
    let totalMinutes = 0;
    let anchor = toLocalInstant(flightMovement.departDate, flightMovement.departTime as string);
    for (let i = flightIndex - 1; i >= originIndex; i--) {
      const leg = sorted[i];
      const departs = toLocalInstant(leg.departDate, leg.departTime as string);
      const arrives = toLocalInstant(leg.arriveDate, leg.arriveTime as string);
      totalMinutes += anchor.diff(arrives, "minutes").minutes + arrives.diff(departs, "minutes").minutes;
      anchor = departs;
    }
    return { status: "known", minutes: totalMinutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
  }

  const minMinutes = earliestPossibleInstant(flightMovement.departDate, flightMovement.departTime).diff(
    latestPossibleInstant(origin.departDate, origin.departTime),
    "minutes",
  ).minutes;
  const maxMinutes = latestPossibleInstant(flightMovement.departDate, flightMovement.departTime).diff(
    earliestPossibleInstant(origin.departDate, origin.departTime),
    "minutes",
  ).minutes;
  return { status: "bounded", minMinutes, maxMinutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
}
