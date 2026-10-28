import { z } from "zod";

import type { ProposalOp } from "@/lib/data/types";
import { budgetCategory, quantityUnit } from "@/lib/validation/budget-lines";
import { flightBaggage, flightOptionStatus } from "@/lib/validation/flight-options";
import { airportCode, countryCode, flightDirection, isoInstant } from "@/lib/validation/flight-segments";
import { rateKind } from "@/lib/validation/fx-rates";
import { movementMode } from "@/lib/validation/movements";
import { paymentTiming, refundability } from "@/lib/validation/payments";
import { ianaTimezone } from "@/lib/validation/locations";
import { confidence, currencyCode, httpUrl, id, infoState } from "@/lib/validation/shared";
import { stayKind } from "@/lib/validation/stays";

// The format a research chat pastes in: one JSON document listing
// proposed changes. Everything about it is untrusted -- every object is
// strict (an unknown key, __proto__ included, fails the whole paste),
// every operation is one of the twelve below, and every value is typed
// and bounded. Nothing here ever names a table or a column: the
// operation decides which fixed write runs, in approve_proposal()
// (20261021090000_import_proposals.sql).

export const PROPOSAL_FORMAT = "trip-planner-proposals";
export const PROPOSAL_FORMAT_VERSION = 1;
export const MAX_PROPOSAL_TEXT_BYTES = 200_000;
export const MAX_PROPOSAL_ITEMS = 200;

export const PROPOSAL_OPS = [
  "create_source",
  "create_competition",
  "create_scenario",
  "create_budget_line",
  "create_payment",
  "create_fx_rate",
  "update_competition",
  "update_scenario",
  "update_budget_line",
  "update_payment",
  "update_fx_rate",
  "update_savings_entry",
  "create_stay",
  "create_movement",
  "update_stay",
  "update_movement",
  "create_flight_option",
  "create_flight_segment",
  "update_flight_option",
  "create_location",
  "update_location",
] as const satisfies readonly ProposalOp[];

export type CreateOp = Extract<ProposalOp, `create_${string}`>;
export type UpdateOp = Extract<ProposalOp, `update_${string}`>;

export function isUpdateOp(op: ProposalOp): op is UpdateOp {
  return op.startsWith("update_");
}

// What a reference field points at. An {"item": n} reference must point
// at an approved create of exactly this kind (proposal_ref() checks
// again at approval).
export type ReferenceKind = "source" | "competition" | "scenario" | "budget_line" | "flight_option" | "location";

export const REFERENCE_FIELDS: Record<ProposalOp, Record<string, ReferenceKind>> = {
  create_source: {},
  create_competition: { datesSource: "source" },
  create_scenario: { competition: "competition" },
  create_budget_line: { scenario: "scenario", source: "source" },
  create_payment: { scenario: "scenario", budgetLine: "budget_line" },
  create_fx_rate: { source: "source" },
  update_competition: { datesSource: "source" },
  update_scenario: { competition: "competition" },
  update_budget_line: { source: "source" },
  update_payment: { datesSource: "source", source: "source" },
  update_fx_rate: { source: "source" },
  update_savings_entry: {},
  create_stay: { scenario: "scenario", location: "location", budgetLine: "budget_line", source: "source" },
  create_movement: {
    scenario: "scenario",
    fromLocation: "location",
    toLocation: "location",
    budgetLine: "budget_line",
    source: "source",
  },
  update_stay: {
    location: "location",
    budgetLine: "budget_line",
    source: "source",
    flightOption: "flight_option",
  },
  update_movement: {
    fromLocation: "location",
    toLocation: "location",
    budgetLine: "budget_line",
    source: "source",
    flightOption: "flight_option",
  },
  create_flight_option: { scenario: "scenario", source: "source" },
  create_flight_segment: { flightOption: "flight_option" },
  update_flight_option: { source: "source" },
  create_location: {},
  update_location: {},
};

// Ids are compared as text against what Postgres returns (always lower
// case), so they're normalized on the way in.
const rowId = id.transform((value) => value.toLowerCase());

const refName = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,40}$/, "A ref is 1-40 letters, digits, - or _");

