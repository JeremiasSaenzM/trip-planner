import type { z } from "zod";

import type {
  BudgetLine,
  Competition,
  FlightOption,
  FlightSegment,
  FxRate,
  Location,
  Movement,
  Payment,
  ProposalOp,
  SavingsEntry,
  Scenario,
  Stay,
} from "@/lib/data/types";
import { createBudgetLineInput, updateBudgetLineInput } from "@/lib/validation/budget-lines";
import { createCompetitionInput, updateCompetitionInput } from "@/lib/validation/competitions";
import { createFlightOptionInput, updateFlightOptionInput } from "@/lib/validation/flight-options";
import { createFlightSegmentInput } from "@/lib/validation/flight-segments";
import { createFxRateInput, updateFxRateInput } from "@/lib/validation/fx-rates";
import { createLocationInput, updateLocationInput } from "@/lib/validation/locations";
import { createMovementInput, updateMovementInput } from "@/lib/validation/movements";
import { createPaymentInput, updatePaymentDetailsInput } from "@/lib/validation/payments";
import { updateSavingsEntryInput } from "@/lib/validation/savings-entries";
import { createScenarioInput, updateScenarioInput } from "@/lib/validation/scenarios";
import { createSourceInput } from "@/lib/validation/sources";
import { createStayInput, updateStayInput } from "@/lib/validation/stays";

import {
  isUpdateOp,
  REFERENCE_FIELDS,
  storedPayloadSchema,
  type CreateData,
  type CreateOp,
  type FieldChange,
  type Reference,
  type UpdateOp,
} from "./schema";

export type CurrentRows = {
  competitions: Competition[];
  scenarios: Scenario[];
  budgetLines: BudgetLine[];
  payments: Payment[];
  fxRates: FxRate[];
  savingsEntries: SavingsEntry[];
  stays: Stay[];
  movements: Movement[];
  flightOptions: FlightOption[];
  flightSegments: FlightSegment[];
  locations: Location[];
};

export type StoredPayload = { data: Record<string, unknown> } | { changes: Record<string, FieldChange> };

/** Reads a stored payload back through its operation's schema. */
export function readPayload(op: ProposalOp, payload: unknown): StoredPayload | null {
  const parsed = storedPayloadSchema(op).safeParse(payload);
  return parsed.success ? (parsed.data as StoredPayload) : null;
}

/**
 * The row an update targets, as it is now, in the payload's own field
 * names -- the TypeScript twin of approve_proposal()'s v_current
 * (20261021090000_import_proposals.sql). Keep the two in step: this one
 * decides what the review screen shows as current (and stale), that one
 * decides what approval actually checks under its row lock.
 */
