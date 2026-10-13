import type { BudgetCategory, FlightBaggage, InfoState, RateKind } from "@/lib/domain/types";

export type TripStatus = "planning" | "confirmed" | "completed" | "cancelled";
export type AcceptanceStatus = "pending" | "accepted" | "declined";
export type DecidedBy = "traveler" | "choir_director" | "other";
export type PaymentTiming =
  | "paid_now"
  | "due_on_date"
  | "pay_before_arrival"
  | "pay_at_property"
  | "unknown"
  | "optional";
export type PaymentStatus = "planned" | "committed" | "paid" | "cancelled";
export type Refundability = "refundable" | "partially_refundable" | "non_refundable" | "unknown";
export type OpenItemCategory = "deadline" | "task" | "question";
export type OpenItemStatus = "open" | "done" | "dismissed";
export type FlightDirection = "outbound" | "return";

export type Trip = {
  id: string;
  name: string;
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
};

export type Source = {
  id: string;
  provider: string;
  tier: number;
  url: string | null;
  observedOn: string;
  notes: string | null;
  createdAt: string;
};

export type Competition = {
  id: string;
  tripId: string;
  name: string;
  city: string;
  country: string;
  venue: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  datesState: InfoState;
  datesSourceId: string | null;
  acceptanceStatus: AcceptanceStatus;
  acceptanceDecidedOn: string | null;
  acceptanceSourceId: string | null;
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Scenario = {
  id: string;
  tripId: string;
  name: string;
  competitionId: string | null;
  includesExtension: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Decision = {
  id: string;
  tripId: string;
  competitionId: string | null;
  title: string;
  rationale: string | null;
  decidedOn: string;
  decidedBy: DecidedBy;
  reversible: boolean;
  supersededBy: string | null;
  sourceId: string | null;
  createdAt: string;
};

export type BudgetLine = {
  id: string;
  tripId: string;
  scenarioId: string | null;
  category: BudgetCategory;
  description: string;
  amountMin: number;
  amountTarget: number;
  amountConservative: number;
  currency: string;
  informationState: InfoState;
  sourceId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Payment = {
  id: string;
  budgetLineId: string;
  scenarioId: string | null;
  description: string;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  dueDate: string | null;
  cancellationDeadline: string | null;
  datesState: InfoState;
  datesSourceId: string | null;
  timingType: PaymentTiming;
  status: PaymentStatus;
  informationState: InfoState;
  sourceId: string | null;
  refundability: Refundability;
  competitionRelated: boolean;
  riskAcceptedDecisionId: string | null;
  createdAt: string;
  updatedAt: string;
};

// Money actually set aside -- always recorded in USD (the base currency),
// never the currency of whatever budget line it's saving toward. This is
// what lets calculateRequiredSavings() treat every savings entry as
// already-converted, with no FX lookup of its own.
export type SavingsEntry = {
  id: string;
  tripId: string;
  amount: number;
  currency: "USD";
  recordedOn: string;
  note: string | null;
  createdAt: string;
};

export type FxRate = {
  id: string;
  currency: string;
  rateToUsd: number;
  rateDate: string;
  rateKind: RateKind;
  informationState: InfoState;
  sourceId: string;
};

export type OpenItem = {
  id: string;
  tripId: string;
  competitionId: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  datesState: InfoState;
  datesSourceId: string | null;
  category: OpenItemCategory;
  status: OpenItemStatus;
  relatedBudgetLineId: string | null;
  relatedPaymentId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type FlightOption = {
  id: string;
  scenarioId: string;
  fare: number;
  bagFee: number;
  mandatoryFees: number;
  currency: string;
  informationState: InfoState;
  sourceId: string;
  observedOn: string;
  baggage: FlightBaggage;
  separateTickets: boolean;
  arrivalAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FlightSegment = {
  id: string;
  flightOptionId: string;
  direction: FlightDirection;
  segmentOrder: number;
  fromAirport: string;
  toAirport: string;
  fromCountry: string;
  toCountry: string;
  flightNumber: string | null;
  departAt: string;
  arriveAt: string;
  isTechnicalStop: boolean;
};

// One data-access layer, two implementations (src/lib/data/real.ts, the
// real Supabase-backed one, and src/lib/data/demo.ts, typed fixture data)
// -- chosen by src/lib/data/index.ts, the only place that calls
// isDemoMode(). Pages and components import only from src/lib/data/index.ts
// and never know which implementation answered.
//
// Phase 5 will add write methods here: recording savings, marking a
// payment paid, editing a budget line, and so on. Every one of them MUST
// call assertWritesAllowed() (src/lib/demo-mode.ts) as its first line, so
// a form submitted while DEMO_MODE is on throws instead of silently doing
// nothing, or worse, writing fixture-derived data into a real trip. See
// CLAUDE.md's "Demo mode" rule.
export type DataSource = {
  getTrips(): Promise<Trip[]>;
  getSources(): Promise<Source[]>;
  getCompetitions(): Promise<Competition[]>;
  getScenarios(): Promise<Scenario[]>;
  getDecisions(): Promise<Decision[]>;
  getBudgetLines(): Promise<BudgetLine[]>;
  getPayments(): Promise<Payment[]>;
  getSavingsEntries(): Promise<SavingsEntry[]>;
  getFxRates(): Promise<FxRate[]>;
  getOpenItems(): Promise<OpenItem[]>;
  getFlightOptions(): Promise<FlightOption[]>;
  getFlightSegments(): Promise<FlightSegment[]>;
};
