import { DateTime } from "luxon";

import { NAIVE_LOCAL_TIME_CAVEAT, type OnwardTravelMovement, type OnwardTravelResult } from "./calculate-onward-travel-minutes";

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
 * airport" (checkFestivalArrivalDeparture's travelToAirportMinutes) --
 * the departure-side mirror of calculateOnwardTravelMinutes. One flight
 * option covers both directions (FlightSegment.direction), so a round
 * trip can link the SAME flightOptionId to two movements -- the
 * outbound one first in sequence, the return one last. This walks
 * backward from the LAST movement linked to this option, by sequence,
 * to the festival-kind stay's location, summing waiting and travel time
 * exactly as the onward side does, just in the other direction.
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
  if (flightMovement.departTime === null) {
    return { status: "unknown", reason: "the flight's own movement has no recorded departure time of day" };
  }

  let totalMinutes = 0;
  let anchor = toLocalInstant(flightMovement.departDate, flightMovement.departTime);

  for (let i = flightIndex - 1; i >= 0; i--) {
    const leg = sorted[i];
    if (leg.departTime === null || leg.arriveTime === null) {
      return { status: "unknown", reason: `movement #${leg.sequence} has no recorded time of day` };
    }

    const departs = toLocalInstant(leg.departDate, leg.departTime);
    const arrives = toLocalInstant(leg.arriveDate, leg.arriveTime);
    totalMinutes += anchor.diff(arrives, "minutes").minutes + arrives.diff(departs, "minutes").minutes;
    anchor = departs;

    if (leg.fromLocation === input.festivalStayLocation) {
      return { status: "known", minutes: totalMinutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
    }
  }

  return {
    status: "unknown",
    reason: "the movement chain before this flight never starts from the festival stay's location",
  };
}
