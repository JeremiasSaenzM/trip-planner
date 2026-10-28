import type {
  BudgetCategory,
  Confidence,
  FlightBaggage,
  InfoState,
  QuantityUnit,
  RateKind,
  StayKind,
} from "@/lib/domain/types";

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
/** How a movement travels -- purely descriptive (CLAUDE.md: mode is
 * never a ranking criterion), so unlike StayKind no domain check
 * branches on it. */
export type MovementMode = "plane" | "train" | "bus" | "ferry" | "car" | "other";
export type ChangeAction = "insert" | "update" | "delete";
export type ChangeLogActor = "app" | "seed" | "claude";

export type Trip = {
  id: string;
  name: string;
  status: TripStatus;
  /** The traveller's own travel window -- trip-level, the same for every
   * scenario. departureDate is what the savings plan anchors on when set
   * (see resolveDepartureDate()). Either can be null (not decided yet). */
  departureDate: string | null;
  returnDate: string | null;
  travelDatesState: InfoState;
  travelDatesSourceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Source = {
  id: string;
  provider: string;
  tier: number;
  url: string | null;
  observedOn: string;
  /** Parsed from the DB's applicable_period daterange -- either side can
   * be null (an open-ended period), and the whole thing is null when no
   * period was given at all. */
  applicablePeriod: { start: string | null; end: string | null } | null;
  notes: string | null;
  createdAt: string;
};

export type Competition = {
  id: string;
  tripId: string;
  name: string;
  /** null until the host is announced -- same for country and timezone. */
  city: string | null;
  country: string | null;
  venue: string | null;
  /** First and final official festival days. Both null, or both set
   * (competitions_dates_together) -- a festival period needs both ends. */
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
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
  /** The one payment this decision unblocks, if any -- see
   * enforce_payment_acceptance_safeguard()'s d.payment_id = new.id
   * check. null for every decision that isn't a payment risk acceptance. */
  paymentId: string | null;
  /** The one flight option this decision names, if any -- check 4's
   * explicit risk acceptance (decisions_flight_risk_needs_rationale,
   * 20261028090000). null for every decision that isn't one. */
  flightOptionId: string | null;
  title: string;
  rationale: string | null;
  decidedOn: string;
  decidedBy: DecidedBy;
  reversible: boolean;
  supersededBy: string | null;
  sourceId: string | null;
  /** Frozen snapshot of what was actually agreed to when paymentId was
   * set -- independent of the payment's own amount/currency, which can
   * change later. null when paymentId is null. */
  acceptedAmount: number | null;
  acceptedCurrency: string | null;
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
  /** null = not assessed yet. */
  confidence: Confidence | null;
  /** A rate times a count ("Paris nights (13)") rather than a flat
   * amount. Both null or both set; the unit amount is computed from
   * amount / quantity on display, never stored. */
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  /** True only for a line create_payment made for a payment that had
   * none to attach to -- see delete_payment's cleanup rule. */
  autoCreated: boolean;
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

export type FlightOptionStatus = "candidate" | "selected" | "rejected" | "booked";

export type FlightOption = {
  id: string;
  scenarioId: string;
  label: string;
  status: FlightOptionStatus;
  fare: number;
  bagFee: number;
  mandatoryFees: number;
  currency: string;
  informationState: InfoState;
  sourceId: string;
  observedOn: string;
  baggage: FlightBaggage;
  separateTickets: boolean;
  refundability: Refundability;
  competitionRelated: boolean;
  bookingReference: string | null;
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

// A scenario's itinerary identity (Phase 6.4): where the traveller
// sleeps (stays) and how they get between places (movements). See
// 20261023090000_stays_movements.sql for the reasoning behind storing
// movements rather than deriving them from stays, and for why
// source_id is nullable on both with nothing enforcing it yet.
// A named place with its own IANA time zone, reused across every stay
// and movement that refers to it (and, since this is owner_id-scoped
// rather than trip_id-scoped, across every trip -- "Home" is entered
// once, not once per trip). timezone is nullable: it can't be derived
// from a name, so a freshly-backfilled location starts without one,
// and the app has to say so rather than guess.
export type Location = {
  id: string;
  ownerId: string;
  name: string;
  timezone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Stay = {
  id: string;
  scenarioId: string;
  locationId: string;
  startDate: string;
  nights: number;
  kind: StayKind;
  budgetLineId: string | null;
  informationState: InfoState;
  sourceId: string | null;
  notes: string | null;
  /** Set when this stay exists because of a specific flight option --
   * the Paris-arrival-night case the Costs section describes. The link
   * itself is the "route-caused" flag; there's no separate boolean. */
  flightOptionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Movement = {
  id: string;
  scenarioId: string;
  /** Explicit order along the home-to-home chain -- not derived from
   * the dates, since two legs on the same day still need an order. */
  sequence: number;
  fromLocationId: string;
  toLocationId: string;
  departDate: string;
  /** Local time of day, HH:MM:SS -- null until it's known. */
  departTime: string | null;
  /** Its own column, not derived from departDate, so an overnight leg
   * can cross midnight with no stay needed for that night. */
  arriveDate: string;
  arriveTime: string | null;
  mode: MovementMode;
  budgetLineId: string | null;
  bookingReference: string | null;
  informationState: InfoState;
  sourceId: string | null;
  notes: string | null;
  /** Set on the flight leg itself (itinerary entry and ticket
   * restating each other) or on a movement that only exists because of
   * that ticket -- same reading as Stay.flightOptionId. */
  flightOptionId: string | null;
  createdAt: string;
  updatedAt: string;
};

// The append-only audit trail every tracked table writes to
// (supabase/migrations/20261012131400_change_log.sql) -- read-only from
// the app's side (there is no owner write policy on this table at all,
// only the SECURITY DEFINER trigger that writes it). Exists in this
// file purely to be read, by the export feature.
export type ChangeLogEntry = {
  id: string;
  tableName: string;
  rowId: string;
  action: ChangeAction;
  oldData: unknown;
  newData: unknown;
  reason: string | null;
  actor: ChangeLogActor;
  changedAt: string;
  changedBy: string | null;
};

// Import proposals (20261021090000_import_proposals.sql): a pasted batch
// of research results, each item approved or rejected on its own.
export type ProposalOp =
  | "create_source"
  | "create_competition"
  | "create_scenario"
  | "create_budget_line"
  | "create_payment"
  | "create_fx_rate"
  | "update_competition"
  | "update_scenario"
  | "update_budget_line"
  | "update_payment"
  | "update_fx_rate"
  | "update_savings_entry"
  | "create_stay"
  | "create_movement"
  | "update_stay"
  | "update_movement"
  | "create_flight_option"
  | "create_flight_segment"
  | "update_flight_option"
  | "create_location"
  | "update_location";
export type ProposalStatus = "pending" | "approved" | "rejected";

export type ProposalBatch = {
  id: string;
  tripId: string;
  note: string | null;
  /** Exactly what was pasted, kept for the audit trail. */
  rawText: string;
  createdAt: string;
};

export type ProposalItem = {
  id: string;
  batchId: string;
  /** 0-based order within the batch -- what {"item": n} references and
   * dependsOn point at. */
  position: number;
  ref: string | null;
  op: ProposalOp;
  /** The row an update changes; null for a create. */
  targetId: string | null;
  /** {"data": ...} or {"changes": ...} -- read it back through
   * src/lib/proposals/schema.ts's storedPayloadSchema(), never trusted
   * as-is. */
  payload: unknown;
  dependsOn: number[];
  reason: string;
  status: ProposalStatus;
  decisionReason: string | null;
  decidedAt: string | null;
  /** The row the approval created, or (for an update) changed. */
  resultId: string | null;
  createdAt: string;
};

// Write-method inputs. Deliberately plain, hand-written types rather than
// importing the Zod-inferred types from src/lib/validation -- those
// modules import PaymentStatus/PaymentTiming/Refundability etc. from
// *this* file, so importing back from them would be circular. The
// validated value a Server Action gets back from a schema in
// src/lib/validation is structurally identical to the matching type
// below, so it's passed straight through with no mapping step.
export type CreateTripWrite = { name: string };
export type UpdateTripTravelWindowWrite = {
  tripId: string;
  departureDate?: string;
  returnDate?: string;
  travelDatesState: InfoState;
  travelDatesSourceId?: string;
  reason: string;
};

type CompetitionFieldsWrite = {
  name: string;
  city?: string;
  country?: string;
  venue?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  datesState: InfoState;
  datesSourceId?: string;
};

export type CreateCompetitionWrite = CompetitionFieldsWrite & { tripId: string };
// acceptanceStatus is deliberately absent -- see update_competition's
// own comment (20261019090000_manage_competitions_scenarios.sql).
export type UpdateCompetitionWrite = CompetitionFieldsWrite & { id: string; reason: string };

export type CreateScenarioWrite = {
  tripId: string;
  name: string;
  competitionId?: string;
  includesExtension: boolean;
  notes?: string;
};
// competitionId absent = unlink (a scenario with no competition yet).
export type UpdateScenarioWrite = { id: string; name: string; competitionId?: string; reason: string };
export type DeleteScenarioWrite = { id: string; reason: string };
// Same shape as DeleteScenarioWrite -- delete_scenario_cascade takes
// nothing extra, so this is just a type alias for the separate RPC
// below rather than a duplicate of an identical input.
export type DeleteScenarioCascadeWrite = DeleteScenarioWrite;

export type RecordSavingsEntryWrite = { tripId: string; amount: number; recordedOn: string; note?: string };
export type UpdateSavingsEntryWrite = { id: string; amount: number; recordedOn: string; note?: string; reason: string };
export type DeleteSavingsEntryWrite = { id: string; reason: string };

export type CreatePaymentWrite = {
  tripId: string;
  scenarioId?: string;
  budgetLineId?: string;
  category?: BudgetCategory;
  description: string;
  currency: string;
  totalAmount: number;
  refundability: Refundability;
  cancellationDeadline?: string;
  timingType: PaymentTiming;
  dueDate?: string;
  competitionRelated: boolean;
};
export type DeletePaymentWrite = { paymentId: string; reason: string };
export type RecordPaymentWrite = { paymentId: string; amount: number; reason: string };
export type UpdatePaymentStatusWrite = {
  paymentId: string;
  status: PaymentStatus;
  reason: string;
  riskAcceptedDecisionId?: string;
};
export type UpdatePaymentDetailsWrite = {
  paymentId: string;
  description: string;
  totalAmount: number;
  currency: string;
  dueDate?: string;
  cancellationDeadline?: string;
  datesState: InfoState;
  datesSourceId?: string;
  timingType: PaymentTiming;
  informationState: InfoState;
  sourceId?: string;
  refundability: Refundability;
  competitionRelated: boolean;
  reason: string;
  // Only ever set by the "I accept this risk" retry after a details
  // edit was blocked for raising total_amount past what a decision
  // covers (src/app/(app)/payment-actions.ts) -- never a plain form
  // field. Mirrors UpdatePaymentStatusWrite's own field of the same name.
  riskAcceptedDecisionId?: string;
};

export type CreateSourceWrite = {
  provider: string;
  tier: number;
  url?: string;
  observedOn: string;
  applicablePeriodStart?: string;
  applicablePeriodEnd?: string;
  notes?: string;
};

export type CreateBudgetLineWrite = {
  tripId: string;
  scenarioId?: string;
  category: BudgetCategory;
  description: string;
  amountMin: number;
  amountTarget: number;
  amountConservative: number;
  currency: string;
  informationState: InfoState;
  sourceId?: string;
  notes?: string;
  confidence?: Confidence;
  quantity?: number;
  quantityUnit?: QuantityUnit;
};
// scenarioId is deliberately not editable here -- only set at creation
// (CreateBudgetLineWrite above). update_budget_line's own RPC signature
// has no p_scenario_id for the same reason.
export type UpdateBudgetLineWrite = {
  id: string;
  category: BudgetCategory;
  description: string;
  amountMin: number;
  amountTarget: number;
  amountConservative: number;
  currency: string;
  informationState: InfoState;
  sourceId?: string;
  notes?: string;
  confidence?: Confidence;
  quantity?: number;
  quantityUnit?: QuantityUnit;
  reason: string;
};
export type DeleteBudgetLineWrite = { id: string; reason: string };

type LocationFieldsWrite = {
  name: string;
  timezone?: string;
  notes?: string;
};
export type CreateLocationWrite = LocationFieldsWrite;
export type UpdateLocationWrite = LocationFieldsWrite & { id: string; reason: string };
export type DeleteLocationWrite = { id: string; reason: string };

type StayFieldsWrite = {
  locationId: string;
  startDate: string;
  nights: number;
  kind: StayKind;
  budgetLineId?: string;
  informationState: InfoState;
  sourceId?: string;
  notes?: string;
  flightOptionId?: string;
};
export type CreateStayWrite = StayFieldsWrite & { scenarioId: string };
export type UpdateStayWrite = StayFieldsWrite & { id: string; reason: string };
export type DeleteStayWrite = { id: string; reason: string };

type MovementFieldsWrite = {
  sequence: number;
  fromLocationId: string;
  toLocationId: string;
  departDate: string;
  departTime?: string;
  arriveDate: string;
  arriveTime?: string;
  mode: MovementMode;
  budgetLineId?: string;
  bookingReference?: string;
  informationState: InfoState;
  sourceId?: string;
  notes?: string;
  flightOptionId?: string;
};
export type CreateMovementWrite = MovementFieldsWrite & { scenarioId: string };
export type UpdateMovementWrite = MovementFieldsWrite & { id: string; reason: string };
export type DeleteMovementWrite = { id: string; reason: string };

type FlightOptionFieldsWrite = {
  label: string;
  fare: number;
  bagFee: number;
  mandatoryFees: number;
  currency: string;
  informationState: InfoState;
  sourceId: string;
  observedOn: string;
  baggage: FlightBaggage;
  separateTickets: boolean;
  refundability: Refundability;
  competitionRelated: boolean;
  notes?: string;
};
export type CreateFlightOptionWrite = FlightOptionFieldsWrite & { scenarioId: string };
// status/bookingReference aren't part of creation -- every option
// starts life as a candidate with no booking reference, same reasoning
// as a payment starting "planned".
export type UpdateFlightOptionWrite = FlightOptionFieldsWrite & {
  id: string;
  status: FlightOptionStatus;
  bookingReference?: string;
  reason: string;
};
export type DeleteFlightOptionWrite = { id: string; reason: string };

export type CreateFlightSegmentWrite = {
  flightOptionId: string;
  direction: FlightDirection;
  segmentOrder: number;
  fromAirport: string;
  toAirport: string;
  fromCountry: string;
  toCountry: string;
  flightNumber?: string;
  departAt: string;
  arriveAt: string;
  isTechnicalStop: boolean;
};
export type DeleteFlightSegmentWrite = { id: string; reason: string };

// Mirrors CreatePaymentRiskDecisionWrite's own shape and reasoning:
// assembled server-side (src/app/(app)/flight-actions.ts) from the
// option being risk-accepted, never typed in by the person beyond the
// rationale itself.
export type CreateFlightRiskDecisionWrite = {
  tripId: string;
  competitionId: string;
  flightOptionId: string;
  optionLabel: string;
  rationale: string;
};

export type CreateFxRateWrite = {
  currency: string;
  rateToUsd: number;
  rateDate: string;
  rateKind: RateKind;
  informationState: InfoState;
  sourceId: string;
};
export type UpdateFxRateWrite = CreateFxRateWrite & { id: string; reason: string };

// Not a Zod-validated shape passed straight through like the others --
// paymentDescription/acceptedAmount/acceptedCurrency are derived
// server-side from the payment being risk-accepted
// (src/app/(app)/payment-actions.ts), never typed in by the person, so
// this is assembled by hand there.
export type CreatePaymentRiskDecisionWrite = {
  tripId: string;
  competitionId: string;
  paymentId: string;
  paymentDescription: string;
  rationale: string;
  acceptedAmount: number;
  acceptedCurrency: string;
};

// What src/lib/proposals/parse.ts hands create_proposal_batch() for each
// item -- already validated and linked.
export type ProposalItemWrite = {
  position: number;
  ref: string | null;
  op: ProposalOp;
  targetId: string | null;
  payload: unknown;
  dependsOn: number[];
  reason: string;
};
export type CreateProposalBatchWrite = {
  tripId: string;
  note?: string;
  rawText: string;
  items: ProposalItemWrite[];
};
export type RejectProposalWrite = { itemId: string; reason: string; cascade: boolean };
export type CloseProposalBatchWrite = { batchId: string; reason: string };

// One data-access layer, two implementations (src/lib/data/real.ts, the
// real Supabase-backed one, and src/lib/data/demo.ts, typed fixture data)
// -- chosen by src/lib/data/index.ts, the only place that calls
// isDemoMode(). Pages and components import only from src/lib/data/index.ts
// and never know which implementation answered.
//
// Phase 5 is adding write methods here one at a time: the bootstrap flow
// (create a trip, a competition, a scenario), then savings entries.
// Every one of them MUST call assertWritesAllowed() (src/lib/demo-mode.ts)
// as its first line, so a form submitted while DEMO_MODE is on throws
// instead of silently doing nothing, or worse, writing fixture-derived
// data into a real trip. See CLAUDE.md's "Demo mode" rule.
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
  getStays(): Promise<Stay[]>;
  getMovements(): Promise<Movement[]>;
  getLocations(): Promise<Location[]>;
  getChangeLog(): Promise<ChangeLogEntry[]>;
  getProposalBatches(): Promise<ProposalBatch[]>;
  getProposalItems(): Promise<ProposalItem[]>;
  createTrip(input: CreateTripWrite): Promise<Trip>;
  updateTripTravelWindow(input: UpdateTripTravelWindowWrite): Promise<Trip>;
  createCompetition(input: CreateCompetitionWrite): Promise<Competition>;
  updateCompetition(input: UpdateCompetitionWrite): Promise<Competition>;
  createScenario(input: CreateScenarioWrite): Promise<Scenario>;
  updateScenario(input: UpdateScenarioWrite): Promise<Scenario>;
  deleteScenario(input: DeleteScenarioWrite): Promise<void>;
  deleteScenarioCascade(input: DeleteScenarioCascadeWrite): Promise<void>;
  recordSavingsEntry(input: RecordSavingsEntryWrite): Promise<SavingsEntry>;
  updateSavingsEntry(input: UpdateSavingsEntryWrite): Promise<SavingsEntry>;
  deleteSavingsEntry(input: DeleteSavingsEntryWrite): Promise<void>;
  createPayment(input: CreatePaymentWrite): Promise<Payment>;
  recordPayment(input: RecordPaymentWrite): Promise<Payment>;
  updatePaymentStatus(input: UpdatePaymentStatusWrite): Promise<Payment>;
  updatePaymentDetails(input: UpdatePaymentDetailsWrite): Promise<Payment>;
  deletePayment(input: DeletePaymentWrite): Promise<void>;
  createPaymentRiskDecision(input: CreatePaymentRiskDecisionWrite): Promise<Decision>;
  createSource(input: CreateSourceWrite): Promise<Source>;
  createBudgetLine(input: CreateBudgetLineWrite): Promise<BudgetLine>;
  updateBudgetLine(input: UpdateBudgetLineWrite): Promise<BudgetLine>;
  deleteBudgetLine(input: DeleteBudgetLineWrite): Promise<void>;
  createFxRate(input: CreateFxRateWrite): Promise<FxRate>;
  updateFxRate(input: UpdateFxRateWrite): Promise<FxRate>;
  createStay(input: CreateStayWrite): Promise<Stay>;
  updateStay(input: UpdateStayWrite): Promise<Stay>;
  deleteStay(input: DeleteStayWrite): Promise<void>;
  createMovement(input: CreateMovementWrite): Promise<Movement>;
  updateMovement(input: UpdateMovementWrite): Promise<Movement>;
  deleteMovement(input: DeleteMovementWrite): Promise<void>;
  createLocation(input: CreateLocationWrite): Promise<Location>;
  updateLocation(input: UpdateLocationWrite): Promise<Location>;
  deleteLocation(input: DeleteLocationWrite): Promise<void>;
  createFlightOption(input: CreateFlightOptionWrite): Promise<FlightOption>;
  updateFlightOption(input: UpdateFlightOptionWrite): Promise<FlightOption>;
  deleteFlightOption(input: DeleteFlightOptionWrite): Promise<void>;
  createFlightSegment(input: CreateFlightSegmentWrite): Promise<FlightSegment>;
  deleteFlightSegment(input: DeleteFlightSegmentWrite): Promise<void>;
  createFlightRiskDecision(input: CreateFlightRiskDecisionWrite): Promise<Decision>;
  /** Returns the new batch's id. */
  createProposalBatch(input: CreateProposalBatchWrite): Promise<string>;
  approveProposal(itemId: string): Promise<ProposalItem>;
  /** Returns how many items were rejected (more than one with cascade). */
  rejectProposal(input: RejectProposalWrite): Promise<number>;
  /** Returns how many still-pending items were rejected. */
  closeProposalBatch(input: CloseProposalBatchWrite): Promise<number>;
};
