import { DateTime } from "luxon";

export type OverlappingStaysInput = {
  id: string;
  locationId: string;
  startDate: string;
  nights: number;
};

export type OverlappingStaysResult = {
  date: string;
  stays: { id: string; locationId: string }[];
};

/**
 * The existing 6.4 night-coverage checks (checkNightsAccountedFor,
 * checkEventStayCoverage) only ask whether some stay covers a given
 * night -- they're gap detectors, structurally blind to the same
 * night being covered by two stays at different locations, which is
 * impossible (not uncertain), so it's reported at BLOCK/error tier
 * rather than folded into the warning-tier checks (Phase 6.11).
 * Two stays at the SAME location sharing a night (e.g. a booking
 * recorded in two overlapping pieces) is not flagged -- nothing
 * impossible about that.
 */
export function findOverlappingStays(stays: OverlappingStaysInput[]): OverlappingStaysResult[] {
  const byDate = new Map<string, { id: string; locationId: string }[]>();

  for (const stay of stays) {
    const start = DateTime.fromISO(stay.startDate, { zone: "utc" });
    for (let i = 0; i < stay.nights; i++) {
      const iso = start.plus({ days: i }).toISODate() as string;
      const existing = byDate.get(iso) ?? [];
      existing.push({ id: stay.id, locationId: stay.locationId });
      byDate.set(iso, existing);
    }
  }

  const overlaps: OverlappingStaysResult[] = [];
  for (const [date, entries] of byDate) {
    const distinctLocations = new Set(entries.map((entry) => entry.locationId));
    if (distinctLocations.size > 1) {
      overlaps.push({ date, stays: entries });
    }
  }

  return overlaps.sort((a, b) => a.date.localeCompare(b.date));
}
