import { DateTime } from "luxon";

export type OnwardTravelMovement = {
  sequence: number;
  fromLocation: string;
  toLocation: string;
  departDate: string;
  departTime: string | null;
  arriveDate: string;
  arriveTime: string | null;
  flightOptionId: string | null;
};

export type CalculateOnwardTravelMinutesInput = {
  flightOptionId: string;
  /** This scenario's full movement chain, any order. */
  movements: OnwardTravelMovement[];
  /** The festival-kind stay's location, i.e. "actually being at the
   * destination" per hard constraint 2 -- null when no festival-kind
   * stay is recorded yet. */
  festivalStayLocation: string | null;
};

export type OnwardTravelResult =
  | { status: "unknown"; reason: string }
  | { status: "known"; minutes: number; caveat: string };

// Movements carry naive local clock times with no time zone of their
// own (20261023090000_stays_movements.sql) -- unlike flight_segments,
// which are real timestamptz. Walking this chain to a time difference
// is a plain clock subtraction, with no way to tell whether a time zone
// was silently crossed along the way. If one was, crossed WESTWARD
// (clocks go back) it UNDERSTATES the true elapsed time -- the unsafe
// direction for an arrive-in-time check, since it makes a late arrival
// look on time. Crossed EASTWARD (clocks go forward) it OVERSTATES it --
// safe, in that it can only make this check stricter than reality, never
// more lenient. There is nothing in this data to say whether either
// happened, so this is stated every time a number comes back, not only
// when a crossing is suspected -- a check that can't be certain should
// say which way it's uncertain, not stay silent about it.
export const NAIVE_LOCAL_TIME_CAVEAT =
  "Computed from these movements' own local clock times, which carry no time zone. If this leg " +
  "crosses a time zone boundary travelling west, this understates elapsed travel time -- the unsafe " +
  "direction for this check. Travelling east, it overstates it, which is safe here.";

function toLocalInstant(date: string, time: string): DateTime {
  return DateTime.fromISO(`${date}T${time}`, { zone: "utc" });
}

/**
 * "Minutes from landing to actually being at the destination"
 * (checkFestivalArrivalDeparture's onwardTravelMinutes) -- walked from
 * the movement linked to this flight option forward along the chain,
 * by sequence, until a leg arrives at the festival-kind stay's
 * location. Includes any waiting time between legs, not just time
 * actually travelling.
 */
export function calculateOnwardTravelMinutes(input: CalculateOnwardTravelMinutesInput): OnwardTravelResult {
  if (input.festivalStayLocation === null) {
    return { status: "unknown", reason: "no festival-kind stay recorded to travel onward to" };
  }

  const sorted = [...input.movements].sort((a, b) => a.sequence - b.sequence);
  const flightIndex = sorted.findIndex((movement) => movement.flightOptionId === input.flightOptionId);
  if (flightIndex === -1) {
    return { status: "unknown", reason: "no movement in this scenario is linked to this flight option" };
  }

  const flightMovement = sorted[flightIndex];
  if (flightMovement.toLocation === input.festivalStayLocation) {
    return { status: "known", minutes: 0, caveat: NAIVE_LOCAL_TIME_CAVEAT };
  }
  if (flightMovement.arriveTime === null) {
    return { status: "unknown", reason: "the flight's own movement has no recorded arrival time of day" };
  }

  let totalMinutes = 0;
  let anchor = toLocalInstant(flightMovement.arriveDate, flightMovement.arriveTime);

  for (let i = flightIndex + 1; i < sorted.length; i++) {
    const leg = sorted[i];
    if (leg.departTime === null || leg.arriveTime === null) {
      return { status: "unknown", reason: `movement #${leg.sequence} has no recorded time of day` };
    }

    const departs = toLocalInstant(leg.departDate, leg.departTime);
    const arrives = toLocalInstant(leg.arriveDate, leg.arriveTime);
    totalMinutes += departs.diff(anchor, "minutes").minutes + arrives.diff(departs, "minutes").minutes;
    anchor = arrives;

    if (leg.toLocation === input.festivalStayLocation) {
      return { status: "known", minutes: totalMinutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
    }
  }

  return { status: "unknown", reason: "the movement chain after this flight never reaches the festival stay's location" };
}