// {"ref": "x"}: an earlier item of the same paste. {"id": "<uuid>"}: a
// row you already have. {"item": n} is the stored form of a ref (its
// position in the batch) -- the paste itself may not use it.
export const reference = z.union([
  z.strictObject({ ref: refName }),
  z.strictObject({ id: rowId }),
  z.strictObject({ item: z.number().int().min(0).max(MAX_PROPOSAL_ITEMS - 1) }),
]);
export type Reference = z.infer<typeof reference>;

const name = z.string().trim().min(1, "Can't be blank").max(200, "Keep it under 200 characters");
const freeText = z.string().trim().max(2000, "Keep it under 2000 characters");
// z.number() already refuses NaN and Infinity (JSON's 1e400 parses to
// Infinity); the upper bound keeps every amount inside numeric(12, 2).
const money = z.number().nonnegative().max(9_999_999_999, "That amount is too large");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  // The regex alone lets 2027-02-31 through; a real date round-trips.
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "That isn't a real date");
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use an HH:MM time");
const reason = z.string().trim().min(1, "Every proposal needs a reason").max(1000, "Keep the reason under 1000 characters");

function change<T extends z.ZodType>(value: T) {
  return z.strictObject({ from: value, to: value });
}

const referenceChange = z.strictObject({ from: rowId.nullable(), to: reference.nullable() });
const requiredReferenceChange = z.strictObject({ from: rowId, to: reference });

function atLeastOneChange(changes: Record<string, unknown>) {
  return Object.keys(changes).length > 0;
}

// What each create operation's "data" may hold: the same fields as the
// matching form, minus the trip (always the batch's own) -- with every
// reference to another row as a Reference instead of a bare id.
export const CREATE_DATA = {
  create_source: z.strictObject({
    provider: name,
    tier: z.number().int().min(1).max(6),
    url: httpUrl.optional(),
    observedOn: isoDate,
    applicablePeriodStart: isoDate.optional(),
    applicablePeriodEnd: isoDate.optional(),
    notes: freeText.optional(),
  }),
  create_competition: z.strictObject({
    name,
    city: name.optional(),
    country: name.optional(),
    venue: name.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    timezone: name.optional(),
    datesState: infoState.optional(),
    datesSource: reference.optional(),
  }),
  create_scenario: z.strictObject({
    name,
    competition: reference.optional(),
    includesExtension: z.boolean().optional(),
    notes: freeText.optional(),
  }),
  create_budget_line: z.strictObject({
    scenario: reference.optional(),
    category: budgetCategory,
    description: name,
    amountMin: money,
    amountTarget: money,
    amountConservative: money,
    currency: currencyCode,
    informationState: infoState,
    source: reference.optional(),
    notes: freeText.optional(),
    confidence: confidence.optional(),
    quantity: z.number().positive().optional(),
    quantityUnit: quantityUnit.optional(),
  }),
  create_payment: z.strictObject({
    scenario: reference.optional(),
    budgetLine: reference.optional(),
    category: budgetCategory.optional(),
    description: name,
    currency: currencyCode,
    totalAmount: money,
    refundability,
    cancellationDeadline: isoDate.optional(),
    timingType: paymentTiming,
    dueDate: isoDate.optional(),
    competitionRelated: z.boolean(),
  }),
  create_fx_rate: z.strictObject({
    currency: currencyCode,
    rateToUsd: z.number().positive().max(1_000_000),
    rateDate: isoDate,
    rateKind,
    informationState: infoState,
    source: reference,
  }),
  create_stay: z.strictObject({
    scenario: reference,
    location: reference,
    startDate: isoDate,
    nights: z.number().int().positive(),
    kind: stayKind,
    budgetLine: reference.optional(),
    informationState: infoState,
    source: reference.optional(),
    notes: freeText.optional(),
  }),
  create_movement: z.strictObject({
    scenario: reference,
    sequence: z.number().int(),
    fromLocation: reference,
    toLocation: reference,
    departDate: isoDate,
    departTime: isoTime.optional(),
    arriveDate: isoDate,
    arriveTime: isoTime.optional(),
    mode: movementMode,
    budgetLine: reference.optional(),
    bookingReference: freeText.optional(),
    informationState: infoState,
    source: reference.optional(),
    notes: freeText.optional(),
  }),
  create_flight_option: z.strictObject({
    scenario: reference,
    label: name,
    fare: money,
    bagFee: money,
    mandatoryFees: money,
    currency: currencyCode,
    informationState: infoState,
    source: reference,
    observedOn: isoDate,
    baggage: flightBaggage,
    separateTickets: z.boolean(),
    refundability,
    competitionRelated: z.boolean(),
    notes: freeText.optional(),
  }),
  create_flight_segment: z.strictObject({
    flightOption: reference,
    direction: flightDirection,
    segmentOrder: z.number().int().positive(),
    fromAirport: airportCode,
    toAirport: airportCode,
    fromCountry: countryCode,
    toCountry: countryCode,
    flightNumber: freeText.optional(),
    departAt: isoInstant,
    arriveAt: isoInstant,
    isTechnicalStop: z.boolean(),
  }),
  create_location: z.strictObject({
    name,
    timezone: ianaTimezone.optional(),
    notes: freeText.optional(),
  }),
} satisfies Record<CreateOp, z.ZodType>;

