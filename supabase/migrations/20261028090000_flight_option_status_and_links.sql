-- Phase 6.5: flights. Schema additions only -- the checks themselves are
-- pure functions in src/lib/domain/, run against this data, not encoded
-- here.
--
-- arrival_at duplicated the last outbound segment's arrive_at with
-- nothing checking they agreed -- dropped. "When does this option land"
-- is derived from flight_segments (resolveFlightOptionTiming.ts), the
-- same way checkUsCanadaStop already treats segments as the only
-- source of truth for a stop, never a separate summary column.
alter table flight_options drop column arrival_at;

-- candidate -> selected/rejected/booked. A scenario may have many
-- candidates; the partial unique index below keeps at most one
-- selected-or-booked, in the database rather than a form, same
-- reasoning as every other invariant that actually matters.
create type flight_option_status as enum ('candidate', 'selected', 'rejected', 'booked');

alter table flight_options add column label text;
alter table flight_options add column status flight_option_status not null default 'candidate';
alter table flight_options add column booking_reference text;
-- Mirrors payments' own refundability/competition_related exactly --
-- hard constraint 3 (no non-refundable competition-related commitment
-- before acceptance, unless the risk is explicitly accepted) applies to
-- a booked flight the same way it applies to a payment; check 4
-- (src/lib/domain/check-acceptance-safeguard.ts) reads these two.
alter table flight_options add column refundability refundability not null default 'unknown';
alter table flight_options add column competition_related boolean not null default true;

-- An option you can't name is one you can't discuss (phase spec) --
-- not null, but added after the table so a currently-empty table never
-- has to backfill one. Table has zero rows in production today; this
-- would fail loudly rather than silently if that ever stops being true.
alter table flight_options alter column label set not null;

create unique index flight_options_one_selected_or_booked_per_scenario
  on flight_options (scenario_id)
  where status in ('selected', 'booked');

-- A movement with mode 'plane' can point at the ticket it belongs to
-- (the itinerary entry and the purchase stop restating each other); a
-- movement or stay of any other kind can point at the same option to
-- mean "this exists because of that flight" -- the Paris arrival night
-- the spec gives as the obvious case. One column, two readings by
-- context; no separate boolean, so route-causation is never inferred,
-- only ever explicitly linked (Total Itinerary Cost,
-- calculate-total-itinerary-cost.ts, sums exactly these links, nothing
-- else). Deleting the option severs the link rather than taking the
-- movement/stay down with it -- the itinerary fact survives losing the
-- ticket that explains it.
alter table movements add column flight_option_id uuid references flight_options (id) on delete set null;
alter table stays add column flight_option_id uuid references flight_options (id) on delete set null;

-- Check 4's "explicit risk acceptance" names the specific ticket, not a
-- general state of the competition -- mirrors decisions.payment_id
-- exactly (20261015090000), including the on-delete behaviour: the
-- decision survives losing the option it was about, same reasoning as
-- delete_scenario_cascade already applies to payment_id. Unlike
-- payments, there is no trigger enforcing this at booking time (the
-- cascade-delete work already decided booked only ever records what
-- happened and must never be blocked) -- this column exists purely so
-- check 4 can tell "accepted" apart from "not yet", not to gate a write.
alter table decisions add column flight_option_id uuid references flight_options (id) on delete set null;
alter table decisions
  add constraint decisions_flight_risk_needs_rationale
    check (flight_option_id is null or rationale is not null);

-- update_stay/update_movement are a full-row replace (every column but
-- id and the audit fields); adding flight_option_id to that replace
-- means the function's signature changes, so -- same as
-- update_budget_line across 20261016090000 and 20261025090000 -- it has
-- to be dropped and recreated, not just CREATE OR REPLACE'd.
drop function update_stay(uuid, text, date, integer, stay_kind, uuid, info_state, uuid, text, text);

create function update_stay(
  p_id uuid,
  p_location text,
  p_start_date date,
  p_nights integer,
  p_kind stay_kind,
  p_budget_line_id uuid,
  p_information_state info_state,
  p_source_id uuid,
  p_notes text,
  p_flight_option_id uuid,
  p_reason text
)
returns stays
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row stays;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update stays
  set location = p_location,
      start_date = p_start_date,
      nights = p_nights,
      kind = p_kind,
      budget_line_id = p_budget_line_id,
      information_state = p_information_state,
      source_id = p_source_id,
      notes = p_notes,
      flight_option_id = p_flight_option_id
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Stay % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_stay(
  uuid, text, date, integer, stay_kind, uuid, info_state, uuid, text, uuid, text
) from public, anon;
grant execute on function update_stay(
  uuid, text, date, integer, stay_kind, uuid, info_state, uuid, text, uuid, text
) to authenticated;

