import type { FlightOptionStatus } from "@/lib/data/types";
import type { FlightBaggage } from "@/lib/domain/types";

export const FLIGHT_OPTION_STATUS_LABELS: Record<FlightOptionStatus, string> = {
  candidate: "Candidate",
  selected: "Selected",
  rejected: "Rejected",
  booked: "Booked",
};

export const FLIGHT_OPTION_STATUS_ORDER: FlightOptionStatus[] = ["candidate", "selected", "rejected", "booked"];

export const FLIGHT_BAGGAGE_LABELS: Record<FlightBaggage, string> = {
  included: "Checked bag included",
  paid_addon: "Checked bag as a paid add-on",
  not_allowed: "No checked bag allowed",
  unknown: "Baggage allowance unknown",
};

export const FLIGHT_BAGGAGE_ORDER: FlightBaggage[] = ["included", "paid_addon", "not_allowed", "unknown"];