// What each update operation may change, field by field, as {"from":
// <what the research saw>, "to": <what it proposes>}. "from" is what
// makes a stale proposal detectable: approval refuses if the row no
// longer holds it. Optional fields can be cleared with null.
export const UPDATE_CHANGES = {
  update_competition: z
    .strictObject({
      name: change(name).optional(),
      city: change(name.nullable()).optional(),
      country: change(name.nullable()).optional(),
      venue: change(name.nullable()).optional(),
      startDate: change(isoDate.nullable()).optional(),
      endDate: change(isoDate.nullable()).optional(),
      timezone: change(name.nullable()).optional(),
      datesState: change(infoState).optional(),
      datesSource: referenceChange.optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
  update_scenario: z
    .strictObject({
      name: change(name).optional(),
      competition: referenceChange.optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
  update_budget_line: z
    .strictObject({
      category: change(budgetCategory).optional(),
      description: change(name).optional(),
      amountMin: change(money).optional(),
      amountTarget: change(money).optional(),
      amountConservative: change(money).optional(),
      currency: change(currencyCode).optional(),
      informationState: change(infoState).optional(),
      source: referenceChange.optional(),
      notes: change(freeText.nullable()).optional(),
      confidence: change(confidence.nullable()).optional(),
      quantity: change(z.number().positive().nullable()).optional(),
      quantityUnit: change(quantityUnit.nullable()).optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
  update_payment: z
    .strictObject({
      description: change(name).optional(),
      totalAmount: change(money).optional(),
      currency: change(currencyCode).optional(),
      dueDate: change(isoDate.nullable()).optional(),
      cancellationDeadline: change(isoDate.nullable()).optional(),
      datesState: change(infoState).optional(),
      datesSource: referenceChange.optional(),
      timingType: change(paymentTiming).optional(),
      informationState: change(infoState).optional(),
      source: referenceChange.optional(),
      refundability: change(refundability).optional(),
      competitionRelated: change(z.boolean()).optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
  update_fx_rate: z
    .strictObject({
      currency: change(currencyCode).optional(),
      rateToUsd: change(z.number().positive().max(1_000_000)).optional(),
      rateDate: change(isoDate).optional(),
      rateKind: change(rateKind).optional(),
      informationState: change(infoState).optional(),
      source: requiredReferenceChange.optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
  update_savings_entry: z
    .strictObject({
      amount: change(money.positive()).optional(),
      recordedOn: change(isoDate).optional(),
      note: change(freeText.nullable()).optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
  update_stay: z
    .strictObject({
      location: referenceChange.optional(),
      startDate: change(isoDate).optional(),
      nights: change(z.number().int().positive()).optional(),
      kind: change(stayKind).optional(),
      budgetLine: referenceChange.optional(),
      informationState: change(infoState).optional(),
      source: referenceChange.optional(),
      notes: change(freeText.nullable()).optional(),
      flightOption: referenceChange.optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
  update_movement: z
    .strictObject({
      sequence: change(z.number().int()).optional(),
      fromLocation: referenceChange.optional(),
      toLocation: referenceChange.optional(),
      departDate: change(isoDate).optional(),
      departTime: change(isoTime.nullable()).optional(),
      arriveDate: change(isoDate).optional(),
      arriveTime: change(isoTime.nullable()).optional(),
      mode: change(movementMode).optional(),
      budgetLine: referenceChange.optional(),
      bookingReference: change(freeText.nullable()).optional(),
      informationState: change(infoState).optional(),
      source: referenceChange.optional(),
      notes: change(freeText.nullable()).optional(),
      flightOption: referenceChange.optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
  update_flight_option: z
    .strictObject({
      label: change(name).optional(),
      fare: change(money).optional(),
      bagFee: change(money).optional(),
      mandatoryFees: change(money).optional(),
      currency: change(currencyCode).optional(),
      informationState: change(infoState).optional(),
      source: requiredReferenceChange.optional(),
      observedOn: change(isoDate).optional(),
      baggage: change(flightBaggage).optional(),
      separateTickets: change(z.boolean()).optional(),
      refundability: change(refundability).optional(),
      competitionRelated: change(z.boolean()).optional(),
      status: change(flightOptionStatus).optional(),
      bookingReference: change(freeText.nullable()).optional(),
      notes: change(freeText.nullable()).optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
  update_location: z
    .strictObject({
      name: change(name).optional(),
      timezone: change(ianaTimezone.nullable()).optional(),
      notes: change(freeText.nullable()).optional(),
    })
    .refine(atLeastOneChange, "An update needs at least one change"),
} satisfies Record<UpdateOp, z.ZodType>;

export type CreateData<Op extends CreateOp> = z.infer<(typeof CREATE_DATA)[Op]>;
export type UpdateChanges<Op extends UpdateOp> = z.infer<(typeof UPDATE_CHANGES)[Op]>;
export type FieldChange = { from: unknown; to: unknown };

function createItem<Op extends CreateOp>(op: Op) {
  return z.strictObject({ op: z.literal(op), ref: refName.optional(), reason, data: CREATE_DATA[op] });
}

function updateItem<Op extends UpdateOp>(op: Op) {
  return z.strictObject({ op: z.literal(op), target: rowId, reason, changes: UPDATE_CHANGES[op] });
}

export const pastedItem = z.discriminatedUnion("op", [
  createItem("create_source"),
  createItem("create_competition"),
  createItem("create_scenario"),
  createItem("create_budget_line"),
  createItem("create_payment"),
  createItem("create_fx_rate"),
  updateItem("update_competition"),
  updateItem("update_scenario"),
  updateItem("update_budget_line"),
  updateItem("update_payment"),
  updateItem("update_fx_rate"),
  updateItem("update_savings_entry"),
  createItem("create_stay"),
  createItem("create_movement"),
  updateItem("update_stay"),
  updateItem("update_movement"),
  createItem("create_flight_option"),
  createItem("create_flight_segment"),
  updateItem("update_flight_option"),
  createItem("create_location"),
  updateItem("update_location"),
]);
export type PastedItem = z.infer<typeof pastedItem>;

export const pastedBatch = z.strictObject({
  format: z.literal(PROPOSAL_FORMAT, `"format" must be "${PROPOSAL_FORMAT}"`),
  version: z.literal(PROPOSAL_FORMAT_VERSION, `"version" must be ${PROPOSAL_FORMAT_VERSION}`),
  note: z.string().trim().max(500, "Keep the note under 500 characters").optional(),
  items: z
    .array(pastedItem)
    .min(1, "A paste needs at least one item")
    .max(MAX_PROPOSAL_ITEMS, `A paste can hold at most ${MAX_PROPOSAL_ITEMS} items`),
});
export type PastedBatch = z.infer<typeof pastedBatch>;

// The stored payload (proposal_items.payload) for one operation: the
// same field schemas, wrapped the way approve_proposal() reads them.
// Re-read through this on the way out, because a row in the table is
// only as trustworthy as whatever wrote it.
export function storedPayloadSchema(op: ProposalOp) {
  return isUpdateOp(op)
    ? z.strictObject({ changes: UPDATE_CHANGES[op] })
    : z.strictObject({ data: CREATE_DATA[op as CreateOp] });
}
