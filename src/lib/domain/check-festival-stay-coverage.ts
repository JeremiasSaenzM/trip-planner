import { DateTime } from "luxon";

import type { StayKind } from "./types";

export type CheckFestivalStayCoverageInput = {
  stays: { kind: StayKind; startDate: string; nights: number }[];
  /** YYYY-MM-DD, the competition's first and final official days. */
  festivalStartDate: string | null;
  festivalEndDate: string | null;
};

export type FestivalStayCoverageResult =
  | { status: "unknown" }
  | { status: "ok" }
  | { status: "gap"; uncoveredNights: string[] };

/**
 * Check 2: a festival-kind stay must span the night before the first
 * official festival day (so there's a bed the night a same-day arrival
 * lands, not just a flight landing that day) through the final
 * official festival day's own night (you check out the morning after).
 * What happens inside the festival is irrelevant to this check, only
 * the bed either side of it.
 *
 * Reports "unknown" rather than guessing once the competition's own
 * dates aren't both set yet -- same reasoning as
 * checkStayNightsMatchWindow.
 */
export function checkFestivalStayCoverage(input: CheckFestivalStayCoverageInput): FestivalStayCoverageResult {
  if (input.festivalStartDate === null || input.festivalEndDate === null) {
    return { status: "unknown" };
  }

  const covered = new Set<string>();
  for (const stay of input.stays) {
    if (stay.kind !== "festival") continue;
    const start = DateTime.fromISO(stay.startDate, { zone: "utc" });
    for (let i = 0; i < stay.nights; i++) {
      covered.add(start.plus({ days: i }).toISODate() as string);
    }
  }

  const firstRequiredNight = DateTime.fromISO(input.festivalStartDate, { zone: "utc" }).minus({ days: 1 });
  const lastRequiredNight = DateTime.fromISO(input.festivalEndDate, { zone: "utc" });

  const uncoveredNights: string[] = [];
  for (let night = firstRequiredNight; night <= lastRequiredNight; night = night.plus({ days: 1 })) {
    const iso = night.toISODate() as string;
    if (!covered.has(iso)) uncoveredNights.push(iso);
  }

  return uncoveredNights.length === 0 ? { status: "ok" } : { status: "gap", uncoveredNights };
}
