import { DateTime } from "luxon";
import type { OnwardTravelResult } from "./calculate-onward-travel-minutes";
import type { FestivalDepartureResult } from "./find-festival-departure";
import { worstStatus, type ConstraintStatus, type HardConstraintResult, type InfoState } from "./types";

export type FestivalArrivalDepartureInput = {
  /** ISO-8601 instant the inbound flight lands. */
  outboundArrivalAt: string | null;
  /** Minutes from landing to actually being at the destination. */
  onwardTravel: OnwardTravelResult;
  /** When the traveller leaves the festival-kind stay's location -- a
   * fact about the scenario's movement chain, not about any flight. */
  festivalDeparture: FestivalDepartureResult;
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
// stated, not merely computed. onwardTravel already carries it
// (NAIVE_LOCAL_TIME_CAVEAT); checkFestivalArrivalDeparture only has to
// forward it when it actually used a movement-based figure to decide
// the arrival half (known or bounded, never when onwardTravel is
// unknown and so never used one at all). festivalDeparture carries no
// such caveat: it reads one movement's own local clock reading as the
// festival's own zone, which is what that clock actually means --
// there's no cross-leg summing here for a silent zone crossing to hide
// in.
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
  if (!input.festivalEndDate || !input.timezone) {
    return { status: "unknown", reason: "missing festival end date or time zone" };
  }

  const festivalEnds = DateTime.fromISO(input.festivalEndDate, { zone: input.timezone })
    .startOf("day")
    .plus({ days: 1 });

  if (input.festivalDeparture.status === "unknown") {
    return { status: "unknown", reason: `festival departure unknown: ${input.festivalDeparture.reason}` };
  }

  if (input.festivalDeparture.status === "bounded") {
    const earliestDeparture = DateTime.fromISO(input.festivalDeparture.earliestDepartsAt);
    const latestDeparture = DateTime.fromISO(input.festivalDeparture.latestDepartsAt);

    if (earliestDeparture >= festivalEnds) {
      return {
        status: "pass",
        reason:
          `leaves the festival location no earlier than ${earliestDeparture.toISO()} on the recorded date alone -- ` +
          `after the final festival day has ended (${festivalEnds.toISO()}) even in the earliest case, so the missing time of day isn't needed`,
      };
    }
    if (latestDeparture < festivalEnds) {
      return {
        status: "fail",
        reason:
          `leaves the festival location by ${latestDeparture.toISO()} at the latest on the recorded date alone -- ` +
          `before the final festival day has ended (${festivalEnds.toISO()}) even in the latest case, so the missing time of day isn't needed`,
      };
    }
    // Unreachable today by invariant, not by accident, so worth keeping
    // rather than deleting: festivalEnds is always a midnight (derived
    // via startOf("day")), and an untimed departure's bound is always
    // exactly one calendar day (00:00 to 23:59 of its own date) -- a
    // midnight can only land at that interval's own start (decided by
    // the pass branch above) or past its end (the fail branch), never
    // strictly inside it. The invariant breaks, and this branch goes
    // live, the day festivalEndDate stops meaning "ends at midnight" --
    // e.g. a closing concert with its own end time instead of a whole
    // final day.
    return {
      status: "unknown",
      reason:
        `leaves the festival location sometime between ${earliestDeparture.toISO()} and ${latestDeparture.toISO()}, ` +
        `straddling the end of the final festival day (${festivalEnds.toISO()}) -- the missing time of day would decide this`,
    };
  }

  const departs = DateTime.fromISO(input.festivalDeparture.departsAt);

  if (departs >= festivalEnds) {
    return { status: "pass", reason: "leaves the festival location after the final festival day has ended" };
  }
  return {
    status: "fail",
    reason: `leaves the festival location at ${departs.toISO()}, before the final festival day has ended (${festivalEnds.toISO()})`,
  };
}

/**
 * Hard constraint 2: at the destination (landing plus onward travel)
 * before the first official festival day begins, and leaving the
 * festival location only after the final official festival day has
 * ended. What happens inside the festival is irrelevant here, and so
 * is whether a later flight is actually caught -- that's a different
 * question (making the flight, not leaving the festival on time), not
 * built into this check.
 */
export function checkFestivalArrivalDeparture(
  input: FestivalArrivalDepartureInput,
): FestivalArrivalDepartureResult {
  const arrival = arrivalLeg(input);
  const departure = departureLeg(input);

  const caveats = input.onwardTravel.status !== "unknown" ? [input.onwardTravel.caveat] : [];

  return {
    status: worstStatus([arrival.status, departure.status]),
    reasons: [arrival.reason, departure.reason],
    provisional: input.datesInformationState !== "confirmed",
    caveats,
  };
}
