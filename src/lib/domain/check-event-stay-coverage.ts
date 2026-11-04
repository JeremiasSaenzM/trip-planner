import { DateTime } from "luxon";

import type { StayKind } from "./types";

export type CheckEventStayCoverageInput = {
  stays: { kind: StayKind; startDate: string; nights: number }[];
  /** YYYY-MM-DD, the event's first and final official days. */
  eventStartDate: string | null;
  eventEndDate: string | null;
};

export type EventStayCoverageResult =
  | { status: "unknown" }
  | { status: "ok" }
  | { status: "gap"; uncoveredNights: string[] };

/**
 * Check 2: an event-kind stay must span the night before the first
 * official event day (so there's a bed the night a same-day arrival
 * lands, not just a flight landing that day) through the final
 * official event day's own night (you check out the morning after).
 * What happens inside the event is irrelevant to this check, only
 * the bed either side of it.
 *
 * Reports "unknown" rather than guessing once the event's own
 * dates aren't both set yet -- same reasoning as
 * checkStayNightsMatchWindow.
 */
export function checkEventStayCoverage(input: CheckEventStayCoverageInput): EventStayCoverageResult {
  if (input.eventStartDate === null || input.eventEndDate === null) {
    return { status: "unknown" };
  }

  const covered = new Set<string>();
  for (const stay of input.stays) {
    if (stay.kind !== "event") continue;
    const start = DateTime.fromISO(stay.startDate, { zone: "utc" });
    for (let i = 0; i < stay.nights; i++) {
      covered.add(start.plus({ days: i }).toISODate() as string);
    }
  }

  const firstRequiredNight = DateTime.fromISO(input.eventStartDate, { zone: "utc" }).minus({ days: 1 });
  const lastRequiredNight = DateTime.fromISO(input.eventEndDate, { zone: "utc" });

  const uncoveredNights: string[] = [];
  for (let night = firstRequiredNight; night <= lastRequiredNight; night = night.plus({ days: 1 })) {
    const iso = night.toISODate() as string;
    if (!covered.has(iso)) uncoveredNights.push(iso);
  }

  return uncoveredNights.length === 0 ? { status: "ok" } : { status: "gap", uncoveredNights };
}
