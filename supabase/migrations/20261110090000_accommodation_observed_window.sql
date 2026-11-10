-- An accommodation figure must be backed by the nights it funds: a
-- price observed for one window (check-in date + nights) must agree
-- with the stay it's meant to cover, or it's refused outright, not
-- just flagged. observed_start_date is nullable -- a dateless guide
-- price (e.g. the Llangollen listings) is still legitimate; it just
-- carries no evidence for any specific night. Table is empty in
-- production, so this adds no backfill risk.
alter table accommodation_options add column observed_start_date date;

-- Mirrors checkObservationCoversStay (src/lib/domain/check-observation-covers-stay.ts)
-- exactly, same relationship as trips_return_after_departure has to its
-- Zod twin. Compares month-and-day only, never the year: A-009
-- deliberately carries a whole year's observations as next year's
-- placeholders, and that sanctioned shift must never be flagged -- only
-- a genuine day/month slip (the actual defect) does. Modeled on
-- trg_locations_validate_timezone_fn (20261029090000_locations.sql):
-- before insert or update, security invoker, raises to refuse the
-- write, returns new.
create function trg_accommodation_options_validate_observation_fn()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stay stays;
begin
  if new.observed_start_date is null then
    return new;
  end if;

  select * into v_stay from stays where id = new.stay_id;

  if new.nights <> v_stay.nights then
    raise exception
      'This rate was observed for % night(s), but the stay is % night(s) -- an accommodation figure must be backed by the nights it funds.',
      new.nights, v_stay.nights;
  end if;

  if extract(month from new.observed_start_date) <> extract(month from v_stay.start_date)
     or extract(day from new.observed_start_date) <> extract(day from v_stay.start_date) then
    raise exception
      'This rate was observed for % to %, but the stay runs % to % -- an accommodation figure must be backed by the nights it funds.',
      new.observed_start_date, new.observed_start_date + new.nights,
      v_stay.start_date, v_stay.start_date + v_stay.nights;
  end if;

  return new;
end;
$$;

create trigger trg_accommodation_options_validate_observation
before insert or update on accommodation_options
for each row execute function trg_accommodation_options_validate_observation_fn();

-- update_accommodation_option gains p_observed_start_date -- a new
-- signature, so drop the old one and recreate rather than
-- create or replace.
drop function update_accommodation_option(
  uuid, text, text, text, numeric, accommodation_rate_unit, integer, numeric, text,
  accommodation_option_status, refundability, date, text, boolean, numeric, boolean,
  uuid, date, info_state, text, text
);

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
  p_observed_start_date date,
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
      observed_start_date = p_observed_start_date,
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
  uuid, date, date, info_state, text, text
) from public, anon;
grant execute on function update_accommodation_option(
  uuid, text, text, text, numeric, accommodation_rate_unit, integer, numeric, text,
  accommodation_option_status, refundability, date, text, boolean, numeric, boolean,
  uuid, date, date, info_state, text, text
) to authenticated;