export function currentFields(op: UpdateOp, targetId: string, rows: CurrentRows): Record<string, unknown> | null {
  switch (op) {
    case "update_competition": {
      const row = rows.competitions.find((c) => c.id === targetId);
      return row
        ? {
            name: row.name,
            city: row.city,
            country: row.country,
            venue: row.venue,
            startDate: row.startDate,
            endDate: row.endDate,
            timezone: row.timezone,
            datesState: row.datesState,
            datesSource: row.datesSourceId,
          }
        : null;
    }
    case "update_scenario": {
      const row = rows.scenarios.find((s) => s.id === targetId);
      return row ? { name: row.name, competition: row.competitionId } : null;
    }
    case "update_budget_line": {
      const row = rows.budgetLines.find((l) => l.id === targetId);
      return row
        ? {
            category: row.category,
            description: row.description,
            amountMin: row.amountMin,
            amountTarget: row.amountTarget,
            amountConservative: row.amountConservative,
            currency: row.currency,
            informationState: row.informationState,
            source: row.sourceId,
            notes: row.notes,
            confidence: row.confidence,
            quantity: row.quantity,
            quantityUnit: row.quantityUnit,
          }
        : null;
    }
    case "update_payment": {
      const row = rows.payments.find((p) => p.id === targetId);
      return row
        ? {
            description: row.description,
            totalAmount: row.totalAmount,
            currency: row.currency,
            dueDate: row.dueDate,
            cancellationDeadline: row.cancellationDeadline,
            datesState: row.datesState,
            datesSource: row.datesSourceId,
            timingType: row.timingType,
            informationState: row.informationState,
            source: row.sourceId,
            refundability: row.refundability,
            competitionRelated: row.competitionRelated,
          }
        : null;
    }
    case "update_fx_rate": {
      const row = rows.fxRates.find((r) => r.id === targetId);
      return row
        ? {
            currency: row.currency,
            rateToUsd: row.rateToUsd,
            rateDate: row.rateDate,
            rateKind: row.rateKind,
            informationState: row.informationState,
            source: row.sourceId,
          }
        : null;
    }
    case "update_savings_entry": {
      const row = rows.savingsEntries.find((e) => e.id === targetId);
      return row ? { amount: row.amount, recordedOn: row.recordedOn, note: row.note } : null;
    }
    case "update_stay": {
      const row = rows.stays.find((s) => s.id === targetId);
      return row
        ? {
            location: row.locationId,
            startDate: row.startDate,
            nights: row.nights,
            kind: row.kind,
            budgetLine: row.budgetLineId,
            informationState: row.informationState,
            source: row.sourceId,
            notes: row.notes,
            flightOption: row.flightOptionId,
          }
        : null;
    }
    case "update_movement": {
      const row = rows.movements.find((m) => m.id === targetId);
      return row
        ? {
            sequence: row.sequence,
            fromLocation: row.fromLocationId,
            toLocation: row.toLocationId,
            departDate: row.departDate,
            departTime: row.departTime,
            arriveDate: row.arriveDate,
            arriveTime: row.arriveTime,
            mode: row.mode,
            budgetLine: row.budgetLineId,
            bookingReference: row.bookingReference,
            informationState: row.informationState,
            source: row.sourceId,
            notes: row.notes,
            flightOption: row.flightOptionId,
          }
        : null;
    }
    case "update_flight_option": {
      const row = rows.flightOptions.find((o) => o.id === targetId);
      return row
        ? {
            label: row.label,
            fare: row.fare,
            bagFee: row.bagFee,
            mandatoryFees: row.mandatoryFees,
            currency: row.currency,
            informationState: row.informationState,
            source: row.sourceId,
            observedOn: row.observedOn,
            baggage: row.baggage,
            separateTickets: row.separateTickets,
            refundability: row.refundability,
            competitionRelated: row.competitionRelated,
            status: row.status,
            bookingReference: row.bookingReference,
            notes: row.notes,
          }
        : null;
    }
    case "update_location": {
      const row = rows.locations.find((l) => l.id === targetId);
      return row ? { name: row.name, timezone: row.timezone, notes: row.notes } : null;
    }
  }
}

/** Fields whose "from" no longer matches the row -- what makes an update stale. */
export function staleFields(
  changes: Record<string, FieldChange>,
  current: Record<string, unknown>,
): { field: string; expected: unknown; now: unknown }[] {
  return Object.entries(changes)
    .filter(([field, change]) => (current[field] ?? null) !== change.from)
    .map(([field, change]) => ({ field, expected: change.from, now: current[field] ?? null }));
}

// Resolves a reference to the id it means right now: an {"id"} is
// itself, an {"item": n} is whatever that item's approval created --
// null until it has been approved.
export type ResolveReference = (reference: Reference) => string | null;

export type FormCheck = { ok: true } | { ok: false; message: string };

function absent<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

function result(parsed: z.ZodSafeParseResult<unknown>): FormCheck {
  return parsed.success ? { ok: true } : { ok: false, message: parsed.error.issues[0]?.message ?? "That doesn't look right." };
}

/**
 * Runs a proposal through the exact Zod schema its matching form uses
 * (createBudgetLineInput, updatePaymentDetailsInput, ...), with every
 * reference resolved and, for an update, the changes applied on top of
 * the row's current values -- so a proposal that breaks a rule fails
 * with the same plain message the form would show. The database checks
 * everything again when the write actually runs.
 */
