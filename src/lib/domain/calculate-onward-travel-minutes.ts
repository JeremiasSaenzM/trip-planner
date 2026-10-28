import { DateTime } from "luxon";

export type OnwardTravelMovement = {
  sequence: number;
  fromLocationId: string;
  toLocationId: string;
  // The IANA zone of fromLocationId/toLocationId respectively, resolved
  // by the caller (flight-evaluation.ts) from the locations table --
  // this file only ever sees ids and zones, never a lookup. Null when
  // that location doesn't have a zone recorded yet.
  fromZone: string | null;
  toZone: string | null;
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
  /** The festival-kind stay's location id, i.e. "actually being at the
   * destination" per hard constraint 2 -- null when no festival-kind
   * stay is recorded yet. */
  festivalStayLocationId: string | null;
};

export type OnwardTravelResult =
  | { status: "unknown"; reason: string }
  | { status: "known"; minutes: number }
  | { status: "bounded"; minMinutes: number; maxMinutes: number };

function zonedEarliest(date: string, time: string | null, zone: string): DateTime {
  return earliestPossibleInstant(date, time).setZone(zone, { keepLocalTime: true });
}

function zonedLatest(date: string, time: string | null, zone: string): DateTime {
  return latestPossibleInstant(date, time).setZone(zone, { keepLocalTime: true });
}

function toLocalInstant(date: string, time: string): DateTime {
  return DateTime.fromISO(`${date}T${time}`, { zone: "utc" });
}

// An untimed leg's own instant could be anywhere within its recorded
// date -- bounding it this way is interval arithmetic on dates actually
// recorded, not a guess at a journey time. Used in pairs (one call for
// the earliest end of an interval, one for the latest) so a caller can
// test whether the pessimistic combination still settles a question,
// or the optimistic one already settles it the other way. Both are
// built on a UTC placeholder instant -- a real caller re-zones the
// result with .setZone(zone, { keepLocalTime: true }) (zonedEarliest/
// zonedLatest above), which keeps this pair's own logic untouched by
// the move to real per-location zones (locations table, 20261029090000).
export function earliestPossibleInstant(date: string, time: string | null): DateTime {
  return time !== null ? toLocalInstant(date, time) : DateTime.fromISO(`${date}T00:00:00`, { zone: "utc" });
}

// 23:59, not the exclusive start of the next day -- 59 seconds short of
// the true end of day. Here, where this instant feeds a maxMinutes
// directly (the destination leg's own arrival), the shortfall nudges
// the pessimistic bound very slightly early, leaning toward pass. Where
// it's instead the endpoint being SUBTRACTED to form minMinutes (the
// flight's own arrival), the same shortfall nudges minMinutes very
// slightly late, leaning toward fail -- the safer direction -- but
// still worth naming rather than claiming one uniform lean. A caller
// using this standalone, not in such a pair (findFestivalDeparture),
// only ever sees the first lean. Either way it's under a minute against
// day-granularity data, immaterial here. If anything ever hinges on
// that margin, the honest pessimistic bound is the next day's start,
// exclusive, not 23:59.
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
 * time actually is, known or not, cancels regardless of its value. This
 * holds however each endpoint is zoned, since it's instant subtraction
 * throughout. A "known" result still requires every leg's time AND zone
 * recorded (half-timed, or half-zoned, data is a smell even where it's
 * numerically moot); when that's not so, the same two endpoints --
 * bounded by the day they're recorded on where a time is missing --
 * still bound the total, which is often enough to settle hard
 * constraint 2 without the missing time of day.
 */
export function calculateOnwardTravelMinutes(input: CalculateOnwardTravelMinutesInput): OnwardTravelResult {
  if (input.festivalStayLocationId === null) {
    return { status: "unknown", reason: "no festival-kind stay recorded to travel onward to" };
  }

  const sorted = [...input.movements].sort((a, b) => a.sequence - b.sequence);
  const flightIndex = sorted.findIndex((movement) => movement.flightOptionId === input.flightOptionId);
  if (flightIndex === -1) {
    return { status: "unknown", reason: "no movement in this scenario is linked to this flight option" };
  }

  const flightMovement = sorted[flightIndex];
  if (flightMovement.toLocationId === input.festivalStayLocationId) {
    return { status: "known", minutes: 0 };
  }

  let destinationIndex = -1;
  for (let i = flightIndex + 1; i < sorted.length; i++) {
    if (sorted[i].toLocationId === input.festivalStayLocationId) {
      destinationIndex = i;
      break;
    }
  }
  if (destinationIndex === -1) {
    return { status: "unknown", reason: "the movement chain after this flight never reaches the festival stay's location" };
  }

  const onwardLegs = sorted.slice(flightIndex + 1, destinationIndex + 1);
  const destination = sorted[destinationIndex];

  if (flightMovement.toZone === null || destination.toZone === null) {
    return { status: "unknown", reason: "a location on this route has no time zone recorded yet" };
  }

  const allTimesKnown =
    flightMovement.arriveTime !== null && onwardLegs.every((leg) => leg.departTime !== null && leg.arriveTime !== null);
  const allZonesKnown = onwardLegs.every((leg) => leg.fromZone !== null && leg.toZone !== null);

  if (allTimesKnown && allZonesKnown) {
    let totalMinutes = 0;
    let anchor = zonedEarliest(flightMovement.arriveDate, flightMovement.arriveTime, flightMovement.toZone);
    for (const leg of onwardLegs) {
      const departs = zonedEarliest(leg.departDate, leg.departTime, leg.fromZone as string);
      const arrives = zonedEarliest(leg.arriveDate, leg.arriveTime, leg.toZone as string);
      totalMinutes += departs.diff(anchor, "minutes").minutes + arrives.diff(departs, "minutes").minutes;
      anchor = arrives;
    }
    return { status: "known", minutes: totalMinutes };
  }

  const minMinutes = zonedEarliest(destination.arriveDate, destination.arriveTime, destination.toZone).diff(
    zonedLatest(flightMovement.arriveDate, flightMovement.arriveTime, flightMovement.toZone),
    "minutes",
  ).minutes;
  const maxMinutes = zonedLatest(destination.arriveDate, destination.arriveTime, destination.toZone).diff(
    zonedEarliest(flightMovement.arriveDate, flightMovement.arriveTime, flightMovement.toZone),
    "minutes",
  ).minutes;
  return { status: "bounded", minMinutes, maxMinutes };
}
