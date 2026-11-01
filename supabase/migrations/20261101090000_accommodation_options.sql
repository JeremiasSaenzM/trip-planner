-- Phase 6.6: accommodation. Four stays carry nights, dates and a budget
-- line, but none of them records where the price came from -- Hotel du
-- Brabant, Au Royal Mad, the Llangollen B&Bs all live in prose, not as
-- data the app can check or age. This gives lodging the same treatment
-- Phase 6.5 gave flights: candidates, checks, an Effective Cost.
--
-- No acceptance safeguard here (and none planned for flights going
-- forward): hard constraint 3 / D-022 was a misattributed decision, not
-- a real condition on this trip's spending, so this table carries no
-- competition_related column and no decisions link. refundability and
-- cancellation_deadline are still recorded and shown -- plain facts,
-- not tied to acceptance.
--
-- stay_id (not null), not scenario_id + a stay reference: an option is
-- a candidate for one specific stay, never a resource several stays
-- share (contrast flight_options, scenario-scoped because one flight
-- option can explain several downstream rows). A scenario_id column
-- alongside stay_id would say the same thing twice -- it's always one
-- join away via stays.scenario_id.
create type accommodation_option_status as enum ('candidate', 'selected', 'rejected', 'booked');

-- Per night or per stay -- the distinction matters and must not be
-- inferred from arithmetic.
create type accommodation_rate_unit as enum ('per_night', 'per_stay');

create table accommodation_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  stay_id uuid not null references stays (id) on delete cascade,
  label text not null,
  property_name text not null,
  address text,
  rate_amount numeric(12, 2) not null,
  rate_unit accommodation_rate_unit not null,
  nights integer not null,
  mandatory_fees numeric(12, 2) not null default 0,
  currency text not null,
  status accommodation_option_status not null default 'candidate',
  refundability refundability not null default 'unknown',
  cancellation_deadline date,
  booking_reference text,
  -- True when the quoted price depends on something that isn't a
  -- property of the room -- a loyalty discount, a mobile-only rate, a
  -- non-refundable prepayment. undiscounted_amount is what drives a
  -- conservative-basis decision by hand (Au Royal Mad: USD 836
  -- conditional vs USD 1,131 undiscounted).
  conditional_rate boolean not null default false,
  undiscounted_amount numeric(12, 2),
  -- Hostels aren't eligible during the festival (planning system 01
  -- §3) -- a plain boolean is all that rule needs, not a lodging
  -- taxonomy. Always knowable at entry time, unlike timezone or
  -- refundability, so no "unknown" state either.
  is_hostel boolean not null default false,
  -- Unconditional, same reasoning flight_options already documents:
  -- "never invent a source" isn't conditional on information_state.
  source_id uuid not null references sources (id),
  observed_on date not null,
  information_state info_state not null default 'estimate',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accommodation_options_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint accommodation_options_nights_positive check (nights > 0),
  constraint accommodation_options_conditional_needs_undiscounted
    check (not conditional_rate or undiscounted_amount is not null)
);

-- A stay may have many candidates and at most one selected or booked.
create unique index accommodation_options_one_selected_or_booked_per_stay
  on accommodation_options (stay_id)
  where status in ('selected', 'booked');

create trigger trg_accommodation_options_set_updated_at
before update on accommodation_options
for each row execute function trigger_set_updated_at();

alter table accommodation_options enable row level security;

create policy "owner_all" on accommodation_options
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

revoke all on table accommodation_options from anon, authenticated, service_role;
grant select, insert, update, delete on table accommodation_options to authenticated, service_role;

create trigger trg_accommodation_options_audit after insert or update or delete on accommodation_options
  for each row execute function change_log_capture();

-- Creating a candidate stays a plain insert from the app (create_stay/
-- create_flight_option's own reasoning: scenario_id/stay_id is fixed at
-- creation, not editable here).
create function update_accommodation_option(
  p_id uuid,
  p_label text,
  p_property_name text,
  p_address text,
  p_rate_amount numeric,
  p_rate_unit accommodation_rate_unit,
  p_nights integer,
  p_mandatory_fees numeric,
  p_currency text,
  p_status accommodation_option_status,
  p_refundability refundability,
  p_cancellation_deadline date,
  p_booking_reference text,
  p_conditional_rate boolean,
  p_undiscounted_amount numeric,
  p_is_hostel boolean,
  p_source_id uuid,
  p_observed_on date,
  p_information_state info_state,
  p_notes text,
  p_reason text
)
returns accommodation_options
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row accommodation_options;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update accommodation_options
  set label = p_label,
      property_name = p_property_name,
      address = p_address,
      rate_amount = p_rate_amount,
      rate_unit = p_rate_unit,
      nights = p_nights,
      mandatory_fees = p_mandatory_fees,
      currency = p_currency,
      status = p_status,
      refundability = p_refundability,
      cancellation_deadline = p_cancellation_deadline,
      booking_reference = p_booking_reference,
      conditional_rate = p_conditional_rate,
      undiscounted_amount = p_undiscounted_amount,
      is_hostel = p_is_hostel,
      source_id = p_source_id,
      observed_on = p_observed_on,
      information_state = p_information_state,
      notes = p_notes
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Accommodation option % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_accommodation_option(
  uuid, text, text, text, numeric, accommodation_rate_unit, integer, numeric, text,
  accommodation_option_status, refundability, date, text, boolean, numeric, boolean,
  uuid, date, info_state, text, text
) from public, anon;
grant execute on function update_accommodation_option(
  uuid, text, text, text, numeric, accommodation_rate_unit, integer, numeric, text,
  accommodation_option_status, refundability, date, text, boolean, numeric, boolean,
  uuid, date, info_state, text, text
) to authenticated;

-- No reference guard needed, unlike delete_location: cascading away a
-- dead stay's own candidates is correct (the same way flight_segments
-- cascade off a deleted flight_option), and nothing else references an
-- accommodation_option.
create function delete_accommodation_option(p_id uuid, p_reason text)
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

  delete from accommodation_options where id = p_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Accommodation option % not found (or not yours)', p_id;
  end if;
end;
$$;

revoke execute on function delete_accommodation_option(uuid, text) from public, anon;
grant execute on function delete_accommodation_option(uuid, text) to authenticated;

-- New proposal ops, added here on their own: a newly-added enum value
-- can't be referenced in the same transaction that adds it (same split
-- used for create_flight_option et al. and create_location/
-- update_location). No delete op -- update_accommodation_option with
-- status: 'rejected' already says "this candidate is out" the way
-- update_flight_option does, with the benefit of keeping the record
-- instead of losing it; a first-ever delete-shaped proposal op isn't
-- worth building for what status already covers.
alter type proposal_op add value 'create_accommodation_option';
alter type proposal_op add value 'update_accommodation_option';
