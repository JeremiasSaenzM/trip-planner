import { DateTime } from "luxon";
import { worstStatus, type ConstraintStatus, type HardConstraintResult, type InfoState } from "./types";

export type FestivalArrivalDepartureInput = {
  /** ISO-8601 instant the inbound flight lands. */
  outboundArrivalAt: string | null;
  /** Minutes from landing to actually being at the destination. */
  onwardTravelMinutes: number | null;
  /** ISO-8601 instant the outbound flight home departs. */
  returnDepartureAt: string | null;
  /** Minutes from the destination to the departure airport. */
  travelToAirportMinutes: number | null;
  /** YYYY-MM-DD, the first official festival day. */
  festivalStartDate: string | null;
  /** YYYY-MM-DD, the final official festival day. */
  festivalEndDate: string | null;
  /** IANA zone the festival dates are expressed in. */
  timezone: string | null;
  datesInformationState: InfoState;
};

export type FestivalArrivalDepartureResult = HardConstraintResult & { provisional: boolean };

function arrivalLeg(input: FestivalArrivalDepartureInput): { status: ConstraintStatus; reason: string } {
  if (
    !input.outboundArrivalAt ||
    input.onwardTravelMinutes == null ||
    !input.festivalStartDate ||
    !input.timezone
  ) {
    return {
      status: "unknown",
      reason: "missing arrival time, onward travel time, festival start date, or time zone",
    };
  }

  const arrivesAtDestination = DateTime.fromISO(input.outboundArrivalAt).plus({
    minutes: input.onwardTravelMinutes,
  });
  const festivalStarts = DateTime.fromISO(input.festivalStartDate, { zone: input.timezone }).startOf("day");

  if (arrivesAtDestination < festivalStarts) {
    return { status: "pass", reason: "at the destination before the first festival day begins" };
  }
  return {
    status: "fail",
    reason: `at the destination at ${arrivesAtDestination.toISO()}, not before the first festival day begins (${festivalStarts.toISO()})`,
  };
}

function departureLeg(input: FestivalArrivalDepartureInput): { status: ConstraintStatus; reason: string } {
  if (
    !input.returnDepartureAt ||
    input.travelToAirportMinutes == null ||
    !input.festivalEndDate ||
    !input.timezone
  ) {
    return {
      status: "unknown",
      reason: "missing return departure time, travel-to-airport time, festival end date, or time zone",
    };
  }

  const festivalEnds = DateTime.fromISO(input.festivalEndDate, { zone: input.timezone })
    .startOf("day")
    .plus({ days: 1 });
  const earliestDeparture = festivalEnds.plus({ minutes: input.travelToAirportMinutes });
  const departs = DateTime.fromISO(input.returnDepartureAt);

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

  return {
    status: worstStatus([arrival.status, departure.status]),
    reasons: [arrival.reason, departure.reason],
    provisional: input.datesInformationState !== "confirmed",
  };
}
