import "server-only";

import { assertWritesAllowed } from "@/lib/demo-mode";
import { createClient } from "@/lib/supabase/server";

import type {
  BudgetLine,
  Competition,
  DataSource,
  Decision,
  FlightOption,
  FlightSegment,
  FxRate,
  OpenItem,
  Payment,
  SavingsEntry,
  Scenario,
  Source,
  Trip,
} from "./types";

// Shared by the getters below and by the matching create* methods, so a
// freshly-inserted row and a row fetched later map to the same shape.
function mapTripRow(row: Record<string, unknown>): Trip {
  return {
    id: row.id as string,
    name: row.name as string,
    status: row.status as Trip["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapCompetitionRow(row: Record<string, unknown>): Competition {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    name: row.name as string,
    city: row.city as string,
    country: row.country as string,
    venue: row.venue as string | null,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    timezone: row.timezone as string,
    datesState: row.dates_state as Competition["datesState"],
    datesSourceId: row.dates_source_id as string | null,
    acceptanceStatus: row.acceptance_status as Competition["acceptanceStatus"],
    acceptanceDecidedOn: row.acceptance_decided_on as string | null,
    acceptanceSourceId: row.acceptance_source_id as string | null,
    isSelected: row.is_selected as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapScenarioRow(row: Record<string, unknown>): Scenario {
  return {
    id: row.id as string,
    tripId: row.trip_id as string,
    name: row.name as string,
    competitionId: row.competition_id as string | null,
    includesExtension: row.includes_extension as boolean,
    notes: row.notes as string | null,
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
    competitionId: row.competition_id as string | null,
    paymentId: row.payment_id as string | null,
    title: row.title as string,
    rationale: row.rationale as string | null,
    decidedOn: row.decided_on as string,
    decidedBy: row.decided_by as Decision["decidedBy"],
    reversible: row.reversible as boolean,
    supersededBy: row.superseded_by as string | null,
    sourceId: row.source_id as string | null,
    acceptedAmount: row.accepted_amount as number | null,
    acceptedCurrency: row.accepted_currency as string | null,
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
    autoCreated: row.auto_created as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
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
    competitionRelated: row.competition_related as boolean,
    riskAcceptedDecisionId: row.risk_accepted_decision_id as string | null,
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
    return (data ?? []).map(
      (row): Source => ({
        id: row.id,
        provider: row.provider,
        tier: row.tier,
        url: row.url,
        observedOn: row.observed_on,
        notes: row.notes,
        createdAt: row.created_at,
      }),
    );
  },

  async getCompetitions() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("competitions").select("*");
    if (error) throw error;
    return (data ?? []).map(mapCompetitionRow);
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
    return (data ?? []).map(
      (row): FxRate => ({
        id: row.id,
        currency: row.currency,
        rateToUsd: row.rate_to_usd,
        rateDate: row.rate_date,
        rateKind: row.rate_kind,
        informationState: row.information_state,
        sourceId: row.source_id,
      }),
    );
  },

  async getOpenItems() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("open_items").select("*");
    if (error) throw error;
    return (data ?? []).map(
      (row): OpenItem => ({
        id: row.id,
        tripId: row.trip_id,
        competitionId: row.competition_id,
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
    return (data ?? []).map(
      (row): FlightOption => ({
        id: row.id,
        scenarioId: row.scenario_id,
        fare: row.fare,
        bagFee: row.bag_fee,
        mandatoryFees: row.mandatory_fees,
        currency: row.currency,
        informationState: row.information_state,
        sourceId: row.source_id,
        observedOn: row.observed_on,
        baggage: row.baggage,
        separateTickets: row.separate_tickets,
        arrivalAt: row.arrival_at,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
  },

  async getFlightSegments() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("flight_segments").select("*");
    if (error) throw error;
    return (data ?? []).map(
      (row): FlightSegment => ({
        id: row.id,
        flightOptionId: row.flight_option_id,
        direction: row.direction,
        segmentOrder: row.segment_order,
        fromAirport: row.from_airport,
        toAirport: row.to_airport,
        fromCountry: row.from_country,
        toCountry: row.to_country,
        flightNumber: row.flight_number,
        departAt: row.depart_at,
        arriveAt: row.arrive_at,
        isTechnicalStop: row.is_technical_stop,
      }),
    );
  },

  async createTrip(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.from("trips").insert({ name: input.name }).select("*").single();
    if (error) throw error;
    return mapTripRow(data);
  },

  async createCompetition(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("competitions")
      .insert({
        trip_id: input.tripId,
        name: input.name,
        city: input.city,
        country: input.country,
        venue: input.venue ?? null,
        start_date: input.startDate,
        end_date: input.endDate,
        timezone: input.timezone,
        dates_state: input.datesState,
        dates_source_id: input.datesSourceId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapCompetitionRow(data);
  },

  async createScenario(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("scenarios")
      .insert({
        trip_id: input.tripId,
        name: input.name,
        competition_id: input.competitionId ?? null,
        includes_extension: input.includesExtension,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapScenarioRow(data);
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
      p_competition_related: input.competitionRelated,
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
      p_risk_accepted_decision_id: input.riskAcceptedDecisionId ?? null,
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
      p_competition_related: input.competitionRelated,
      p_reason: input.reason,
      p_risk_accepted_decision_id: input.riskAcceptedDecisionId ?? null,
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

  // A plain insert (decisions' own change_log trigger needs no reason
  // for one) -- paymentDescription/acceptedAmount/acceptedCurrency are
  // the frozen snapshot the payment-risk migration added; the caller
  // (payment-actions.ts) is the one that reads them off the live
  // payment before calling this, so the title names what was actually
  // agreed to even if the payment's own fields change later.
  async createPaymentRiskDecision(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("decisions")
      .insert({
        trip_id: input.tripId,
        competition_id: input.competitionId,
        payment_id: input.paymentId,
        title: `Accepted risk: ${input.paymentDescription} (${input.acceptedAmount} ${input.acceptedCurrency})`,
        rationale: input.rationale,
        decided_by: "traveler",
        accepted_amount: input.acceptedAmount,
        accepted_currency: input.acceptedCurrency,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapDecisionRow(data);
  },
};
