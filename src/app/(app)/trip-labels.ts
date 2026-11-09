import type { TripStatus } from "@/lib/data/types";

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  planning: "Planning",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TRIP_STATUS_ORDER: TripStatus[] = ["planning", "confirmed", "completed", "cancelled"];
