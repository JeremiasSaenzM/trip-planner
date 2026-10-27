import { DateTime } from "luxon";
import type { OnwardTravelResult } from "./calculate-onward-travel-minutes";
import { worstStatus, type ConstraintStatus, type HardConstraintResult, type InfoState } from "./types";

export type FestivalArrivalDepartureInput = {
  /** ISO-8601 instant the inbound flight lands. */
  outboundArrivalAt: string | null;
  /** Minutes from landing to actually being at the destination. */
  onwardTravel: OnwardTravelResult;
  /** ISO-8601 instant the outbound flight home departs. */
  returnDepartureAt: string | null;
  /** Minutes from the destination to the departure airport. */
  travelToAirport: OnwardTravelResult;
  /** YYYY-MM-DD, the first official festival day. */
  festivalStartDate: string | null;
  /** YYYY-MM-DD, the final official festival day. */
  festivalEndDate: string | null;
  /** IANA zone the festival dates are expressed in. */
  timezone: string | null;
  datesInformationState: InfoState;
};

// Movement times being naive local with no time zone of their own is a
// real limitation on what this check can promise -- the condition on
// which that simplification was accepted was that the limitation stay
// stated, not merely computed. onwardTravel/travelToAirport already
// carry it (NAIVE_LOCAL_TIME_CAVEAT); checkFestivalArrivalDeparture only
// has to forward it, deduplicated, whenever either leg actually used a
// movement-based figure to decide this (known or bounded, never when
// a leg is unknown and so never used one at all).
export type FestivalArrivalDepartureResult = HardConstraintResult & { provisional: boolean; caveats: string[] };

// A zero-width bound (min === max) means both endpoints that actually
// determine the total were recorded times, not substituted day-limits
// -- any untimed leg in between was one whose own time telescopes out
// of the sum regardless of its value, per calculateOnwardTravelMinutes'
// own reasoning. Saying that rests "on the recorded dates alone" would
// understate its basis; it rests on the recorded times, exactly. A real
// (non-zero) interval is the only case that actually leans on dates
// without a time of day.
function boundBasisPhrase(minMinutes: number, maxMinutes: number): string {
  return minMinutes === maxMinutes
    ? "on the recorded times, exactly -- an untimed leg in between the two that matter doesn't affect this"
    : "on the recorded dates alone";
}

function arrivalLeg(input: FestivalArrivalDepartureInput): { status: ConstraintStatus; reason: string } {
  if (!input.outboundArrivalAt || !input.festivalStartDate || !input.timezone) {
    return { status: "unknown", reason: "missing arrival time, festival start date, or time zone" };
  }

  const arrivalInstant = DateTime.fromISO(input.outboundArrivalAt);
  const festivalStarts = DateTime.fromISO(input.festivalStartDate, { zone: input.timezone }).startOf("day");

  if (input.onwardTravel.status === "unknown") {
    return { status: "unknown", reason: `onward travel time unknown: ${input.onwardTravel.reason}` };
  }

  if (input.onwardTravel.status === "bounded") {
    const { minMinutes, maxMinutes } = input.onwardTravel;
    const exact = minMinutes === maxMinutes;
    const basis = boundBasisPhrase(minMinutes, maxMinutes);
    const latestPossibleArrival = arrivalInstant.plus({ minutes: maxMinutes });
    const earliestPossibleArrival = arrivalInstant.plus({ minutes: minMinutes });

    if (latestPossibleArrival < festivalStarts) {
      return {
        status: "pass",
        reason: exact
          ? `at the destination at ${latestPossibleArrival.toISO()}, ${basis} -- before the first festival day begins (${festivalStarts.toISO()})`
          : `at the destination by ${latestPossibleArrival.toISO()} at the latest, ${basis} -- ` +
            `before the first festival day begins (${festivalStarts.toISO()}) even in the worst case, so the missing time of day isn't needed`,
      };
    }
    if (earliestPossibleArrival >= festivalStarts) {
      return {
        status: "fail",
        reason: exact
          ? `at the destination at ${earliestPossibleArrival.toISO()}, ${basis} -- already at or after the first festival day begins (${festivalStarts.toISO()})`
          : `at the destination no earlier than ${earliestPossibleArrival.toISO()}, ${basis} -- ` +
            `already at or after the first festival day begins (${festivalStarts.toISO()}) even in the best case, so the missing time of day isn't needed`,
      };
    }
    return {
      status: "unknown",
      reason:
        `arrives at the destination sometime between ${earliestPossibleArrival.toISO()} and ${latestPossibleArrival.toISO()} ` +
        `${basis}, straddling the first festival day (${festivalStarts.toISO()}) -- the missing time of day would decide this`,
    };
  }

  const arrivesAtDestination = arrivalInstant.plus({ minutes: input.onwardTravel.minutes });

  if (arrivesAtDestination < festivalStarts) {
    return { status: "pass", reason: "at the destination before the first festival day begins" };
  }
  return {
    status: "fail",
    reason: `at the destination at ${arrivesAtDestination.toISO()}, not before the first festival day begins (${festivalStarts.toISO()})`,
  };
}

