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
    return (data ?? []).map(
      (row): Decision => ({
        id: row.id,
        tripId: row.trip_id,
        competitionId: row.competition_id,
        title: row.title,
        rationale: row.rationale,
        decidedOn: row.decided_on,
        decidedBy: row.decided_by,
        reversible: row.reversible,
        supersededBy: row.superseded_by,
        sourceId: row.source_id,
        createdAt: row.created_at,
      }),
    );
  },

  async getBudgetLines() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("budget_lines").select("*");
    if (error) throw error;
    return (data ?? []).map(
      (row): BudgetLine => ({
        id: row.id,
        tripId: row.trip_id,
        scenarioId: row.scenario_id,
        category: row.category,
        description: row.description,
        amountMin: row.amount_min,
        amountTarget: row.amount_target,
        amountConservative: row.amount_conservative,
        currency: row.currency,
        informationState: row.information_state,
        sourceId: row.source_id,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
  },

  async getPayments() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("payments").select("*");
    if (error) throw error;
    return (data ?? []).map(
      (row): Payment => ({
        id: row.id,
        budgetLineId: row.budget_line_id,
        scenarioId: row.scenario_id,
        description: row.description,
        totalAmount: row.total_amount,
        paidAmount: row.paid_amount,
        currency: row.currency,
        dueDate: row.due_date,
        cancellationDeadline: row.cancellation_deadline,
        datesState: row.dates_state,
        datesSourceId: row.dates_source_id,
        timingType: row.timing_type,
        status: row.status,
        informationState: row.information_state,
        sourceId: row.source_id,
        refundability: row.refundability,
        competitionRelated: row.competition_related,
        riskAcceptedDecisionId: row.risk_accepted_decision_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
  },

  async getSavingsEntries() {
    const supabase = await createClient();
    const { data, error } = await supabase.from("savings_entries").select("*");
    if (error) throw error;
    return (data ?? []).map(
      (row): SavingsEntry => ({
        id: row.id,
        tripId: row.trip_id,
        amount: row.amount,
        currency: row.currency,
        recordedOn: row.recorded_on,
        note: row.note,
        createdAt: row.created_at,
      }),
    );
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
};
