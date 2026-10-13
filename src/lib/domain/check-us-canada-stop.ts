import { worstStatus, type HardConstraintResult } from "./types";

/** US + its territories, per hard constraint 1. */
const US_AND_TERRITORIES = new Set(["US", "PR", "GU", "VI", "AS", "MP", "UM"]);
const CANADA = "CA";

export type FlightSegmentStopInput = {
  direction: "outbound" | "return";
  segmentOrder: number;
  /** ISO-2 country code of where this segment lands. null if not recorded. */
  toCountry: string | null;
};

export type UsCanadaStopResult = HardConstraintResult & {
  stopCountries: string[];
};

function isUsOrCanada(countryCode: string): boolean {
  return countryCode === CANADA || US_AND_TERRITORIES.has(countryCode);
}

/**
 * Hard constraint 1: no itinerary may stop in the US or Canada (any
 * connection, technical/refuelling stop, or same-flight-number stop --
 * overflight is fine). Evaluated per direction: the LAST segment of each
 * direction is the actual destination, never a "stop"; every segment
 * before that is.
 *
 * A technical/refuelling stop only counts if it is entered as its own
 * flight_segment row -- if a stop is folded into a single segment's
 * duration instead of being modeled as a distinct leg, this function has
 * no way to see it.
 */
export function checkUsCanadaStop(segments: FlightSegmentStopInput[]): UsCanadaStopResult {
  const byDirection = new Map<string, FlightSegmentStopInput[]>();
  for (const segment of segments) {
    const bucket = byDirection.get(segment.direction) ?? [];
    bucket.push(segment);
    byDirection.set(segment.direction, bucket);
  }

  const stopCountries = new Set<string>();
  const reasons: string[] = [];
  let hasUnknownStop = false;

  for (const [direction, directionSegments] of byDirection) {
    const sorted = [...directionSegments].sort((a, b) => a.segmentOrder - b.segmentOrder);
    const intermediateStops = sorted.slice(0, -1);

    for (const stop of intermediateStops) {
      if (stop.toCountry === null) {
        hasUnknownStop = true;
        reasons.push(`${direction} segment ${stop.segmentOrder} has no recorded country`);
        continue;
      }
      if (isUsOrCanada(stop.toCountry)) {
        stopCountries.add(stop.toCountry);
        reasons.push(`${direction} segment ${stop.segmentOrder} stops in ${stop.toCountry}`);
      }
    }
  }

  const status = worstStatus([
    stopCountries.size > 0 ? "fail" : "pass",
    hasUnknownStop ? "unknown" : "pass",
  ]);

  if (status === "pass") {
    reasons.push("no intermediate stop in the US, a US territory, or Canada");
  }

  return { status, reasons, stopCountries: [...stopCountries] };
}
