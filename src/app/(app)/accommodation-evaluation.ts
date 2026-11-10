import "server-only";

import type { AccommodationOption, Source, Stay } from "@/lib/data/types";
import {
  calculateEffectiveAccommodationCost,
  type EffectiveAccommodationCostResult,
} from "@/lib/domain/calculate-effective-accommodation-cost";
import {
  checkAccommodationCancellationDeadline,
} from "@/lib/domain/check-accommodation-cancellation-deadline";
import { checkAccommodationDatesCovered } from "@/lib/domain/check-accommodation-dates-covered";
import { checkAccommodationHostelEligibility } from "@/lib/domain/check-accommodation-hostel-eligibility";
import { checkAccommodationNightsMatchStay } from "@/lib/domain/check-accommodation-nights-match-stay";
import {
  checkObservationCoversStay,
  type ObservationCoverageResult,
} from "@/lib/domain/check-observation-covers-stay";
import type { HardConstraintResult } from "@/lib/domain/types";

export type AccommodationOptionEvaluation = {
  option: AccommodationOption;
  nightsMatchStay: HardConstraintResult;
  datesCovered: HardConstraintResult;
  cancellationDeadline: HardConstraintResult;
  hostelEligibility: HardConstraintResult;
  observationCoversStay: ObservationCoverageResult;
  effectiveCost: EffectiveAccommodationCostResult;
};

// The four checks and the Effective Cost the Accommodation card renders,
// run once per option here rather than in the page itself, so the card
// and any future comparison view read off the exact same results. No
// acceptance-safeguard check: see 20261101090000_accommodation_options's
// own comment.
export function evaluateAccommodationOption(input: {
  option: AccommodationOption;
  stay: Stay;
  source: Source | null;
  asOfDate: string;
}): AccommodationOptionEvaluation {
  const { option, stay, source, asOfDate } = input;

  const nightsMatchStay = checkAccommodationNightsMatchStay({
    optionNights: option.nights,
    stayNights: stay.nights,
  });

  const datesCovered = checkAccommodationDatesCovered({
    stayStartDate: stay.startDate,
    stayNights: stay.nights,
    applicablePeriod: source?.applicablePeriod ?? null,
  });

  const cancellationDeadline = checkAccommodationCancellationDeadline({
    cancellationDeadline: option.cancellationDeadline,
    asOfDate,
  });

  const hostelEligibility = checkAccommodationHostelEligibility({
    isHostel: option.isHostel,
    stayKind: stay.kind,
  });

  const observationCoversStay = checkObservationCoversStay({
    option: { observedStartDate: option.observedStartDate, nights: option.nights },
    stay: { startDate: stay.startDate, nights: stay.nights },
  });

  const effectiveCost = calculateEffectiveAccommodationCost({
    rateAmount: option.rateAmount,
    rateUnit: option.rateUnit,
    nights: option.nights,
    mandatoryFees: option.mandatoryFees,
    currency: option.currency,
    conditionalRate: option.conditionalRate,
    undiscountedAmount: option.undiscountedAmount,
  });

  return {
    option,
    nightsMatchStay,
    datesCovered,
    cancellationDeadline,
    hostelEligibility,
    observationCoversStay,
    effectiveCost,
  };
}
