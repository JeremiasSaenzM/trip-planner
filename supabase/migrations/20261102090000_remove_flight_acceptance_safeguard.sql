-- Removing the acceptance safeguard (hard constraint 3) from flight
-- options. It was never actually the traveler's rule: a system audit
-- introduced it (CHG-019, 2026-10-07) and it was later misrecorded as
-- the traveler's own decision (D-022, "Traveler, 2026-10-20") -- the
-- premise was never mine, the 2028 Europe trip happens whether or not
-- the choir competes. Phase 6.6 (accommodation_options) already built
-- without this field; this migration removes its still-standing
-- counterpart from flight_options/decisions. Payments' own copy of the
-- same machinery (the real enforcement, via a trigger) is removed by
-- the next migration.
--
-- stays.flight_option_id / movements.flight_option_id are untouched --
-- that's the route-causation link (Total Itinerary Cost), unrelated to
-- this safeguard.
alter table decisions drop constraint decisions_flight_risk_needs_rationale;
alter table decisions drop column flight_option_id;
alter table flight_options drop column competition_related;

-- update_flight_option is a full-row replace; dropping a parameter
-- changes the function's identity, so it has to be dropped and
-- recreated, not just CREATE OR REPLACE'd (same reasoning as every
-- other signature change in this project).
drop function update_flight_option(
  uuid, text, numeric, numeric, numeric, text, info_state, uuid, date,
  flight_baggage, boolean, refundability, boolean, flight_option_status, text, text, text
);

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
  flight_baggage, boolean, refundability, flight_option_status, text, text, text
) from public, anon;
grant execute on function update_flight_option(
  uuid, text, numeric, numeric, numeric, text, info_state, uuid, date,
  flight_baggage, boolean, refundability, flight_option_status, text, text, text
) to authenticated;
