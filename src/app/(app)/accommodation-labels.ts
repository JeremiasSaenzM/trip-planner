import type { AccommodationOptionStatus } from "@/lib/data/types";
import type { AccommodationRateUnit } from "@/lib/domain/types";

export const ACCOMMODATION_OPTION_STATUS_LABELS: Record<AccommodationOptionStatus, string> = {
  candidate: "Candidate",
  selected: "Selected",
  rejected: "Rejected",
  booked: "Booked",
};

export const ACCOMMODATION_OPTION_STATUS_ORDER: AccommodationOptionStatus[] = [
  "candidate",
  "selected",
  "rejected",
  "booked",
];

export const ACCOMMODATION_RATE_UNIT_LABELS: Record<AccommodationRateUnit, string> = {
  per_night: "Per night",
  per_stay: "Per stay",
};

export const ACCOMMODATION_RATE_UNIT_ORDER: AccommodationRateUnit[] = ["per_night", "per_stay"];
