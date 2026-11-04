import "server-only";

import type { TripEvent, FlightOption, FlightSegment, FxRate, Location, Movement, Stay } from "@/lib/data/types";
import { calculateEffectiveFlightCost, type EffectiveFlightCostResult } from "@/lib/domain/calculate-effective-flight-cost";
import { calculateOnwardTravelMinutes, type OnwardTravelResult } from "@/lib/domain/calculate-onward-travel-minutes";
import {
  calculateTotalItineraryCost,
  type TotalItineraryCostBudgetLine,
  type TotalItineraryCostResult,
} from "@/lib/domain/calculate-total-itinerary-cost";
import { checkBaggageAllowance, type BaggageAllowanceResult } from "@/lib/domain/check-baggage-allowance";
import { checkEventPresence, type EventPresenceResult } from "@/lib/domain/check-event-presence";
import {
  checkEventLocationTimezone,
  type EventLocationTimezoneResult,
} from "@/lib/domain/check-event-location-timezone";
import { checkUsCanadaStop, type UsCanadaStopResult } from "@/lib/domain/check-us-canada-stop";
import { findEventDeparture, type EventDepartureResult } from "@/lib/domain/find-event-departure";
import { resolveFlightOptionTiming } from "@/lib/domain/resolve-flight-option-timing";
import type { Basis } from "@/lib/domain/types";

export type FlightOptionEvaluation = {
  option: FlightOption;
  segments: FlightSegment[];
  usCanadaStop: UsCanadaStopResult;
  eventPresence: EventPresenceResult;
  eventLocationTimezone: EventLocationTimezoneResult;
  baggage: BaggageAllowanceResult;
  effectiveFlightCost: EffectiveFlightCostResult;
  totalItineraryCost: TotalItineraryCostResult;
  onwardTravel: OnwardTravelResult;
  eventDeparture: EventDepartureResult;
};

// The three checks and two costs the Flight options section renders,
// run once per option here rather than in the page itself, so the
// section and any future comparison view read off the exact same
// results. eventStayLocationId and the movement chain come from
// this scenario's own stays/movements (Phase 6.4 identity), never
// guessed. Each movement's own zones are resolved here, from
// locations, once -- calculateOnwardTravelMinutes/findEventDeparture
// never look locations up themselves.
export function evaluateFlightOption(input: {
  option: FlightOption;
  segments: FlightSegment[];
  event: TripEvent | null;
  movements: Movement[];
  stays: Stay[];
  locations: Location[];
  budgetLines: TotalItineraryCostBudgetLine[];
  rates: FxRate[];
  basis: Basis;
  asOfDate: string;
}): FlightOptionEvaluation {
  const { option, segments, event, movements, stays, locations, budgetLines, rates, basis, asOfDate } = input;

  const usCanadaStop = checkUsCanadaStop(
    segments.map((segment) => ({
      direction: segment.direction,
      segmentOrder: segment.segmentOrder,
      toCountry: segment.toCountry,
    })),
  );

  const timing = resolveFlightOptionTiming(segments);

  const zoneOf = (locationId: string) => locations.find((location) => location.id === locationId)?.timezone ?? null;

  const eventStay = stays.find((stay) => stay.kind === "event") ?? null;
  const eventStayLocationId = eventStay?.locationId ?? null;
  const onwardMovements = movements.map((movement) => ({
    sequence: movement.sequence,
    fromLocationId: movement.fromLocationId,
    toLocationId: movement.toLocationId,
    fromZone: zoneOf(movement.fromLocationId),
    toZone: zoneOf(movement.toLocationId),
    departDate: movement.departDate,
    departTime: movement.departTime,
    arriveDate: movement.arriveDate,
    arriveTime: movement.arriveTime,
    flightOptionId: movement.flightOptionId,
  }));

  const onwardTravel = calculateOnwardTravelMinutes({
    flightOptionId: option.id,
    movements: onwardMovements,
    eventStayLocationId,
  });
  // Option-independent: when the traveller leaves the event location
  // is a fact about the scenario's own movement chain, not about which
  // flight option is being evaluated.
  const eventDeparture = findEventDeparture({
    movements: onwardMovements,
    eventStayLocationId,
  });

  const eventPresence = checkEventPresence({
    outboundArrivalAt: timing.outboundArrivalAt,
    onwardTravel,
    eventDeparture,
    event: event
      ? {
          startDate: event.startDate,
          endDate: event.endDate,
          timezone: event.timezone,
          datesState: event.datesState,
        }
      : null,
  });

  const eventLocationTimezone = checkEventLocationTimezone({
    eventTimezone: event?.timezone ?? null,
    eventStayTimezone: eventStayLocationId ? zoneOf(eventStayLocationId) : null,
  });

  const baggage = checkBaggageAllowance({ baggage: option.baggage });

  const effectiveFlightCost = calculateEffectiveFlightCost({
    fare: option.fare,
    bagFee: option.bagFee,
    mandatoryFees: option.mandatoryFees,
    currency: option.currency,
    baggage: option.baggage,
  });

  const linkedBudgetLineIds = [
    ...movements.filter((movement) => movement.flightOptionId === option.id).map((movement) => movement.budgetLineId),
    ...stays.filter((stay) => stay.flightOptionId === option.id).map((stay) => stay.budgetLineId),
  ];

  const totalItineraryCost = calculateTotalItineraryCost({
    effectiveFlightCostAmount: effectiveFlightCost.amount,
    effectiveFlightCostCurrency: effectiveFlightCost.currency,
    linkedBudgetLineIds,
    budgetLines,
    basis,
    rates,
    asOfDate,
  });

  return {
    option,
    segments,
    usCanadaStop,
    eventPresence,
    eventLocationTimezone,
    baggage,
    effectiveFlightCost,
    totalItineraryCost,
    onwardTravel,
    eventDeparture,
  };
}
