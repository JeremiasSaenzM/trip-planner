import "server-only";

import type { Competition, Decision, FlightOption, FlightSegment, FxRate, Movement, Stay } from "@/lib/data/types";
import { calculateEffectiveFlightCost, type EffectiveFlightCostResult } from "@/lib/domain/calculate-effective-flight-cost";
import { calculateOnwardTravelMinutes, type OnwardTravelResult } from "@/lib/domain/calculate-onward-travel-minutes";
import {
  calculateTotalItineraryCost,
  type TotalItineraryCostBudgetLine,
  type TotalItineraryCostResult,
} from "@/lib/domain/calculate-total-itinerary-cost";
import { calculateTravelToAirportMinutes } from "@/lib/domain/calculate-travel-to-airport-minutes";
import { checkAcceptanceSafeguard, type AcceptanceSafeguardResult } from "@/lib/domain/check-acceptance-safeguard";
import { checkBaggageAllowance, type BaggageAllowanceResult } from "@/lib/domain/check-baggage-allowance";
import {
  checkFestivalArrivalDeparture,
  type FestivalArrivalDepartureResult,
} from "@/lib/domain/check-festival-arrival-departure";
import { checkUsCanadaStop, type UsCanadaStopResult } from "@/lib/domain/check-us-canada-stop";
import { resolveFlightOptionTiming } from "@/lib/domain/resolve-flight-option-timing";
import type { Basis } from "@/lib/domain/types";

export type FlightOptionEvaluation = {
  option: FlightOption;
  segments: FlightSegment[];
  usCanadaStop: UsCanadaStopResult;
  festivalArrivalDeparture: FestivalArrivalDepartureResult;
  baggage: BaggageAllowanceResult;
  acceptanceSafeguard: AcceptanceSafeguardResult;
  effectiveFlightCost: EffectiveFlightCostResult;
  totalItineraryCost: TotalItineraryCostResult;
  onwardTravel: OnwardTravelResult;
  travelToAirport: OnwardTravelResult;
};

// The four checks and two costs the Flight options section renders,
// run once per option here rather than in the page itself, so the
// section and any future comparison view read off the exact same
// results. festivalStayLocation and the movement chain come from this
// scenario's own stays/movements (Phase 6.4 identity), never guessed.
export function evaluateFlightOption(input: {
  option: FlightOption;
  segments: FlightSegment[];
  competition: Competition | null;
  decisions: Decision[];
  movements: Movement[];
  stays: Stay[];
  budgetLines: TotalItineraryCostBudgetLine[];
  rates: FxRate[];
  basis: Basis;
  asOfDate: string;
}): FlightOptionEvaluation {
  const { option, segments, competition, decisions, movements, stays, budgetLines, rates, basis, asOfDate } = input;

  const usCanadaStop = checkUsCanadaStop(
    segments.map((segment) => ({
      direction: segment.direction,
      segmentOrder: segment.segmentOrder,
      toCountry: segment.toCountry,
    })),
  );

  const timing = resolveFlightOptionTiming(segments);

  const festivalStay = stays.find((stay) => stay.kind === "festival") ?? null;
  const onwardMovements = movements.map((movement) => ({
    sequence: movement.sequence,
    fromLocation: movement.fromLocation,
    toLocation: movement.toLocation,
    departDate: movement.departDate,
    departTime: movement.departTime,
    arriveDate: movement.arriveDate,
    arriveTime: movement.arriveTime,
    flightOptionId: movement.flightOptionId,
  }));

  const onwardTravel = calculateOnwardTravelMinutes({
    flightOptionId: option.id,
    movements: onwardMovements,
    festivalStayLocation: festivalStay?.location ?? null,
  });
  const travelToAirport = calculateTravelToAirportMinutes({
    flightOptionId: option.id,
    movements: onwardMovements,
    festivalStayLocation: festivalStay?.location ?? null,
  });

  const festivalArrivalDeparture = checkFestivalArrivalDeparture({
    outboundArrivalAt: timing.outboundArrivalAt,
    onwardTravelMinutes: onwardTravel.status === "known" ? onwardTravel.minutes : null,
    returnDepartureAt: timing.returnDepartureAt,
    travelToAirportMinutes: travelToAirport.status === "known" ? travelToAirport.minutes : null,
    festivalStartDate: competition?.startDate ?? null,
    festivalEndDate: competition?.endDate ?? null,
    timezone: competition?.timezone ?? null,
    datesInformationState: competition?.datesState ?? "estimate",
  });

  const baggage = checkBaggageAllowance({ baggage: option.baggage });

  const riskAccepted = decisions.some((decision) => decision.flightOptionId === option.id);
  const acceptanceSafeguard = checkAcceptanceSafeguard({
    refundability: option.refundability,
    competitionRelated: option.competitionRelated,
    competitionAccepted: competition?.acceptanceStatus === "accepted",
    riskAccepted,
  });

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
    festivalArrivalDeparture,
    baggage,
    acceptanceSafeguard,
    effectiveFlightCost,
    totalItineraryCost,
    onwardTravel,
    travelToAirport,
  };
}
