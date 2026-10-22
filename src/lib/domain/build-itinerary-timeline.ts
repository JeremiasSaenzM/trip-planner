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

  for (const movement of sorted) {
    for (const date of datesBetween(movement.departDate, movement.arriveDate)) {
      nightByDate.set(date, { type: "in_transit" });
    }
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
