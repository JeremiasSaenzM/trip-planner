import { DateTime } from "luxon";

export type TimelineMovement = {
  sequence: number;
  fromLocation: string;
  toLocation: string;
  departDate: string;
  arriveDate: string;
};

export type TimelineStay = {
  location: string;
  startDate: string;
  nights: number;
};

export type ItineraryNight =
  | { type: "in_transit" }
  | { type: "at"; location: string }
  // The day of the final arrival home -- there's no trip night left to
  // account for, so it's neither in transit nor at a destination.
  | { type: "home" };

export type ItineraryDay<M extends TimelineMovement = TimelineMovement> = {
  /** YYYY-MM-DD. */
  date: string;
  /** Every movement that departs this day, in sequence order. */
  movements: M[];
  night: ItineraryNight;
};

export type PathContinuityIssue = {
  sequence: number;
  expectedFromLocation: string;
  actualFromLocation: string;
};

export type UnaccountedNight = {
  date: string;
  requiredLocation: string;
};

function sortBySequence<M extends TimelineMovement>(movements: M[]): M[] {
  return [...movements].sort((a, b) => a.sequence - b.sequence);
}

function datesBetween(start: string, endExclusive: string): string[] {
  const dates: string[] = [];
  let day = DateTime.fromISO(start, { zone: "utc" });
  const end = DateTime.fromISO(endExclusive, { zone: "utc" });
  while (day < end) {
    dates.push(day.toISODate() as string);
    day = day.plus({ days: 1 });
  }
  return dates;
}

// Every night some movement crosses overnight -- its own
// [departDate, arriveDate) span, needing no bed. The one place that
// decides this: buildItineraryTimeline's per-day walk and
// countNightsInBeds's total both read from it, rather than each
// walking the chain's spans again its own way.
function transitNightDates(movements: TimelineMovement[]): Set<string> {
  const dates = new Set<string>();
  for (const movement of movements) {
    for (const date of datesBetween(movement.departDate, movement.arriveDate)) {
      dates.add(date);
    }
  }
  return dates;
}

/**
 * Walks a scenario's movement chain once, in sequence order, to answer
 * "where does the traveller sleep each night". Every other export in
 * this file is an assertion over that same walk -- checks 3 and 4 are
 * folded in here rather than split into their own files, since
 * splitting them would mean either walking the chain twice or passing
 * this structure between files for no benefit.
 *
 * A night falls into exactly one of three buckets: crossed by a
 * movement still in the air (no bed needed -- an overnight flight's own
 * [departDate, arriveDate) span), spent wherever the most recent
 * movement landed (the gap between one movement's arrival and the
 * next one's departure), or -- for the single day of the final
 * arrival -- home, with no trip night left to account for.
 */
export function buildItineraryTimeline<M extends TimelineMovement>(movements: M[]): ItineraryDay<M>[] {
  if (movements.length === 0) return [];

  const sorted = sortBySequence(movements);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const nightByDate = new Map<string, ItineraryNight>();

  for (const date of transitNightDates(sorted)) {
    nightByDate.set(date, { type: "in_transit" });
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    for (const date of datesBetween(current.arriveDate, next.departDate)) {
      nightByDate.set(date, { type: "at", location: current.toLocation });
    }
  }
  nightByDate.set(last.arriveDate, { type: "home" });

  const movementsByDepartDate = new Map<string, M[]>();
  for (const movement of sorted) {
    const existing = movementsByDepartDate.get(movement.departDate) ?? [];
    existing.push(movement);
    movementsByDepartDate.set(movement.departDate, existing);
  }

  const days: ItineraryDay<M>[] = [];
  let day = DateTime.fromISO(first.departDate, { zone: "utc" });
  const lastDay = DateTime.fromISO(last.arriveDate, { zone: "utc" });
  while (day <= lastDay) {
    const date = day.toISODate() as string;
    days.push({
      date,
      movements: movementsByDepartDate.get(date) ?? [],
      night: nightByDate.get(date) ?? { type: "home" },
    });
    day = day.plus({ days: 1 });
  }

  return days;
}

