-- Restates approve_proposal() (CREATE OR REPLACE always redefines the
-- whole body) from the most recent version, 20261102100100, adding the
-- scenario travel window to create_scenario's insert and to
-- update_scenario's current-state/merge/call, matching 20261103090000's
-- new, longer signature. proposal_ref and create_proposal_batch need no
-- changes (neither references the new columns), but are restated too,
-- same convention as every prior proposal-ops migration.
create or replace function proposal_ref(p_batch_id uuid, p_trip_id uuid, p_ref jsonb, p_kind text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_found boolean;
begin
  if p_ref is null or jsonb_typeof(p_ref) = 'null' then
    return null;
  end if;

  if p_ref ? 'item' then
    select result_id into v_id
    from proposal_items
    where batch_id = p_batch_id
      and position = (p_ref ->> 'item')::integer
      and op = ('create_' || p_kind)::proposal_op
      and status = 'approved';
    if v_id is null then
      raise exception 'Proposal depends on item % of this batch, which isn''t an approved %.',
        (p_ref ->> 'item')::integer + 1, replace(p_kind, '_', ' ');
    end if;
  elsif p_ref ? 'id' then
    v_id := (p_ref ->> 'id')::uuid;
  else
    raise exception 'Malformed reference in proposal: %', p_ref;
  end if;

  v_found := case p_kind
    when 'source' then exists (select 1 from sources where id = v_id)
    when 'competition' then exists (select 1 from competitions where id = v_id and trip_id = p_trip_id)
    when 'scenario' then exists (select 1 from scenarios where id = v_id and trip_id = p_trip_id)
    when 'budget_line' then exists (select 1 from budget_lines where id = v_id and trip_id = p_trip_id)
    when 'flight_option' then
      exists (
        select 1 from flight_options fo join scenarios sc on sc.id = fo.scenario_id
        where fo.id = v_id and sc.trip_id = p_trip_id
      )
    when 'location' then exists (select 1 from locations where id = v_id)
    when 'stay' then
      exists (
        select 1 from stays s join scenarios sc on sc.id = s.scenario_id
        where s.id = v_id and sc.trip_id = p_trip_id
      )
    else false
  end;
  if not v_found then
    raise exception '% % not found (or not yours)', initcap(replace(p_kind, '_', ' ')), v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function proposal_ref(uuid, uuid, jsonb, text) from public, anon;
grant execute on function proposal_ref(uuid, uuid, jsonb, text) to authenticated;

create or replace function create_proposal_batch(
  p_trip_id uuid,
  p_note text,
  p_raw_text text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_item jsonb;
  v_index bigint;
  v_op proposal_op;
  v_target uuid;
  v_depends integer[];
  v_found boolean;
begin
  if not exists (select 1 from trips where id = p_trip_id) then
    raise exception 'Trip % not found (or not yours)', p_trip_id;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A proposal batch needs at least one item.';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A proposal batch can hold at most 200 items.';
  end if;

  insert into proposal_batches (trip_id, note, raw_text)
  values (p_trip_id, nullif(trim(coalesce(p_note, '')), ''), p_raw_text)
  returning id into v_batch_id;

  for v_item, v_index in
    select value, ordinality - 1 from jsonb_array_elements(p_items) with ordinality
  loop
    if (v_item ->> 'position')::integer is distinct from v_index::integer then
      raise exception 'Proposal items must be numbered in order (item % says %).', v_index, v_item ->> 'position';
    end if;

    v_op := (v_item ->> 'op')::proposal_op;
    v_target := (v_item ->> 'targetId')::uuid;
    v_depends := coalesce(
      (select array_agg(value::integer) from jsonb_array_elements_text(coalesce(v_item -> 'dependsOn', '[]'::jsonb))),
      '{}'
    );

    if exists (select 1 from unnest(v_depends) d where d < 0 or d >= v_index) then
      raise exception 'Item % can only depend on items before it.', v_index + 1;
    end if;

    if v_op::text like 'update_%' then
      v_found := case v_op
        when 'update_competition' then
          exists (select 1 from competitions where id = v_target and trip_id = p_trip_id)
        when 'update_scenario' then
          exists (select 1 from scenarios where id = v_target and trip_id = p_trip_id)
        when 'update_budget_line' then
          exists (select 1 from budget_lines where id = v_target and trip_id = p_trip_id)
        when 'update_payment' then
          exists (
            select 1 from payments p join budget_lines bl on bl.id = p.budget_line_id
            where p.id = v_target and bl.trip_id = p_trip_id
          )
        when 'update_fx_rate' then
          exists (select 1 from fx_rates where id = v_target)
        when 'update_savings_entry' then
          exists (select 1 from savings_entries where id = v_target and trip_id = p_trip_id)
        when 'update_stay' then
          exists (
            select 1 from stays s join scenarios sc on sc.id = s.scenario_id
            where s.id = v_target and sc.trip_id = p_trip_id
          )
        when 'update_movement' then
          exists (
            select 1 from movements m join scenarios sc on sc.id = m.scenario_id
            where m.id = v_target and sc.trip_id = p_trip_id
          )
        when 'update_flight_option' then
          exists (
            select 1 from flight_options fo join scenarios sc on sc.id = fo.scenario_id
            where fo.id = v_target and sc.trip_id = p_trip_id
          )
        when 'update_location' then
          exists (select 1 from locations where id = v_target)
        when 'update_accommodation_option' then
          exists (
            select 1 from accommodation_options ao
            join stays s on s.id = ao.stay_id
            join scenarios sc on sc.id = s.scenario_id
            where ao.id = v_target and sc.trip_id = p_trip_id
          )
      end;
      if not v_found then
        raise exception 'Item %: the row it updates was not found (or not yours)', v_index + 1;
      end if;
    end if;

    insert into proposal_items (batch_id, position, ref, op, target_id, payload, depends_on, reason)
    values (
      v_batch_id,
      v_index,
      v_item ->> 'ref',
      v_op,
      v_target,
      v_item -> 'payload',
      v_depends,
      v_item ->> 'reason'
    );
  end loop;

  return v_batch_id;
end;
$$;

revoke execute on function create_proposal_batch(uuid, text, text, jsonb) from public, anon;
grant execute on function create_proposal_batch(uuid, text, text, jsonb) to authenticated;

create or replace function approve_proposal(p_item_id uuid)
returns proposal_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item proposal_items;
  v_trip_id uuid;
  v_data jsonb;
  v_current jsonb;
  v_new jsonb;
  v_result uuid;
  v_competition competitions;
  v_scenario scenarios;
  v_line budget_lines;
  v_payment payments;
  v_rate fx_rates;
  v_entry savings_entries;
  v_stay stays;
  v_movement movements;
  v_flight_option flight_options;
  v_location locations;
  v_accommodation_option accommodation_options;
begin
  select * into v_item from proposal_items where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'Proposal % not found (or not yours)', p_item_id;
  end if;
  if v_item.status <> 'pending' then
    raise exception 'Proposal % was already %.', p_item_id, v_item.status;
  end if;

  select trip_id into v_trip_id from proposal_batches where id = v_item.batch_id;
  if v_trip_id is null then
    raise exception 'Proposal batch % not found (or not yours)', v_item.batch_id;
  end if;

  if exists (
    select 1 from proposal_items d
    where d.batch_id = v_item.batch_id and d.position = any (v_item.depends_on) and d.status <> 'approved'
  ) then
    raise exception 'Proposal depends on an item of this batch that isn''t approved yet.';
  end if;

  perform set_config('app.change_reason', v_item.reason, true);
  perform set_config('app.actor', 'claude', true);

  v_data := v_item.payload -> 'data';

  case v_item.op
    when 'create_source' then
      insert into sources (provider, tier, url, observed_on, applicable_period, notes)
      values (
        v_data ->> 'provider',
        (v_data ->> 'tier')::smallint,
        v_data ->> 'url',
        (v_data ->> 'observedOn')::date,
        case
          when v_data ->> 'applicablePeriodStart' is null and v_data ->> 'applicablePeriodEnd' is null then null
          else daterange((v_data ->> 'applicablePeriodStart')::date, (v_data ->> 'applicablePeriodEnd')::date, '[)')
        end,
        v_data ->> 'notes'
      )
      returning id into v_result;

    when 'create_competition' then
      insert into competitions (
        trip_id, name, city, country, venue, start_date, end_date, timezone, dates_state, dates_source_id
      ) values (
        v_trip_id,
        v_data ->> 'name',
        v_data ->> 'city',
        v_data ->> 'country',
        v_data ->> 'venue',
        (v_data ->> 'startDate')::date,
        (v_data ->> 'endDate')::date,
        v_data ->> 'timezone',
        coalesce(v_data ->> 'datesState', 'pending')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'datesSource', 'source')
      )
      returning id into v_result;

    when 'create_scenario' then
      insert into scenarios (
        trip_id, name, competition_id, includes_extension, notes,
        departure_date, return_date, travel_dates_state, travel_dates_source_id
      ) values (
        v_trip_id,
        v_data ->> 'name',
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'competition', 'competition'),
        coalesce((v_data ->> 'includesExtension')::boolean, false),
        v_data ->> 'notes',
        (v_data ->> 'departureDate')::date,
        (v_data ->> 'returnDate')::date,
        coalesce(v_data ->> 'travelDatesState', 'pending')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'travelDatesSource', 'source')
      )
      returning id into v_result;

    when 'create_budget_line' then
      insert into budget_lines (
        trip_id, scenario_id, category, description,
        amount_min, amount_target, amount_conservative, currency,
        information_state, source_id, notes, confidence, quantity, quantity_unit
      ) values (
        v_trip_id,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'scenario', 'scenario'),
        (v_data ->> 'category')::budget_category,
        v_data ->> 'description',
        (v_data ->> 'amountMin')::numeric,
        (v_data ->> 'amountTarget')::numeric,
        (v_data ->> 'amountConservative')::numeric,
        v_data ->> 'currency',
        (v_data ->> 'informationState')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'source', 'source'),
        v_data ->> 'notes',
        (v_data ->> 'confidence')::confidence_level,
        (v_data ->> 'quantity')::numeric,
        (v_data ->> 'quantityUnit')::quantity_unit
      )
      returning id into v_result;

    when 'create_payment' then
      select (create_payment(
        v_trip_id,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'scenario', 'scenario'),
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'budgetLine', 'budget_line'),
        (v_data ->> 'category')::budget_category,
        v_data ->> 'description',
        v_data ->> 'currency',
        (v_data ->> 'totalAmount')::numeric,
        (v_data ->> 'refundability')::refundability,
        (v_data ->> 'cancellationDeadline')::date,
        (v_data ->> 'timingType')::payment_timing,
        (v_data ->> 'dueDate')::date
      )).id into v_result;

    when 'create_fx_rate' then
      insert into fx_rates (currency, rate_to_usd, rate_date, rate_kind, information_state, source_id)
      values (
        v_data ->> 'currency',
        (v_data ->> 'rateToUsd')::numeric,
        (v_data ->> 'rateDate')::date,
        (v_data ->> 'rateKind')::rate_kind,
        (v_data ->> 'informationState')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'source', 'source')
      )
      returning id into v_result;

    when 'create_stay' then
      insert into stays (
        scenario_id, location_id, start_date, nights, kind, budget_line_id, information_state, source_id, notes
      ) values (
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'scenario', 'scenario'),
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'location', 'location'),
        (v_data ->> 'startDate')::date,
        (v_data ->> 'nights')::integer,
        (v_data ->> 'kind')::stay_kind,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'budgetLine', 'budget_line'),
        (v_data ->> 'informationState')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'source', 'source'),
        v_data ->> 'notes'
      )
      returning id into v_result;

    when 'create_movement' then
      insert into movements (
        scenario_id, sequence, from_location_id, to_location_id, depart_date, depart_time,
        arrive_date, arrive_time, mode, budget_line_id, booking_reference, information_state, source_id, notes
      ) values (
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'scenario', 'scenario'),
        (v_data ->> 'sequence')::integer,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'fromLocation', 'location'),
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'toLocation', 'location'),
        (v_data ->> 'departDate')::date,
        (v_data ->> 'departTime')::time,
        (v_data ->> 'arriveDate')::date,
        (v_data ->> 'arriveTime')::time,
        (v_data ->> 'mode')::movement_mode,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'budgetLine', 'budget_line'),
        v_data ->> 'bookingReference',
        (v_data ->> 'informationState')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'source', 'source'),
        v_data ->> 'notes'
      )
      returning id into v_result;

    when 'create_flight_option' then
      insert into flight_options (
        scenario_id, label, fare, bag_fee, mandatory_fees, currency,
        information_state, source_id, observed_on, baggage, separate_tickets,
        refundability, notes
      ) values (
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'scenario', 'scenario'),
        v_data ->> 'label',
        (v_data ->> 'fare')::numeric,
        (v_data ->> 'bagFee')::numeric,
        (v_data ->> 'mandatoryFees')::numeric,
        v_data ->> 'currency',
        (v_data ->> 'informationState')::info_state,
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'source', 'source'),
        (v_data ->> 'observedOn')::date,
        (v_data ->> 'baggage')::flight_baggage,
        (v_data ->> 'separateTickets')::boolean,
        (v_data ->> 'refundability')::refundability,
        v_data ->> 'notes'
      )
      returning id into v_result;

    when 'create_flight_segment' then
      insert into flight_segments (
        flight_option_id, direction, segment_order, from_airport, to_airport,
        from_country, to_country, flight_number, depart_at, arrive_at, is_technical_stop
      ) values (
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'flightOption', 'flight_option'),
        (v_data ->> 'direction')::flight_direction,
        (v_data ->> 'segmentOrder')::integer,
        v_data ->> 'fromAirport',
        v_data ->> 'toAirport',
        v_data ->> 'fromCountry',
        v_data ->> 'toCountry',
        v_data ->> 'flightNumber',
        (v_data ->> 'departAt')::timestamptz,
        (v_data ->> 'arriveAt')::timestamptz,
        (v_data ->> 'isTechnicalStop')::boolean
      )
      returning id into v_result;

    when 'create_location' then
      insert into locations (name, timezone, notes)
      values (v_data ->> 'name', v_data ->> 'timezone', v_data ->> 'notes')
      returning id into v_result;

    when 'create_accommodation_option' then
      insert into accommodation_options (
        stay_id, label, property_name, address, rate_amount, rate_unit, nights,
        mandatory_fees, currency, refundability, cancellation_deadline, booking_reference,
        conditional_rate, undiscounted_amount, is_hostel, source_id, observed_on,
        information_state, notes
      ) values (
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'stay', 'stay'),
        v_data ->> 'label',
        v_data ->> 'propertyName',
        v_data ->> 'address',
        (v_data ->> 'rateAmount')::numeric,
        (v_data ->> 'rateUnit')::accommodation_rate_unit,
        (v_data ->> 'nights')::integer,
        (v_data ->> 'mandatoryFees')::numeric,
        v_data ->> 'currency',
        (v_data ->> 'refundability')::refundability,
        (v_data ->> 'cancellationDeadline')::date,
        v_data ->> 'bookingReference',
        coalesce((v_data ->> 'conditionalRate')::boolean, false),
        (v_data ->> 'undiscountedAmount')::numeric,
        coalesce((v_data ->> 'isHostel')::boolean, false),
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'source', 'source'),
        (v_data ->> 'observedOn')::date,
        (v_data ->> 'informationState')::info_state,
        v_data ->> 'notes'
      )
      returning id into v_result;

    when 'update_competition' then
      select * into v_competition from competitions
      where id = v_item.target_id and trip_id = v_trip_id for update;
      if v_competition.id is null then
        raise exception 'Competition % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'name', v_competition.name,
        'city', v_competition.city,
        'country', v_competition.country,
        'venue', v_competition.venue,
        'startDate', v_competition.start_date,
        'endDate', v_competition.end_date,
        'timezone', v_competition.timezone,
        'datesState', v_competition.dates_state,
        'datesSource', v_competition.dates_source_id
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"datesSource": "source"}');
      perform update_competition(
        v_item.target_id,
        v_new ->> 'name',
        v_new ->> 'city',
        v_new ->> 'country',
        v_new ->> 'venue',
        (v_new ->> 'startDate')::date,
        (v_new ->> 'endDate')::date,
        v_new ->> 'timezone',
        (v_new ->> 'datesState')::info_state,
        (v_new ->> 'datesSource')::uuid,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_scenario' then
      select * into v_scenario from scenarios
      where id = v_item.target_id and trip_id = v_trip_id for update;
      if v_scenario.id is null then
        raise exception 'Scenario % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'name', v_scenario.name,
        'competition', v_scenario.competition_id,
        'departureDate', v_scenario.departure_date,
        'returnDate', v_scenario.return_date,
        'travelDatesState', v_scenario.travel_dates_state,
        'travelDatesSource', v_scenario.travel_dates_source_id
      );
      v_new := proposal_merge_changes(
        v_item, v_trip_id, v_current, '{"competition": "competition", "travelDatesSource": "source"}'
      );
      perform update_scenario(
        v_item.target_id,
        v_new ->> 'name',
        (v_new ->> 'competition')::uuid,
        (v_new ->> 'departureDate')::date,
        (v_new ->> 'returnDate')::date,
        (v_new ->> 'travelDatesState')::info_state,
        (v_new ->> 'travelDatesSource')::uuid,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_budget_line' then
      select * into v_line from budget_lines
      where id = v_item.target_id and trip_id = v_trip_id for update;
      if v_line.id is null then
        raise exception 'Budget line % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'category', v_line.category,
        'description', v_line.description,
        'amountMin', v_line.amount_min,
        'amountTarget', v_line.amount_target,
        'amountConservative', v_line.amount_conservative,
        'currency', v_line.currency,
        'informationState', v_line.information_state,
        'source', v_line.source_id,
        'notes', v_line.notes,
        'confidence', v_line.confidence,
        'quantity', v_line.quantity,
        'quantityUnit', v_line.quantity_unit
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"source": "source"}');
      perform update_budget_line(
        v_item.target_id,
        (v_new ->> 'category')::budget_category,
        v_new ->> 'description',
        (v_new ->> 'amountMin')::numeric,
        (v_new ->> 'amountTarget')::numeric,
        (v_new ->> 'amountConservative')::numeric,
        v_new ->> 'currency',
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        v_new ->> 'notes',
        (v_new ->> 'confidence')::confidence_level,
        (v_new ->> 'quantity')::numeric,
        (v_new ->> 'quantityUnit')::quantity_unit,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_payment' then
      select p.* into v_payment
      from payments p join budget_lines bl on bl.id = p.budget_line_id
      where p.id = v_item.target_id and bl.trip_id = v_trip_id
      for update of p;
      if v_payment.id is null then
        raise exception 'Payment % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'description', v_payment.description,
        'totalAmount', v_payment.total_amount,
        'currency', v_payment.currency,
        'dueDate', v_payment.due_date,
        'cancellationDeadline', v_payment.cancellation_deadline,
        'datesState', v_payment.dates_state,
        'datesSource', v_payment.dates_source_id,
        'timingType', v_payment.timing_type,
        'informationState', v_payment.information_state,
        'source', v_payment.source_id,
        'refundability', v_payment.refundability
      );
      v_new := proposal_merge_changes(
        v_item, v_trip_id, v_current, '{"datesSource": "source", "source": "source"}'
      );
      perform update_payment_details(
        v_item.target_id,
        v_new ->> 'description',
        (v_new ->> 'totalAmount')::numeric,
        v_new ->> 'currency',
        (v_new ->> 'dueDate')::date,
        (v_new ->> 'cancellationDeadline')::date,
        (v_new ->> 'datesState')::info_state,
        (v_new ->> 'datesSource')::uuid,
        (v_new ->> 'timingType')::payment_timing,
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        (v_new ->> 'refundability')::refundability,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_fx_rate' then
      select * into v_rate from fx_rates where id = v_item.target_id for update;
      if v_rate.id is null then
        raise exception 'FX rate % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'currency', v_rate.currency,
        'rateToUsd', v_rate.rate_to_usd,
        'rateDate', v_rate.rate_date,
        'rateKind', v_rate.rate_kind,
        'informationState', v_rate.information_state,
        'source', v_rate.source_id
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"source": "source"}');
      perform update_fx_rate(
        v_item.target_id,
        v_new ->> 'currency',
        (v_new ->> 'rateToUsd')::numeric,
        (v_new ->> 'rateDate')::date,
        (v_new ->> 'rateKind')::rate_kind,
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_savings_entry' then
      select * into v_entry from savings_entries
      where id = v_item.target_id and trip_id = v_trip_id for update;
      if v_entry.id is null then
        raise exception 'Savings entry % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'amount', v_entry.amount,
        'recordedOn', v_entry.recorded_on,
        'note', v_entry.note
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{}');
      perform update_savings_entry(
        v_item.target_id,
        (v_new ->> 'amount')::numeric,
        (v_new ->> 'recordedOn')::date,
        v_new ->> 'note',
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_stay' then
      select s.* into v_stay from stays s
      join scenarios sc on sc.id = s.scenario_id
      where s.id = v_item.target_id and sc.trip_id = v_trip_id
      for update of s;
      if v_stay.id is null then
        raise exception 'Stay % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'location', v_stay.location_id,
        'startDate', v_stay.start_date,
        'nights', v_stay.nights,
        'kind', v_stay.kind,
        'budgetLine', v_stay.budget_line_id,
        'informationState', v_stay.information_state,
        'source', v_stay.source_id,
        'notes', v_stay.notes,
        'flightOption', v_stay.flight_option_id
      );
      v_new := proposal_merge_changes(
        v_item, v_trip_id, v_current,
        '{"location": "location", "budgetLine": "budget_line", "source": "source", "flightOption": "flight_option"}'
      );
      perform update_stay(
        v_item.target_id,
        (v_new ->> 'location')::uuid,
        (v_new ->> 'startDate')::date,
        (v_new ->> 'nights')::integer,
        (v_new ->> 'kind')::stay_kind,
        (v_new ->> 'budgetLine')::uuid,
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        v_new ->> 'notes',
        (v_new ->> 'flightOption')::uuid,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_movement' then
      select m.* into v_movement from movements m
      join scenarios sc on sc.id = m.scenario_id
      where m.id = v_item.target_id and sc.trip_id = v_trip_id
      for update of m;
      if v_movement.id is null then
        raise exception 'Movement % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'sequence', v_movement.sequence,
        'fromLocation', v_movement.from_location_id,
        'toLocation', v_movement.to_location_id,
        'departDate', v_movement.depart_date,
        'departTime', v_movement.depart_time,
        'arriveDate', v_movement.arrive_date,
        'arriveTime', v_movement.arrive_time,
        'mode', v_movement.mode,
        'budgetLine', v_movement.budget_line_id,
        'bookingReference', v_movement.booking_reference,
        'informationState', v_movement.information_state,
        'source', v_movement.source_id,
        'notes', v_movement.notes,
        'flightOption', v_movement.flight_option_id
      );
      v_new := proposal_merge_changes(
        v_item, v_trip_id, v_current,
        '{"fromLocation": "location", "toLocation": "location", "budgetLine": "budget_line", "source": "source", "flightOption": "flight_option"}'
      );
      perform update_movement(
        v_item.target_id,
        (v_new ->> 'sequence')::integer,
        (v_new ->> 'fromLocation')::uuid,
        (v_new ->> 'toLocation')::uuid,
        (v_new ->> 'departDate')::date,
        (v_new ->> 'departTime')::time,
        (v_new ->> 'arriveDate')::date,
        (v_new ->> 'arriveTime')::time,
        (v_new ->> 'mode')::movement_mode,
        (v_new ->> 'budgetLine')::uuid,
        v_new ->> 'bookingReference',
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        v_new ->> 'notes',
        (v_new ->> 'flightOption')::uuid,
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_flight_option' then
      select fo.* into v_flight_option from flight_options fo
      join scenarios sc on sc.id = fo.scenario_id
      where fo.id = v_item.target_id and sc.trip_id = v_trip_id
      for update of fo;
      if v_flight_option.id is null then
        raise exception 'Flight option % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'label', v_flight_option.label,
        'fare', v_flight_option.fare,
        'bagFee', v_flight_option.bag_fee,
        'mandatoryFees', v_flight_option.mandatory_fees,
        'currency', v_flight_option.currency,
        'informationState', v_flight_option.information_state,
        'source', v_flight_option.source_id,
        'observedOn', v_flight_option.observed_on,
        'baggage', v_flight_option.baggage,
        'separateTickets', v_flight_option.separate_tickets,
        'refundability', v_flight_option.refundability,
        'status', v_flight_option.status,
        'bookingReference', v_flight_option.booking_reference,
        'notes', v_flight_option.notes
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"source": "source"}');
      perform update_flight_option(
        v_item.target_id,
        v_new ->> 'label',
        (v_new ->> 'fare')::numeric,
        (v_new ->> 'bagFee')::numeric,
        (v_new ->> 'mandatoryFees')::numeric,
        v_new ->> 'currency',
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        (v_new ->> 'observedOn')::date,
        (v_new ->> 'baggage')::flight_baggage,
        (v_new ->> 'separateTickets')::boolean,
        (v_new ->> 'refundability')::refundability,
        (v_new ->> 'status')::flight_option_status,
        v_new ->> 'bookingReference',
        v_new ->> 'notes',
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_location' then
      select * into v_location from locations where id = v_item.target_id for update;
      if v_location.id is null then
        raise exception 'Location % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'name', v_location.name,
        'timezone', v_location.timezone,
        'notes', v_location.notes
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{}');
      perform update_location(
        v_item.target_id,
        v_new ->> 'name',
        v_new ->> 'timezone',
        v_new ->> 'notes',
        v_item.reason
      );
      v_result := v_item.target_id;

    when 'update_accommodation_option' then
      select ao.* into v_accommodation_option from accommodation_options ao
      join stays s on s.id = ao.stay_id
      join scenarios sc on sc.id = s.scenario_id
      where ao.id = v_item.target_id and sc.trip_id = v_trip_id
      for update of ao;
      if v_accommodation_option.id is null then
        raise exception 'Accommodation option % not found (or not yours)', v_item.target_id;
      end if;
      v_current := jsonb_build_object(
        'label', v_accommodation_option.label,
        'propertyName', v_accommodation_option.property_name,
        'address', v_accommodation_option.address,
        'rateAmount', v_accommodation_option.rate_amount,
        'rateUnit', v_accommodation_option.rate_unit,
        'nights', v_accommodation_option.nights,
        'mandatoryFees', v_accommodation_option.mandatory_fees,
        'currency', v_accommodation_option.currency,
        'status', v_accommodation_option.status,
        'refundability', v_accommodation_option.refundability,
        'cancellationDeadline', v_accommodation_option.cancellation_deadline,
        'bookingReference', v_accommodation_option.booking_reference,
        'conditionalRate', v_accommodation_option.conditional_rate,
        'undiscountedAmount', v_accommodation_option.undiscounted_amount,
        'isHostel', v_accommodation_option.is_hostel,
        'source', v_accommodation_option.source_id,
        'observedOn', v_accommodation_option.observed_on,
        'informationState', v_accommodation_option.information_state,
        'notes', v_accommodation_option.notes
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"source": "source"}');
      perform update_accommodation_option(
        v_item.target_id,
        v_new ->> 'label',
        v_new ->> 'propertyName',
        v_new ->> 'address',
        (v_new ->> 'rateAmount')::numeric,
        (v_new ->> 'rateUnit')::accommodation_rate_unit,
        (v_new ->> 'nights')::integer,
        (v_new ->> 'mandatoryFees')::numeric,
        v_new ->> 'currency',
        (v_new ->> 'status')::accommodation_option_status,
        (v_new ->> 'refundability')::refundability,
        (v_new ->> 'cancellationDeadline')::date,
        v_new ->> 'bookingReference',
        (v_new ->> 'conditionalRate')::boolean,
        (v_new ->> 'undiscountedAmount')::numeric,
        (v_new ->> 'isHostel')::boolean,
        (v_new ->> 'source')::uuid,
        (v_new ->> 'observedOn')::date,
        (v_new ->> 'informationState')::info_state,
        v_new ->> 'notes',
        v_item.reason
      );
      v_result := v_item.target_id;
  end case;

  -- Marking the proposal itself is your decision, not Claude's write.
  perform set_config('app.actor', 'app', true);
  perform set_config('app.change_reason', 'Approved proposal: ' || v_item.reason, true);
  perform set_config('app.approving_proposal', p_item_id::text, true);

  update proposal_items
  set status = 'approved', decided_at = now(), result_id = v_result
  where id = p_item_id
  returning * into v_item;

  perform set_config('app.approving_proposal', '', true);

  return v_item;
end;
$$;

revoke execute on function approve_proposal(uuid) from public, anon;
grant execute on function approve_proposal(uuid) to authenticated;
