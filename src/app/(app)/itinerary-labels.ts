import type { StayKind } from "@/lib/domain/types";
import type { MovementMode } from "@/lib/data/types";

export const STAY_KIND_LABELS: Record<StayKind, string> = {
  event: "Event",
  independent: "Independent",
  transit: "Transit",
};

export const STAY_KIND_ORDER: StayKind[] = ["event", "independent", "transit"];

export const MOVEMENT_MODE_LABELS: Record<MovementMode, string> = {
  plane: "Plane",
  train: "Train",
  bus: "Bus",
  ferry: "Ferry",
  car: "Car",
  other: "Other",
};

export const MOVEMENT_MODE_ORDER: MovementMode[] = ["plane", "train", "bus", "ferry", "car", "other"];