export type NightsInBedsInput = {
  movements: TimelineMovement[];
  /** YYYY-MM-DD, the trip's own departure and return dates -- never
   * resolveDepartureDate()'s fallback to the competition's first day.
   * A consistency check is under no obligation to always produce a
   * number the way the savings plan is, so it reports "unknown"
   * instead of guessing once these aren't both set. */
  tripDepartureDate: string | null;
  tripReturnDate: string | null;
};

export type NightsInBedsResult = { status: "unknown" } | { status: "ok"; nights: number };

/**
 * The one definition of "a night that needs a bed": every night of the
 * trip's own travel window, less any night some movement crosses
 * overnight. checkStayNightsMatchWindow, checkNightsAccountedFor (via
 * buildItineraryTimeline above) and checkBudgetLineNightsAddUp all
 * call this -- or share its transitNightDates() -- rather than each
 * counting nights its own way. That's what let the two disagree in
 * the first place: check 1 summed the window as a plain diff, while
 * check 4's walk already subtracted transit nights.
 */
export function countNightsInBeds(input: NightsInBedsInput): NightsInBedsResult {
  if (input.tripDepartureDate === null || input.tripReturnDate === null) {
    return { status: "unknown" };
  }

  const departure = DateTime.fromISO(input.tripDepartureDate, { zone: "utc" });
  const returnDate = DateTime.fromISO(input.tripReturnDate, { zone: "utc" });
  const windowNights = returnDate.diff(departure, "days").days;

  const transit = transitNightDates(input.movements);
  const nightsInTransit = datesBetween(input.tripDepartureDate, input.tripReturnDate).filter((date) =>
    transit.has(date),
  ).length;

  return { status: "ok", nights: windowNights - nightsInTransit };
}

/**
 * Days on the ground, counted from the movement chain itself (never
 * the travel window -- the chain's own first departure to final
 * arrival is what "on the ground" means here, same as the night-by-
 * night strip). Every day but the final arrival-home one.
 */
export function countDaysOnGround(movements: TimelineMovement[]): number {
  return buildItineraryTimeline(movements).filter((day) => day.night.type !== "home").length;
}

/**
 * Check 3: each movement's from_location has to match the previous
 * movement's to_location -- the chain never teleports. Only compares
 * adjacent pairs, in sequence order; a chain of one movement has
 * nothing to compare.
 */
export function checkPathContinuity(movements: TimelineMovement[]): PathContinuityIssue[] {
  const sorted = sortBySequence(movements);
  const issues: PathContinuityIssue[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (current.fromLocation !== previous.toLocation) {
      issues.push({
        sequence: current.sequence,
        expectedFromLocation: previous.toLocation,
        actualFromLocation: current.fromLocation,
      });
    }
  }

  return issues;
}

/**
 * Check 4: every night away either has a movement crossing it (no bed
 * needed) or a stay covering it at the location the movement chain
 * actually leaves the traveller at that point -- a stay in the wrong
 * city doesn't count, even if its dates line up. Built on the same
 * walk as buildItineraryTimeline(), filtered to the nights that
 * actually need a bed.
 */
export function checkNightsAccountedFor(movements: TimelineMovement[], stays: TimelineStay[]): UnaccountedNight[] {
  const days = buildItineraryTimeline(movements);
  const issues: UnaccountedNight[] = [];

  for (const day of days) {
    const night = day.night;
    if (night.type !== "at") continue;

    const covered = stays.some((stay) => {
      if (stay.location !== night.location) return false;
      const end = DateTime.fromISO(stay.startDate, { zone: "utc" }).plus({ days: stay.nights }).toISODate() as string;
      return day.date >= stay.startDate && day.date < end;
    });

    if (!covered) {
      issues.push({ date: day.date, requiredLocation: night.location });
    }
  }

  return issues;
}
