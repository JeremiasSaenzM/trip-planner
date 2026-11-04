import "server-only";

import { assertWritesAllowed } from "@/lib/demo-mode";
import { createClient } from "@/lib/supabase/server";

import type {
  AccommodationOption,
  BudgetLine,
  ChangeLogEntry,
  TripEvent,
  DataSource,
  Decision,
  FlightOption,
  FlightSegment,
  FxRate,
  Location,
  Movement,
  OpenItem,
  Payment,
  ProposalBatch,
  ProposalItem,
  SavingsEntry,
  Scenario,
  Source,
  Stay,
  Trip,
} from "./types";

// Shared by the getters below and by the matching create* methods, so a
// freshly-inserted row and a row fetched later map to the same shape.
function mapTripRow(row: Record<string, unknown>): Trip {
  return {
    id: row.id as string,
    name: row.name as string,
    status: row.status as Trip["status"],
    departureDate: row.departure_date as string | null,
    returnDate: row.return_date as string | null,
    travelDatesState: row.travel_dates_state as Trip["travelDatesState"],
    travelDatesSourceId: row.travel_dates_source_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapEventRow(row: Record<string, unknown>): TripEvent {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    name: row.name as string,
    city: row.city as string | null,
    country: row.country as string | null,
    venue: row.venue as string | null,
    startDate: row.start_date as string | null,
    endDate: row.end_date as string | null,
    timezone: row.timezone as string | null,
    datesState: row.dates_state as TripEvent["datesState"],
    datesSourceId: row.dates_source_id as string | null,
    isSelected: row.is_selected as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Postgres sends a daterange column back as its literal text form, e.g.
// "[2027-01-01,2027-02-01)" -- either bound can be empty (unbounded), and
// the whole value can be null (no period given at all).
function parseDateRange(value: string | null): Source["applicablePeriod"] {
  if (!value) return null;
  const match = /^[[(]([^,]*),([^,]*)[\])]$/.exec(value);
  if (!match) return null;
  return { start: match[1] || null, end: match[2] || null };
}

// The inverse, for writing: composes whichever of start/end were given
// into the same literal form Postgres expects on insert. Both empty
// means "no period at all" (null), not an empty range.
function composeDateRange(start: string | undefined, end: string | undefined): string | null {
  if (!start && !end) return null;
  return `[${start ?? ""},${end ?? ""})`;
}

function mapSourceRow(row: Record<string, unknown>): Source {
  return {
    id: row.id as string,
    provider: row.provider as string,
    tier: row.tier as number,
    url: row.url as string | null,
    observedOn: row.observed_on as string,
    applicablePeriod: parseDateRange(row.applicable_period as string | null),
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
  };
}

function mapFxRateRow(row: Record<string, unknown>): FxRate {
  return {
    id: row.id as string,
    currency: row.currency as string,
    rateToUsd: row.rate_to_usd as number,
    rateDate: row.rate_date as string,
    rateKind: row.rate_kind as FxRate["rateKind"],
    informationState: row.information_state as FxRate["informationState"],
    sourceId: row.source_id as string,
  };
}

function mapScenarioRow(row: Record<string, unknown>): Scenario {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    name: row.name as string,
    eventId: row.event_id as string | null,
    includesExtension: row.includes_extension as boolean,
    notes: row.notes as string | null,
    departureDate: row.departure_date as string | null,
    returnDate: row.return_date as string | null,
    travelDatesState: row.travel_dates_state as Scenario["travelDatesState"],
    travelDatesSourceId: row.travel_dates_source_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapSavingsEntryRow(row: Record<string, unknown>): SavingsEntry {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    amount: row.amount as number,
    currency: row.currency as SavingsEntry["currency"],
    recordedOn: row.recorded_on as string,
    note: row.note as string | null,
    createdAt: row.created_at as string,
  };
}

function mapDecisionRow(row: Record<string, unknown>): Decision {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    eventId: row.event_id as string | null,
    title: row.title as string,
    rationale: row.rationale as string | null,
    decidedOn: row.decided_on as string,
    decidedBy: row.decided_by as Decision["decidedBy"],
    reversible: row.reversible as boolean,
    supersededBy: row.superseded_by as string | null,
    sourceId: row.source_id as string | null,
    createdAt: row.created_at as string,
  };
}

function mapBudgetLineRow(row: Record<string, unknown>): BudgetLine {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    scenarioId: row.scenario_id as string | null,
    category: row.category as BudgetLine["category"],
    description: row.description as string,
    amountMin: row.amount_min as number,
    amountTarget: row.amount_target as number,
    amountConservative: row.amount_conservative as number,
    currency: row.currency as string,
    informationState: row.information_state as BudgetLine["informationState"],
    sourceId: row.source_id as string | null,
    notes: row.notes as string | null,
    confidence: row.confidence as BudgetLine["confidence"],
    quantity: row.quantity as number | null,
    quantityUnit: row.quantity_unit as BudgetLine["quantityUnit"],
    autoCreated: row.auto_created as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapLocationRow(row: Record<string, unknown>): Location {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    name: row.name as string,
    timezone: row.timezone as string | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapStayRow(row: Record<string, unknown>): Stay {
  return {
    id: row.id as string,
    scenarioId: row.scenario_id as string,
    locationId: row.location_id as string,
    startDate: row.start_date as string,
    nights: row.nights as number,
    kind: row.kind as Stay["kind"],
    budgetLineId: row.budget_line_id as string | null,
    informationState: row.information_state as Stay["informationState"],
    sourceId: row.source_id as string | null,
    notes: row.notes as string | null,
    flightOptionId: row.flight_option_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapMovementRow(row: Record<string, unknown>): Movement {
  return {
    id: row.id as string,
    scenarioId: row.scenario_id as string,
    sequence: row.sequence as number,
    fromLocationId: row.from_location_id as string,
    toLocationId: row.to_location_id as string,
    departDate: row.depart_date as string,
    departTime: row.depart_time as string | null,
    arriveDate: row.arrive_date as string,
    arriveTime: row.arrive_time as string | null,
    mode: row.mode as Movement["mode"],
    budgetLineId: row.budget_line_id as string | null,
    bookingReference: row.booking_reference as string | null,
    informationState: row.information_state as Movement["informationState"],
    sourceId: row.source_id as string | null,
    notes: row.notes as string | null,
    flightOptionId: row.flight_option_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapFlightOptionRow(row: Record<string, unknown>): FlightOption {
  return {
    id: row.id as string,
    scenarioId: row.scenario_id as string,
    label: row.label as string,
    status: row.status as FlightOption["status"],
    fare: row.fare as number,
    bagFee: row.bag_fee as number,
    mandatoryFees: row.mandatory_fees as number,
    currency: row.currency as string,
    informationState: row.information_state as FlightOption["informationState"],
    sourceId: row.source_id as string,
    observedOn: row.observed_on as string,
    baggage: row.baggage as FlightOption["baggage"],
    separateTickets: row.separate_tickets as boolean,
    refundability: row.refundability as FlightOption["refundability"],
    bookingReference: row.booking_reference as string | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapAccommodationOptionRow(row: Record<string, unknown>): AccommodationOption {
  return {
    id: row.id as string,
    stayId: row.stay_id as string,
    label: row.label as string,
    propertyName: row.property_name as string,
    address: row.address as string | null,
    rateAmount: row.rate_amount as number,
    rateUnit: row.rate_unit as AccommodationOption["rateUnit"],
    nights: row.nights as number,
    mandatoryFees: row.mandatory_fees as number,
    currency: row.currency as string,
    status: row.status as AccommodationOption["status"],
    refundability: row.refundability as AccommodationOption["refundability"],
    cancellationDeadline: row.cancellation_deadline as string | null,
    bookingReference: row.booking_reference as string | null,
    conditionalRate: row.conditional_rate as boolean,
    undiscountedAmount: row.undiscounted_amount as number | null,
    isHostel: row.is_hostel as boolean,
    sourceId: row.source_id as string,
    observedOn: row.observed_on as string,
    informationState: row.information_state as AccommodationOption["informationState"],
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapFlightSegmentRow(row: Record<string, unknown>): FlightSegment {
  return {
    id: row.id as string,
    flightOptionId: row.flight_option_id as string,
    direction: row.direction as FlightSegment["direction"],
    segmentOrder: row.segment_order as number,
    fromAirport: row.from_airport as string,
    toAirport: row.to_airport as string,
    fromCountry: row.from_country as string,
    toCountry: row.to_country as string,
    flightNumber: row.flight_number as string | null,
    departAt: row.depart_at as string,
    arriveAt: row.arrive_at as string,
    isTechnicalStop: row.is_technical_stop as boolean,
  };
}

function mapProposalItemRow(row: Record<string, unknown>): ProposalItem {
  return {
    id: row.id as string,
    batchId: row.batch_id as string,
    position: row.position as number,
    ref: row.ref as string | null,
    op: row.op as ProposalItem["op"],
    targetId: row.target_id as string | null,
    payload: row.payload,
    dependsOn: row.depends_on as number[],
    reason: row.reason as string,
    status: row.status as ProposalItem["status"],
    decisionReason: row.decision_reason as string | null,
    decidedAt: row.decided_at as string | null,
    resultId: row.result_id as string | null,
    createdAt: row.created_at as string,
  };
}

function mapPaymentRow(row: Record<string, unknown>): Payment {
  return {
    id: row.id as string,
    budgetLineId: row.budget_line_id as string,
    scenarioId: row.scenario_id as string | null,
    description: row.description as string,
    totalAmount: row.total_amount as number,
    paidAmount: row.paid_amount as number,
    currency: row.currency as string,
    dueDate: row.due_date as string | null,
    cancellationDeadline: row.cancellation_deadline as string | null,
    datesState: row.dates_state as Payment["datesState"],
    datesSourceId: row.dates_source_id as string | null,
    timingType: row.timing_type as Payment["timingType"],
    status: row.status as Payment["status"],
    informationState: row.information_state as Payment["informationState"],
    sourceId: row.source_id as string | null,
    refundability: row.refundability as Payment["refundability"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Real implementation: queries Supabase directly. Every table has an
// "owner_all" RLS policy, so these never add their own owner filter --
// the signed-in user's rows are already all Postgres will return.
//
// Not covered by Vitest: "server-only" only resolves inside Next.js's
// own bundler, not under plain Node/Vitest, so this file (and anything
// that imports it, including ./index) is exercised by hand and by the
// Vercel preview deploy, not by `npm test`. src/lib/auth.ts and
// src/lib/supabase/server.ts already follow the same pattern.
export const realDataSource: DataSource = {
  async getTrips() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("trips").select("*");
    if (error) throw error;
    return (data ?? []).map(mapTripRow);
  },

  async getSources() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("sources").select("*");
    if (error) throw error;
    return (data ?? []).map(mapSourceRow);
  },

  async getEvents() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("events").select("*");
    if (error) throw error;
    return (data ?? []).map(mapEventRow);
  },

  async getScenarios() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("scenarios").select("*");
    if (error) throw error;
    return (data ?? []).map(mapScenarioRow);
  },

  async getDecisions() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("decisions").select("*");
    if (error) throw error;
    return (data ?? []).map(mapDecisionRow);
  },

  async getBudgetLines() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("budget_lines").select("*");
    if (error) throw error;
    return (data ?? []).map(mapBudgetLineRow);
  },

  async getPayments() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("payments").select("*");
    if (error) throw error;
    return (data ?? []).map(mapPaymentRow);
  },

  async getSavingsEntries() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("savings_entries").select("*");
    if (error) throw error;
    return (data ?? []).map(mapSavingsEntryRow);
  },

  async getFxRates() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("fx_rates").select("*");
    if (error) throw error;
    return (data ?? []).map(mapFxRateRow);
  },

  async getOpenItems() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("open_items").select("*");
    if (error) throw error;
    return (data ?? []).map(
      (row): OpenItem => ({
        id: row.id,
        tripId: row.trip_id,
        eventId: row.event_id,
        title: row.title,
        description: row.description,
        dueDate: row.due_date,
        datesState: row.dates_state,
        datesSourceId: row.dates_source_id,
        category: row.category,
        status: row.status,
        relatedBudgetLineId: row.related_budget_line_id,
        relatedPaymentId: row.related_payment_id,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
      }),
    );
  },

  async getFlightOptions() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("flight_options").select("*");
    if (error) throw error;
    return (data ?? []).map(mapFlightOptionRow);
  },

  async getFlightSegments() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("flight_segments").select("*");
    if (error) throw error;
    return (data ?? []).map(mapFlightSegmentRow);
  },

  async getStays() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("stays").select("*");
    if (error) throw error;
    return (data ?? []).map(mapStayRow);
  },

  async getMovements() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("movements").select("*");
    if (error) throw error;
    return (data ?? []).map(mapMovementRow);
  },

  async getLocations() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("locations").select("*");
    if (error) throw error;
    return (data ?? []).map(mapLocationRow);
  },

  async getAccommodationOptions() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("accommodation_options").select("*");
    if (error) throw error;
    return (data ?? []).map(mapAccommodationOptionRow);
  },

  // Read-only: change_log has no owner write policy at all (only the
  // SECURITY DEFINER trigger writes it) -- this exists purely for the
  // export feature.
  async getChangeLog() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("change_log").select("*");
    if (error) throw error;
    return (data ?? []).map(
      (row): ChangeLogEntry => ({
        id: row.id,
        tableName: row.table_name,
        rowId: row.row_id,
        action: row.action,
        oldData: row.old_data,
        newData: row.new_data,
        reason: row.reason,
        actor: row.actor,
        changedAt: row.changed_at,
        changedBy: row.changed_by,
      }),
    );
  },

  async getProposalBatches() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("proposal_batches").select("*");
    if (error) throw error;
    return (data ?? []).map(
      (row): ProposalBatch => ({
        id: row.id,
        tripId: row.trip_id,
        note: row.note,
        rawText: row.raw_text,
        createdAt: row.created_at,
      }),
    );
  },

  async getProposalItems() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("proposal_items").select("*");
    if (error) throw error;
    return (data ?? []).map(mapProposalItemRow);
  },

  async createTrip(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.from("trips").insert({ name: input.name }).select("*").single();
    if (error) throw error;
    return mapTripRow(data);
  },

  // update_trip_travel_window (20261022090000_trip_travel_window.sql) --
  // setting the window is an UPDATE on the trip, so it needs a reason,
  // set in the same call the change_log trigger checks it in.
  async updateTripTravelWindow(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_trip_travel_window", {
      p_trip_id: input.tripId,
      p_departure_date: input.departureDate ?? null,
      p_return_date: input.returnDate ?? null,
      p_travel_dates_state: input.travelDatesState,
      p_travel_dates_source_id: input.travelDatesSourceId ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapTripRow(data as Record<string, unknown>);
  },

  async createEvent(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("events")
      .insert({
        trip_id: input.tripId,
        name: input.name,
        city: input.city ?? null,
        country: input.country ?? null,
        venue: input.venue ?? null,
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
        timezone: input.timezone ?? null,
        dates_state: input.datesState,
        dates_source_id: input.datesSourceId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapEventRow(data);
  },

  // Edits go through update_event
  // (20261104090000_rename_competitions_to_events.sql), same reason as
  // updateSavingsEntry below: the reason has to be set in the same call.
  async updateEvent(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_event", {
      p_id: input.id,
      p_name: input.name,
      p_city: input.city ?? null,
      p_country: input.country ?? null,
      p_venue: input.venue ?? null,
      p_start_date: input.startDate ?? null,
      p_end_date: input.endDate ?? null,
      p_timezone: input.timezone ?? null,
      p_dates_state: input.datesState,
      p_dates_source_id: input.datesSourceId ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapEventRow(data as Record<string, unknown>);
  },

  async createScenario(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("scenarios")
      .insert({
        trip_id: input.tripId,
        name: input.name,
        event_id: input.eventId ?? null,
        includes_extension: input.includesExtension,
        notes: input.notes ?? null,
        departure_date: input.departureDate ?? null,
        return_date: input.returnDate ?? null,
        travel_dates_source_id: input.travelDatesSourceId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapScenarioRow(data);
  },

  async updateScenario(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_scenario", {
      p_id: input.id,
      p_name: input.name,
      p_event_id: input.eventId ?? null,
      p_departure_date: input.departureDate ?? null,
      p_return_date: input.returnDate ?? null,
      p_travel_dates_state: input.travelDatesState,
      p_travel_dates_source_id: input.travelDatesSourceId ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapScenarioRow(data as Record<string, unknown>);
  },

  async deleteScenario(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_scenario", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  async deleteScenarioCascade(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_scenario_cascade", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  // A new entry has nothing prior to justify changing, so change_log's
  // trigger doesn't require a reason for it -- this stays a plain
  // insert, with currency hardcoded to "USD" (see savings-entries.ts's
  // own doc comment on why the form never asks for one).
  async recordSavingsEntry(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("savings_entries")
      .insert({
        trip_id: input.tripId,
        amount: input.amount,
        currency: "USD",
        recorded_on: input.recordedOn,
        note: input.note ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapSavingsEntryRow(data);
  },

  // Edits and deletes go through RPCs (20261014200000_savings_entries_writes.sql)
  // that set app.change_reason in the same call the trigger checks it
  // in -- a plain .update()/.delete() has no way to do that, since
  // PostgREST runs each request as a single statement.
  async updateSavingsEntry(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_savings_entry", {
      p_id: input.id,
      p_amount: input.amount,
      p_recorded_on: input.recordedOn,
      p_note: input.note ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapSavingsEntryRow(data as Record<string, unknown>);
  },

  async deleteSavingsEntry(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_savings_entry", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  // create_payment (20261015093000_payments_writes.sql) does both
  // inserts (the payment, and -- when no budgetLineId is given -- its
  // new budget line) in one call, so they succeed or fail together.
  async createPayment(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_payment", {
      p_trip_id: input.tripId,
      p_scenario_id: input.scenarioId ?? null,
      p_budget_line_id: input.budgetLineId ?? null,
      p_category: input.category ?? null,
      p_description: input.description,
      p_currency: input.currency,
      p_total_amount: input.totalAmount,
      p_refundability: input.refundability,
      p_cancellation_deadline: input.cancellationDeadline ?? null,
      p_timing_type: input.timingType,
      p_due_date: input.dueDate ?? null,
    });
    if (error) throw error;
    return mapPaymentRow(data as Record<string, unknown>);
  },

  async recordPayment(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_payment", {
      p_payment_id: input.paymentId,
      p_amount: input.amount,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapPaymentRow(data as Record<string, unknown>);
  },

  async updatePaymentStatus(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_payment_status", {
      p_payment_id: input.paymentId,
      p_status: input.status,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapPaymentRow(data as Record<string, unknown>);
  },

  async updatePaymentDetails(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_payment_details", {
      p_payment_id: input.paymentId,
      p_description: input.description,
      p_total_amount: input.totalAmount,
      p_currency: input.currency,
      p_due_date: input.dueDate ?? null,
      p_cancellation_deadline: input.cancellationDeadline ?? null,
      p_dates_state: input.datesState,
      p_dates_source_id: input.datesSourceId ?? null,
      p_timing_type: input.timingType,
      p_information_state: input.informationState,
      p_source_id: input.sourceId ?? null,
      p_refundability: input.refundability,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapPaymentRow(data as Record<string, unknown>);
  },

  async deletePayment(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_payment", {
      p_payment_id: input.paymentId,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  // A plain insert (sources' own change_log trigger needs no reason for
  // one, and there's no edit/delete RPC for sources yet -- see
  // CLAUDE.md's Phase 7 backlog). composeDateRange turns whichever of
  // start/end were given into the daterange literal the column expects.
  async createSource(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sources")
      .insert({
        provider: input.provider,
        tier: input.tier,
        url: input.url ?? null,
        observed_on: input.observedOn,
        applicable_period: composeDateRange(input.applicablePeriodStart, input.applicablePeriodEnd),
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapSourceRow(data);
  },

  // Also a plain insert -- unlike create_payment, there's no second
  // table involved, so no RPC is needed just for atomicity.
  async createBudgetLine(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_lines")
      .insert({
        trip_id: input.tripId,
        scenario_id: input.scenarioId ?? null,
        category: input.category,
        description: input.description,
        amount_min: input.amountMin,
        amount_target: input.amountTarget,
        amount_conservative: input.amountConservative,
        currency: input.currency,
        information_state: input.informationState,
        source_id: input.sourceId ?? null,
        notes: input.notes ?? null,
        confidence: input.confidence ?? null,
        quantity: input.quantity ?? null,
        quantity_unit: input.quantityUnit ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapBudgetLineRow(data);
  },

  async updateBudgetLine(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_budget_line", {
      p_id: input.id,
      p_category: input.category,
      p_description: input.description,
      p_amount_min: input.amountMin,
      p_amount_target: input.amountTarget,
      p_amount_conservative: input.amountConservative,
      p_currency: input.currency,
      p_information_state: input.informationState,
      p_source_id: input.sourceId ?? null,
      p_notes: input.notes ?? null,
      p_confidence: input.confidence ?? null,
      p_quantity: input.quantity ?? null,
      p_quantity_unit: input.quantityUnit ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapBudgetLineRow(data as Record<string, unknown>);
  },

  async deleteBudgetLine(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_budget_line", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  async createFxRate(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("fx_rates")
      .insert({
        currency: input.currency,
        rate_to_usd: input.rateToUsd,
        rate_date: input.rateDate,
        rate_kind: input.rateKind,
        information_state: input.informationState,
        source_id: input.sourceId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapFxRateRow(data);
  },

  async updateFxRate(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_fx_rate", {
      p_id: input.id,
      p_currency: input.currency,
      p_rate_to_usd: input.rateToUsd,
      p_rate_date: input.rateDate,
      p_rate_kind: input.rateKind,
      p_information_state: input.informationState,
      p_source_id: input.sourceId,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapFxRateRow(data as Record<string, unknown>);
  },

  // Also a plain insert -- nothing existed before to justify changing,
  // same reasoning as createBudgetLine.
  async createStay(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stays")
      .insert({
        scenario_id: input.scenarioId,
        location_id: input.locationId,
        start_date: input.startDate,
        nights: input.nights,
        kind: input.kind,
        budget_line_id: input.budgetLineId ?? null,
        information_state: input.informationState,
        source_id: input.sourceId ?? null,
        notes: input.notes ?? null,
        flight_option_id: input.flightOptionId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapStayRow(data);
  },

  async updateStay(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_stay", {
      p_id: input.id,
      p_location_id: input.locationId,
      p_start_date: input.startDate,
      p_nights: input.nights,
      p_kind: input.kind,
      p_budget_line_id: input.budgetLineId ?? null,
      p_information_state: input.informationState,
      p_source_id: input.sourceId ?? null,
      p_notes: input.notes ?? null,
      p_flight_option_id: input.flightOptionId ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapStayRow(data as Record<string, unknown>);
  },

  async deleteStay(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_stay", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  async createMovement(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("movements")
      .insert({
        scenario_id: input.scenarioId,
        sequence: input.sequence,
        from_location_id: input.fromLocationId,
        to_location_id: input.toLocationId,
        depart_date: input.departDate,
        depart_time: input.departTime ?? null,
        arrive_date: input.arriveDate,
        arrive_time: input.arriveTime ?? null,
        mode: input.mode,
        budget_line_id: input.budgetLineId ?? null,
        booking_reference: input.bookingReference ?? null,
        information_state: input.informationState,
        source_id: input.sourceId ?? null,
        notes: input.notes ?? null,
        flight_option_id: input.flightOptionId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapMovementRow(data);
  },

  async updateMovement(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_movement", {
      p_id: input.id,
      p_sequence: input.sequence,
      p_from_location_id: input.fromLocationId,
      p_to_location_id: input.toLocationId,
      p_depart_date: input.departDate,
      p_depart_time: input.departTime ?? null,
      p_arrive_date: input.arriveDate,
      p_arrive_time: input.arriveTime ?? null,
      p_mode: input.mode,
      p_budget_line_id: input.budgetLineId ?? null,
      p_booking_reference: input.bookingReference ?? null,
      p_information_state: input.informationState,
      p_source_id: input.sourceId ?? null,
      p_notes: input.notes ?? null,
      p_flight_option_id: input.flightOptionId ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapMovementRow(data as Record<string, unknown>);
  },

  async deleteMovement(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_movement", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  // Also a plain insert -- same reasoning as createStay/createBudgetLine.
  async createLocation(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("locations")
      .insert({
        name: input.name,
        timezone: input.timezone ?? null,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapLocationRow(data);
  },

  async updateLocation(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_location", {
      p_id: input.id,
      p_name: input.name,
      p_timezone: input.timezone ?? null,
      p_notes: input.notes ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapLocationRow(data as Record<string, unknown>);
  },

  // The FK (locations referenced by stays/movements, no cascade or
  // set-null) is what makes this safe to offer at all: delete_location
  // refuses, naming the referencing row, rather than letting a bare
  // foreign-key violation surface (20261029090100).
  async deleteLocation(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_location", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  // Plain insert -- every option starts life as a candidate, same
  // reasoning as createStay/createMovement (20261028090000).
  async createFlightOption(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("flight_options")
      .insert({
        scenario_id: input.scenarioId,
        label: input.label,
        fare: input.fare,
        bag_fee: input.bagFee,
        mandatory_fees: input.mandatoryFees,
        currency: input.currency,
        information_state: input.informationState,
        source_id: input.sourceId,
        observed_on: input.observedOn,
        baggage: input.baggage,
        separate_tickets: input.separateTickets,
        refundability: input.refundability,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapFlightOptionRow(data);
  },

  async updateFlightOption(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_flight_option", {
      p_id: input.id,
      p_label: input.label,
      p_fare: input.fare,
      p_bag_fee: input.bagFee,
      p_mandatory_fees: input.mandatoryFees,
      p_currency: input.currency,
      p_information_state: input.informationState,
      p_source_id: input.sourceId,
      p_observed_on: input.observedOn,
      p_baggage: input.baggage,
      p_separate_tickets: input.separateTickets,
      p_refundability: input.refundability,
      p_status: input.status,
      p_booking_reference: input.bookingReference ?? null,
      p_notes: input.notes ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapFlightOptionRow(data as Record<string, unknown>);
  },

  async deleteFlightOption(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_flight_option", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  // Plain insert -- every option starts life as a candidate, same
  // reasoning as createFlightOption.
  async createAccommodationOption(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("accommodation_options")
      .insert({
        stay_id: input.stayId,
        label: input.label,
        property_name: input.propertyName,
        address: input.address ?? null,
        rate_amount: input.rateAmount,
        rate_unit: input.rateUnit,
        nights: input.nights,
        mandatory_fees: input.mandatoryFees,
        currency: input.currency,
        refundability: input.refundability,
        cancellation_deadline: input.cancellationDeadline ?? null,
        booking_reference: input.bookingReference ?? null,
        conditional_rate: input.conditionalRate,
        undiscounted_amount: input.undiscountedAmount ?? null,
        is_hostel: input.isHostel,
        source_id: input.sourceId,
        observed_on: input.observedOn,
        information_state: input.informationState,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAccommodationOptionRow(data);
  },

  async updateAccommodationOption(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_accommodation_option", {
      p_id: input.id,
      p_label: input.label,
      p_property_name: input.propertyName,
      p_address: input.address ?? null,
      p_rate_amount: input.rateAmount,
      p_rate_unit: input.rateUnit,
      p_nights: input.nights,
      p_mandatory_fees: input.mandatoryFees,
      p_currency: input.currency,
      p_status: input.status,
      p_refundability: input.refundability,
      p_cancellation_deadline: input.cancellationDeadline ?? null,
      p_booking_reference: input.bookingReference ?? null,
      p_conditional_rate: input.conditionalRate,
      p_undiscounted_amount: input.undiscountedAmount ?? null,
      p_is_hostel: input.isHostel,
      p_source_id: input.sourceId,
      p_observed_on: input.observedOn,
      p_information_state: input.informationState,
      p_notes: input.notes ?? null,
      p_reason: input.reason,
    });
    if (error) throw error;
    return mapAccommodationOptionRow(data as Record<string, unknown>);
  },

  async deleteAccommodationOption(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_accommodation_option", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  // A segment is small enough to delete and re-add rather than edit --
  // no updateFlightSegment, matching there being no update_flight_segment
  // RPC (20261028090000).
  async createFlightSegment(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("flight_segments")
      .insert({
        flight_option_id: input.flightOptionId,
        direction: input.direction,
        segment_order: input.segmentOrder,
        from_airport: input.fromAirport,
        to_airport: input.toAirport,
        from_country: input.fromCountry,
        to_country: input.toCountry,
        flight_number: input.flightNumber ?? null,
        depart_at: input.departAt,
        arrive_at: input.arriveAt,
        is_technical_stop: input.isTechnicalStop,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapFlightSegmentRow(data);
  },

  async deleteFlightSegment(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_flight_segment", {
      p_id: input.id,
      p_reason: input.reason,
    });
    if (error) throw error;
  },

  // Import proposals (20261021090000_import_proposals.sql). Saving a
  // batch is one RPC so its items land together or not at all; approving
  // runs the proposed write and marks the item in one transaction, with
  // change_log recording actor 'claude' and the proposal's own reason.
  async createProposalBatch(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_proposal_batch", {
      p_trip_id: input.tripId,
      p_note: input.note ?? null,
      p_raw_text: input.rawText,
      p_items: input.items,
    });
    if (error) throw error;
    return data as string;
  },

  async approveProposal(itemId) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("approve_proposal", { p_item_id: itemId });
    if (error) throw error;
    return mapProposalItemRow(data as Record<string, unknown>);
  },

  async rejectProposal(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reject_proposal", {
      p_item_id: input.itemId,
      p_reason: input.reason,
      p_cascade: input.cascade,
    });
    if (error) throw error;
    return data as number;
  },

  async closeProposalBatch(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("close_proposal_batch", {
      p_batch_id: input.batchId,
      p_reason: input.reason,
    });
    if (error) throw error;
    return data as number;
  },
};