function departureLeg(input: FestivalArrivalDepartureInput): { status: ConstraintStatus; reason: string } {
  if (!input.returnDepartureAt || !input.festivalEndDate || !input.timezone) {
    return { status: "unknown", reason: "missing return departure time, festival end date, or time zone" };
  }

  const festivalEnds = DateTime.fromISO(input.festivalEndDate, { zone: input.timezone })
    .startOf("day")
    .plus({ days: 1 });
  const departs = DateTime.fromISO(input.returnDepartureAt);

  if (input.travelToAirport.status === "unknown") {
    return { status: "unknown", reason: `travel-to-airport time unknown: ${input.travelToAirport.reason}` };
  }

  if (input.travelToAirport.status === "bounded") {
    const { minMinutes, maxMinutes } = input.travelToAirport;
    const exact = minMinutes === maxMinutes;
    const basis = boundBasisPhrase(minMinutes, maxMinutes);
    const earliestDepartureIfSlowest = festivalEnds.plus({ minutes: maxMinutes });
    const earliestDepartureIfQuickest = festivalEnds.plus({ minutes: minMinutes });

    if (departs >= earliestDepartureIfSlowest) {
      return {
        status: "pass",
        reason: exact
          ? `departs at ${departs.toISO()}, ${basis} -- after the final festival day plus the required travel to the airport (${earliestDepartureIfSlowest.toISO()})`
          : `departs at ${departs.toISO()}, ${basis} -- after the final festival day plus even the slowest ` +
            `possible travel to the airport (${earliestDepartureIfSlowest.toISO()}), so the missing time of day isn't needed`,
      };
    }
    if (departs < earliestDepartureIfQuickest) {
      return {
        status: "fail",
        reason: exact
          ? `departs at ${departs.toISO()}, ${basis} -- before the final festival day plus the required travel to the airport (${earliestDepartureIfQuickest.toISO()})`
          : `departs at ${departs.toISO()}, ${basis} -- before the final festival day plus even the quickest ` +
            `possible travel to the airport (${earliestDepartureIfQuickest.toISO()}), so the missing time of day isn't needed`,
      };
    }
    return {
      status: "unknown",
      reason:
        `departs at ${departs.toISO()}, straddling -- ${basis} -- the required departure window between ` +
        `the quickest and slowest possible travel to the airport (${earliestDepartureIfQuickest.toISO()} to ${earliestDepartureIfSlowest.toISO()}), so the missing time of day would decide this`,
    };
  }

  const earliestDeparture = festivalEnds.plus({ minutes: input.travelToAirport.minutes });

  if (departs >= earliestDeparture) {
    return { status: "pass", reason: "departs after the final festival day has ended, allowing travel to the airport" };
  }
  return {
    status: "fail",
    reason: `departs at ${departs.toISO()}, before the earliest allowed departure (${earliestDeparture.toISO()})`,
  };
}

/**
 * Hard constraint 2: at the destination (landing plus onward travel)
 * before the first official festival day begins, and departing only
 * after the final official festival day has ended (plus travel time to
 * the airport). What happens inside the festival is irrelevant here.
 */
export function checkFestivalArrivalDeparture(
  input: FestivalArrivalDepartureInput,
): FestivalArrivalDepartureResult {
  const arrival = arrivalLeg(input);
  const departure = departureLeg(input);

  const caveats = [...new Set([input.onwardTravel, input.travelToAirport].filter((leg) => leg.status !== "unknown").map((leg) => leg.caveat))];

  return {
    status: worstStatus([arrival.status, departure.status]),
    reasons: [arrival.reason, departure.reason],
    provisional: input.datesInformationState !== "confirmed",
    caveats,
  };
}