export function checkAgainstForm(
  item: { op: ProposalOp; targetId: string | null; payload: unknown; reason: string },
  context: { tripId: string; resolve: ResolveReference; rows: CurrentRows },
): FormCheck {
  const payload = readPayload(item.op, item.payload);
  if (!payload) return { ok: false, message: "This proposal's contents can't be read." };

  const ref = (value: unknown) =>
    value === null || value === undefined ? undefined : (context.resolve(value as Reference) ?? undefined);

  if (isUpdateOp(item.op)) {
    const current = item.targetId ? currentFields(item.op, item.targetId, context.rows) : null;
    if (!current) return { ok: false, message: "The row this proposal updates no longer exists." };

    const refFields = REFERENCE_FIELDS[item.op];
    const merged: Record<string, unknown> = { ...current };
    for (const [field, change] of Object.entries((payload as { changes: Record<string, FieldChange> }).changes)) {
      merged[field] = field in refFields ? (ref(change.to) ?? null) : change.to;
    }
    return checkUpdate(item.op, item.targetId!, merged, item.reason);
  }

  const data = (payload as { data: Record<string, unknown> }).data;
  return checkCreate(item.op as CreateOp, data, context.tripId, ref);
}

function checkCreate(
  op: CreateOp,
  data: Record<string, unknown>,
  tripId: string,
  ref: (value: unknown) => string | undefined,
): FormCheck {
  switch (op) {
    case "create_source":
      return result(createSourceInput.safeParse(data as CreateData<"create_source">));
    case "create_competition": {
      const { datesSource, ...rest } = data as CreateData<"create_competition">;
      return result(createCompetitionInput.safeParse({ ...rest, tripId, datesSourceId: ref(datesSource) }));
    }
    case "create_scenario": {
      const { competition, ...rest } = data as CreateData<"create_scenario">;
      return result(createScenarioInput.safeParse({ ...rest, tripId, competitionId: ref(competition) }));
    }
    case "create_budget_line": {
      const { scenario, source, ...rest } = data as CreateData<"create_budget_line">;
      return result(
        createBudgetLineInput.safeParse({ ...rest, tripId, scenarioId: ref(scenario), sourceId: ref(source) }),
      );
    }
    case "create_payment": {
      const { scenario, budgetLine, ...rest } = data as CreateData<"create_payment">;
      return result(
        createPaymentInput.safeParse({ ...rest, tripId, scenarioId: ref(scenario), budgetLineId: ref(budgetLine) }),
      );
    }
    case "create_fx_rate": {
      const { source, ...rest } = data as CreateData<"create_fx_rate">;
      return result(createFxRateInput.safeParse({ ...rest, sourceId: ref(source) }));
    }
    case "create_stay": {
      const { scenario, location, budgetLine, source, ...rest } = data as CreateData<"create_stay">;
      return result(
        createStayInput.safeParse({
          ...rest,
          scenarioId: ref(scenario),
          locationId: ref(location),
          budgetLineId: ref(budgetLine),
          sourceId: ref(source),
        }),
      );
    }
    case "create_movement": {
      const { scenario, fromLocation, toLocation, budgetLine, source, ...rest } =
        data as CreateData<"create_movement">;
      return result(
        createMovementInput.safeParse({
          ...rest,
          scenarioId: ref(scenario),
          fromLocationId: ref(fromLocation),
          toLocationId: ref(toLocation),
          budgetLineId: ref(budgetLine),
          sourceId: ref(source),
        }),
      );
    }
    case "create_flight_option": {
      const { scenario, source, ...rest } = data as CreateData<"create_flight_option">;
      return result(createFlightOptionInput.safeParse({ ...rest, scenarioId: ref(scenario), sourceId: ref(source) }));
    }
    case "create_flight_segment": {
      const { flightOption, ...rest } = data as CreateData<"create_flight_segment">;
      return result(createFlightSegmentInput.safeParse({ ...rest, flightOptionId: ref(flightOption) }));
    }
    case "create_location":
      return result(createLocationInput.safeParse(data as CreateData<"create_location">));
  }
}

