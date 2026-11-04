import { DateTime } from "luxon";
import type { OnwardTravelResult } from "./calculate-onward-travel-minutes";
import type { EventDepartureResult } from "./find-event-departure";
import { worstStatus, type ConstraintStatus, type HardConstraintResult, type InfoState } from "./types";

export type EventPresenceInput = {
  /** ISO-8601 instant the inbound flight lands. */
  outboundArrivalAt: string | null;
  /** Minutes from landing to actually being at the destination. */
  onwardTravel: OnwardTravelResult;
  /** When the traveller leaves the event-kind stay's location -- a
   * fact about the scenario's movement chain, not about any flight. */
  eventDeparture: EventDepartureResult;
  /** Null when the trip has no event to be present for. Not the same
   * as an event whose dates aren't published yet (datesState/dates
   * stay carried on the object below so the two can be told apart --
   * see checkEventPresence's own not_applicable branches). */
  event: {
    /** YYYY-MM-DD, the first official event day. */
    startDate: string | null;
    /** YYYY-MM-DD, the final official event day. */
    endDate: string | null;
    /** IANA zone the event dates are expressed in. */
    timezone: string | null;
    datesState: InfoState;
  } | null;
};

export type EventPresenceResult = HardConstraintResult & { provisional: boolean };

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

function arrivalLeg(
  outboundArrivalAt: string | null,
  onwardTravel: OnwardTravelResult,
  eventStartDate: string,
  timezone: string | null,
): { status: ConstraintStatus; reason: string } {
  if (!outboundArrivalAt || !timezone) {
    return { status: "unknown", reason: "missing arrival time or time zone" };
  }

  const arrivalInstant = DateTime.fromISO(outboundArrivalAt);
  const eventStarts = DateTime.fromISO(eventStartDate, { zone: timezone }).startOf("day");

  if (onwardTravel.status === "unknown") {
    return { status: "unknown", reason: `onward travel time unknown: ${onwardTravel.reason}` };
  }

  if (onwardTravel.status === "bounded") {
    const { minMinutes, maxMinutes } = onwardTravel;
    const exact = minMinutes === maxMinutes;
    const basis = boundBasisPhrase(minMinutes, maxMinutes);
    const latestPossibleArrival = arrivalInstant.plus({ minutes: maxMinutes });
    const earliestPossibleArrival = arrivalInstant.plus({ minutes: minMinutes });

    if (latestPossibleArrival < eventStarts) {
      return {
        status: "pass",
        reason: exact
          ? `at the destination at ${latestPossibleArrival.toISO()}, ${basis} -- before the first event day begins (${eventStarts.toISO()})`
          : `at the destination by ${latestPossibleArrival.toISO()} at the latest, ${basis} -- ` +
            `before the first event day begins (${eventStarts.toISO()}) even in the worst case, so the missing time of day isn't needed`,
      };
    }
    if (earliestPossibleArrival >= eventStarts) {
      return {
        status: "fail",
        reason: exact
          ? `at the destination at ${earliestPossibleArrival.toISO()}, ${basis} -- already at or after the first event day begins (${eventStarts.toISO()})`
          : `at the destination no earlier than ${earliestPossibleArrival.toISO()}, ${basis} -- ` +
            `already at or after the first event day begins (${eventStarts.toISO()}) even in the best case, so the missing time of day isn't needed`,
      };
    }
    return {
      status: "unknown",
      reason:
        `arrives at the destination sometime between ${earliestPossibleArrival.toISO()} and ${latestPossibleArrival.toISO()} ` +
        `${basis}, straddling the first event day (${eventStarts.toISO()}) -- the missing time of day would decide this`,
    };
  }

  const arrivesAtDestination = arrivalInstant.plus({ minutes: onwardTravel.minutes });

  if (arrivesAtDestination < eventStarts) {
    return { status: "pass", reason: "at the destination before the first event day begins" };
  }
  return {
    status: "fail",
    reason: `at the destination at ${arrivesAtDestination.toISO()}, not before the first event day begins (${eventStarts.toISO()})`,
  };
}

