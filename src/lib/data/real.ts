import "server-only";

import { assertWritesAllowed } from "@/lib/demo-mode";
import { createClient } from "@/lib/supabase/server";

import type {
  BudgetLine,
  ChangeLogEntry,
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
    city: row.city as string | null,
    country: row.country as string | null,
    venue: row.venue as string | null,
    startDate: row.start_date as string | null,
    endDate: row.end_date as string | null,
    timezone: row.timezone as string | null,
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
    confidence: row.confidence as BudgetLine["confidence"],
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
    return (data ?? []).map(mapSourceRow);
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
    return mapCompetitionRow(data);
  },

  // Edits go through update_competition
  // (20261019090000_manage_competitions_scenarios.sql), same reason as
  // updateSavingsEntry below: the reason has to be set in the same call.
  async updateCompetition(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_competition", {
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
    return mapCompetitionRow(data as Record<string, unknown>);
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

  async updateScenario(input) {
    assertWritesAllowed();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_scenario", {
      p_id: input.id,
      p_name: input.name,
      p_competition_id: input.competitionId ?? null,
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
};