function checkUpdate(op: UpdateOp, id: string, merged: Record<string, unknown>, reason: string): FormCheck {
  switch (op) {
    case "update_competition":
      return result(
        updateCompetitionInput.safeParse({
          id,
          name: merged.name,
          city: absent(merged.city),
          country: absent(merged.country),
          venue: absent(merged.venue),
          startDate: absent(merged.startDate),
          endDate: absent(merged.endDate),
          timezone: absent(merged.timezone),
          datesState: merged.datesState,
          datesSourceId: absent(merged.datesSource),
          reason,
        }),
      );
    case "update_scenario":
      return result(
        updateScenarioInput.safeParse({ id, name: merged.name, competitionId: absent(merged.competition), reason }),
      );
    case "update_budget_line":
      return result(
        updateBudgetLineInput.safeParse({
          id,
          category: merged.category,
          description: merged.description,
          amountMin: merged.amountMin,
          amountTarget: merged.amountTarget,
          amountConservative: merged.amountConservative,
          currency: merged.currency,
          informationState: merged.informationState,
          sourceId: absent(merged.source),
          notes: absent(merged.notes),
          confidence: absent(merged.confidence),
          quantity: absent(merged.quantity),
          quantityUnit: absent(merged.quantityUnit),
          reason,
        }),
      );
    case "update_payment":
      return result(
        updatePaymentDetailsInput.safeParse({
          paymentId: id,
          description: merged.description,
          totalAmount: merged.totalAmount,
          currency: merged.currency,
          dueDate: absent(merged.dueDate),
          cancellationDeadline: absent(merged.cancellationDeadline),
          datesState: merged.datesState,
          datesSourceId: absent(merged.datesSource),
          timingType: merged.timingType,
          informationState: merged.informationState,
          sourceId: absent(merged.source),
          refundability: merged.refundability,
          competitionRelated: merged.competitionRelated,
          reason,
        }),
      );
    case "update_fx_rate":
      return result(
        updateFxRateInput.safeParse({
          id,
          currency: merged.currency,
          rateToUsd: merged.rateToUsd,
          rateDate: merged.rateDate,
          rateKind: merged.rateKind,
          informationState: merged.informationState,
          sourceId: merged.source,
          reason,
        }),
      );
    case "update_savings_entry":
      return result(
        updateSavingsEntryInput.safeParse({
          id,
          amount: merged.amount,
          recordedOn: merged.recordedOn,
          note: absent(merged.note),
          reason,
        }),
      );
    case "update_stay":
      return result(
        updateStayInput.safeParse({
          id,
          locationId: merged.location,
          startDate: merged.startDate,
          nights: merged.nights,
          kind: merged.kind,
          budgetLineId: absent(merged.budgetLine),
          informationState: merged.informationState,
          sourceId: absent(merged.source),
          notes: absent(merged.notes),
          flightOptionId: absent(merged.flightOption),
          reason,
        }),
      );
    case "update_movement":
      return result(
        updateMovementInput.safeParse({
          id,
          sequence: merged.sequence,
          fromLocationId: merged.fromLocation,
          toLocationId: merged.toLocation,
          departDate: merged.departDate,
          departTime: absent(merged.departTime),
          arriveDate: merged.arriveDate,
          arriveTime: absent(merged.arriveTime),
          mode: merged.mode,
          budgetLineId: absent(merged.budgetLine),
          bookingReference: absent(merged.bookingReference),
          informationState: merged.informationState,
          sourceId: absent(merged.source),
          notes: absent(merged.notes),
          flightOptionId: absent(merged.flightOption),
          reason,
        }),
      );
    case "update_flight_option":
      return result(
        updateFlightOptionInput.safeParse({
          id,
          label: merged.label,
          fare: merged.fare,
          bagFee: merged.bagFee,
          mandatoryFees: merged.mandatoryFees,
          currency: merged.currency,
          informationState: merged.informationState,
          sourceId: merged.source,
          observedOn: merged.observedOn,
          baggage: merged.baggage,
          separateTickets: merged.separateTickets,
          refundability: merged.refundability,
          competitionRelated: merged.competitionRelated,
          status: merged.status,
          bookingReference: absent(merged.bookingReference),
          notes: absent(merged.notes),
          reason,
        }),
      );
    case "update_location":
      return result(
        updateLocationInput.safeParse({
          id,
          name: merged.name,
          timezone: absent(merged.timezone),
          notes: absent(merged.notes),
          reason,
        }),
      );
  }
}