function departureLeg(
  eventDeparture: EventDepartureResult,
  eventEndDate: string,
  timezone: string | null,
): { status: ConstraintStatus; reason: string } {
  if (!timezone) {
    return { status: "unknown", reason: "missing time zone" };
  }

  const eventEnds = DateTime.fromISO(eventEndDate, { zone: timezone }).startOf("day").plus({ days: 1 });

  if (eventDeparture.status === "unknown") {
    return { status: "unknown", reason: `event departure unknown: ${eventDeparture.reason}` };
  }

  if (eventDeparture.status === "bounded") {
    const earliestDeparture = DateTime.fromISO(eventDeparture.earliestDepartsAt);
    const latestDeparture = DateTime.fromISO(eventDeparture.latestDepartsAt);

    if (earliestDeparture >= eventEnds) {
      return {
        status: "pass",
        reason:
          `leaves the event location no earlier than ${earliestDeparture.toISO()} on the recorded date alone -- ` +
          `after the final event day has ended (${eventEnds.toISO()}) even in the earliest case, so the missing time of day isn't needed`,
      };
    }
    if (latestDeparture < eventEnds) {
      return {
        status: "fail",
        reason:
          `leaves the event location by ${latestDeparture.toISO()} at the latest on the recorded date alone -- ` +
          `before the final event day has ended (${eventEnds.toISO()}) even in the latest case, so the missing time of day isn't needed`,
      };
    }
    // Unreachable today by invariant, not by accident, so worth keeping
    // rather than deleting: eventEnds is always a midnight (derived
    // via startOf("day")), and an untimed departure's bound is always
    // exactly one calendar day (00:00 to 23:59 of its own date) -- a
    // midnight can only land at that interval's own start (decided by
    // the pass branch above) or past its end (the fail branch), never
    // strictly inside it. The invariant breaks, and this branch goes
    // live, the day eventEndDate stops meaning "ends at midnight" --
    // e.g. a closing ceremony with its own end time instead of a whole
    // final day.
    return {
      status: "unknown",
      reason:
        `leaves the event location sometime between ${earliestDeparture.toISO()} and ${latestDeparture.toISO()}, ` +
        `straddling the end of the final event day (${eventEnds.toISO()}) -- the missing time of day would decide this`,
    };
  }

  const departs = DateTime.fromISO(eventDeparture.departsAt);

  if (departs >= eventEnds) {
    return { status: "pass", reason: "leaves the event location after the final event day has ended" };
  }
  return {
    status: "fail",
    reason: `leaves the event location at ${departs.toISO()}, before the final event day has ended (${eventEnds.toISO()})`,
  };
}

/**
 * Hard constraint 2: at the destination (landing plus onward travel)
 * before the first official event day begins, and leaving the
 * event location only after the final official event day has
 * ended. What happens inside the event is irrelevant here, and so
 * is whether a later flight is actually caught -- that's a different
 * question (making the flight, not leaving the event on time), not
 * built into this check.
 *
 * A trip with no event has nothing to be present for: not_applicable,
 * not unknown -- "unknown" would imply a missing fact, where there is
 * none to be missing. The same applies when an event exists but its
 * dates aren't published yet, with its own reason so the two cases
 * read differently.
 */
export function checkEventPresence(input: EventPresenceInput): EventPresenceResult {
  if (input.event === null) {
    return { status: "not_applicable", reasons: ["no event to be present for"], provisional: false };
  }
  if (input.event.startDate === null || input.event.endDate === null) {
    return { status: "not_applicable", reasons: ["event dates not published yet"], provisional: false };
  }

  const arrival = arrivalLeg(input.outboundArrivalAt, input.onwardTravel, input.event.startDate, input.event.timezone);
  const departure = departureLeg(input.eventDeparture, input.event.endDate, input.event.timezone);

  return {
    status: worstStatus([arrival.status, departure.status]),
    reasons: [arrival.reason, departure.reason],
    provisional: input.event.datesState !== "confirmed",
  };
}