drop function update_movement(
  uuid, integer, text, text, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, text
);

create function update_movement(
  p_id uuid,
  p_sequence integer,
  p_from_location text,
  p_to_location text,
  p_depart_date date,
  p_depart_time time,
  p_arrive_date date,
  p_arrive_time time,
  p_mode movement_mode,
  p_budget_line_id uuid,
  p_booking_reference text,
  p_information_state info_state,
  p_source_id uuid,
  p_notes text,
  p_flight_option_id uuid,
  p_reason text
)
returns movements
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row movements;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update movements
  set sequence = p_sequence,
      from_location = p_from_location,
      to_location = p_to_location,
      depart_date = p_depart_date,
      depart_time = p_depart_time,
      arrive_date = p_arrive_date,
      arrive_time = p_arrive_time,
      mode = p_mode,
      budget_line_id = p_budget_line_id,
      booking_reference = p_booking_reference,
      information_state = p_information_state,
      source_id = p_source_id,
      notes = p_notes,
      flight_option_id = p_flight_option_id
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Movement % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_movement(
  uuid, integer, text, text, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, uuid, text
) from public, anon;
grant execute on function update_movement(
  uuid, integer, text, text, date, time, date, time, movement_mode, uuid, text, info_state, uuid, text, uuid, text
) to authenticated;

-- update_flight_option is a full-row replace, same shape as
-- update_movement. Creating an option or a segment stays a plain insert
-- from the app (same reasoning as create_stay/create_budget_line) --
-- scenario_id is fixed at creation, not editable here, matching
-- update_stay/update_movement.
create function update_flight_option(
  p_id uuid,
  p_label text,
  p_fare numeric,
  p_bag_fee numeric,
  p_mandatory_fees numeric,
  p_currency text,
  p_information_state info_state,
  p_source_id uuid,
  p_observed_on date,
  p_baggage flight_baggage,
  p_separate_tickets boolean,
  p_refundability refundability,
  p_competition_related boolean,
  p_status flight_option_status,
  p_booking_reference text,
  p_notes text,
  p_reason text
)
returns flight_options
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row flight_options;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update flight_options
  set label = p_label,
      fare = p_fare,
      bag_fee = p_bag_fee,
      mandatory_fees = p_mandatory_fees,
      currency = p_currency,
      information_state = p_information_state,
      source_id = p_source_id,
      observed_on = p_observed_on,
      baggage = p_baggage,
      separate_tickets = p_separate_tickets,
      refundability = p_refundability,
      competition_related = p_competition_related,
      status = p_status,
      booking_reference = p_booking_reference,
      notes = p_notes
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Flight option % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_flight_option(
  uuid, text, numeric, numeric, numeric, text, info_state, uuid, date,
  flight_baggage, boolean, refundability, boolean, flight_option_status, text, text, text
) from public, anon;
grant execute on function update_flight_option(
  uuid, text, numeric, numeric, numeric, text, info_state, uuid, date,
  flight_baggage, boolean, refundability, boolean, flight_option_status, text, text, text
) to authenticated;

-- Nothing references a flight_option except through flight_segments
-- (on delete cascade already, from the original migration), movements/
-- stays (on delete set null, above) and decisions (on delete set null,
-- above) -- so, unlike delete_budget_line, there is nothing left to
-- guard: every reference already survives or cascades on its own.
create function delete_flight_option(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_deleted_id uuid;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  delete from flight_options where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Flight option % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_flight_option(uuid, text) from public, anon;
grant execute on function delete_flight_option(uuid, text) to authenticated;

-- A segment is small enough that a mistake gets deleted and re-added,
-- not edited -- no update_flight_segment, matching the import-proposals
-- side (create_flight_segment only, no update).
create function delete_flight_segment(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_deleted_id uuid;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  delete from flight_segments where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Flight segment % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_flight_segment(uuid, text) from public, anon;
grant execute on function delete_flight_segment(uuid, text) to authenticated;

-- Proposal ops for flights (import-proposals support). Added here, on
-- their own, so the next migration's approve_proposal/create_proposal_batch
-- additions run in a later transaction -- a brand new enum value can't
-- be used in the same transaction that adds it (same reasoning as
-- 20261024090000/20261024090100 splitting the stays/movements ops).
alter type proposal_op add value 'create_flight_option';
alter type proposal_op add value 'create_flight_segment';
alter type proposal_op add value 'update_flight_option';
