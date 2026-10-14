import type { Payment } from "@/lib/data/types";

// Shared between payments/page.tsx's read-only rendering and the write
// forms' <select> options, so the two never drift apart.
export const STATUS_LABELS: Record<Payment["status"], string> = {
  planned: "Planned",
  committed: "Committed",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const TIMING_LABELS: Record<Payment["timingType"], string> = {
  paid_now: "Paid now",
  due_on_date: "Due on date",
  pay_before_arrival: "Pay before arrival",
  pay_at_property: "Pay at property",
  unknown: "Timing unknown",
  optional: "Optional",
};

export const REFUNDABILITY_LABELS: Record<Payment["refundability"], string> = {
  refundable: "Refundable",
  partially_refundable: "Partially refundable",
  non_refundable: "Non-refundable",
  unknown: "Refundability unknown",
};
