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
  | { status: "known"; minutes: number; caveat: string }
  | { status: "bounded"; minMinutes: number; maxMinutes: number; caveat: string };

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

// An untimed leg's own instant could be anywhere within its recorded
// date -- bounding it this way is interval arithmetic on dates actually
// recorded, not a guess at a journey time. Used in pairs (one call for
// the earliest end of an interval, one for the latest) so a caller can
// test whether the pessimistic combination still settles a question,
// or the optimistic one already settles it the other way.
export function earliestPossibleInstant(date: string, time: string | null): DateTime {
  return time !== null ? toLocalInstant(date, time) : DateTime.fromISO(`${date}T00:00:00`, { zone: "utc" });
}

// 23:59, not the exclusive start of the next day -- 59 seconds short of
// the true end of day. Where this instant feeds a maxMinutes directly
// (the destination leg's own arrival here; the flight's own departure
// in the travel-to-airport mirror), the shortfall nudges the pessimistic
// bound very slightly early, leaning toward pass. Where it's instead the
// endpoint being SUBTRACTED to form minMinutes (the flight's own arrival
// here; the origin leg's own departure there), the same shortfall nudges
// minMinutes very slightly late, leaning toward fail -- the safer
// direction, per NAIVE_LOCAL_TIME_CAVEAT's own reasoning, but still
// worth naming rather than claiming one uniform lean. Either way it's
// under a minute against day-granularity data, immaterial here. If
// anything ever hinges on that margin, the honest pessimistic bound is
// the next day's start, exclusive, not 23:59.
export function latestPossibleInstant(date: string, time: string | null): DateTime {
  return time !== null ? toLocalInstant(date, time) : DateTime.fromISO(`${date}T23:59:00`, { zone: "utc" });
}

/**
 * "Minutes from landing to actually being at the destination"
 * (checkFestivalArrivalDeparture's onwardTravel) -- walked from
 * the movement linked to this flight option forward along the chain,
 * by sequence, until a leg arrives at the festival-kind stay's
 * location. Includes any waiting time between legs, not just time
 * actually travelling.
 *
 * Every leg's own depart/arrive instant telescopes out of this sum
 * algebraically -- (departs - anchor) + (arrives - departs) reduces to
 * (arrives - anchor) -- so only the flight's own arrival and the final
 * leg's own arrival ever determine the total; what an intermediate leg's
 * time actually is, known or not, cancels regardless of its value. A
 * "known" result still requires every leg's times recorded (half-timed
 * data is a smell even where it's numerically moot), but when that's not
 * so, the same two endpoints -- bounded by the day they're recorded on
 * where a time is missing -- still bound the total, which is often
 * enough to settle hard constraint 2 without the missing time of day.
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

  let destinationIndex = -1;
  for (let i = flightIndex + 1; i < sorted.length; i++) {
    if (sorted[i].toLocation === input.festivalStayLocation) {
      destinationIndex = i;
      break;
    }
  }
  if (destinationIndex === -1) {
    return { status: "unknown", reason: "the movement chain after this flight never reaches the festival stay's location" };
  }

  const onwardLegs = sorted.slice(flightIndex + 1, destinationIndex + 1);
  const destination = sorted[destinationIndex];
  const allTimesKnown =
    flightMovement.arriveTime !== null && onwardLegs.every((leg) => leg.departTime !== null && leg.arriveTime !== null);

  if (allTimesKnown) {
    let totalMinutes = 0;
    let anchor = toLocalInstant(flightMovement.arriveDate, flightMovement.arriveTime as string);
    for (const leg of onwardLegs) {
      const departs = toLocalInstant(leg.departDate, leg.departTime as string);
      const arrives = toLocalInstant(leg.arriveDate, leg.arriveTime as string);
      totalMinutes += departs.diff(anchor, "minutes").minutes + arrives.diff(departs, "minutes").minutes;
      anchor = arrives;
    }
    return { status: "known", minutes: totalMinutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
  }

  const minMinutes = earliestPossibleInstant(destination.arriveDate, destination.arriveTime).diff(
    latestPossibleInstant(flightMovement.arriveDate, flightMovement.arriveTime),
    "minutes",
  ).minutes;
  const maxMinutes = latestPossibleInstant(destination.arriveDate, destination.arriveTime).diff(
    earliestPossibleInstant(flightMovement.arriveDate, flightMovement.arriveTime),
    "minutes",
  ).minutes;
  return { status: "bounded", minMinutes, maxMinutes, caveat: NAIVE_LOCAL_TIME_CAVEAT };
}
