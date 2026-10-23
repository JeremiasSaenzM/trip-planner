-- Phase 6.4b: several budget lines are a rate times a count --
-- "Paris nights, 12-24 July (13)" -- and until now the count only
-- lived in the description, where nothing could read it. Storing it
-- lets the app notice when the itinerary changes and the count stops
-- matching (see the three checks in src/lib/domain/
-- check-budget-line-*.ts), and lets the unit amount (computed, never
-- stored -- amount / quantity invites the drift this phase removes)
-- show up next to the total.
--
-- Both null means a flat amount -- flights, insurance, the
-- contingency reserve -- and no check applies to it.
create type quantity_unit as enum ('night', 'day', 'person', 'item');

alter table budget_lines add column quantity numeric;
alter table budget_lines add column quantity_unit quantity_unit;

alter table budget_lines add constraint budget_lines_quantity_positive
  check (quantity is null or quantity > 0);
alter table budget_lines add constraint budget_lines_quantity_pair
  check ((quantity is null) = (quantity_unit is null));

-- Adding two parameters changes update_budget_line's signature, so the
-- old 12-argument version (20261016090000_budget_line_confidence.sql)
-- has to be dropped -- create or replace alone would leave both
-- overloads in place, and the old one would keep accepting edits that
-- silently skip quantity. create_budget_line stays a plain insert,
-- same reasoning as confidence: nothing existed before to justify an
-- RPC just for these two columns.
drop function update_budget_line(
  uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, confidence_level, text
);

create function update_budget_line(
  p_id uuid,
  p_category budget_category,
  p_description text,
  p_amount_min numeric,
  p_amount_target numeric,
  p_amount_conservative numeric,
  p_currency text,
  p_information_state info_state,
  p_source_id uuid,
  p_notes text,
  p_confidence confidence_level,
  p_quantity numeric,
  p_quantity_unit quantity_unit,
  p_reason text
)
returns budget_lines
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row budget_lines;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update budget_lines
  set category = p_category,
      description = p_description,
      amount_min = p_amount_min,
      amount_target = p_amount_target,
      amount_conservative = p_amount_conservative,
      currency = p_currency,
      information_state = p_information_state,
      source_id = p_source_id,
      notes = p_notes,
      confidence = p_confidence,
      quantity = p_quantity,
      quantity_unit = p_quantity_unit,
      auto_created = false
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Budget line % not found (or not yours)', p_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_budget_line(
  uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, confidence_level, numeric, quantity_unit, text
) from public, anon;
grant execute on function update_budget_line(
  uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, confidence_level, numeric, quantity_unit, text
) to authenticated;

-- approve_proposal (20261024090100_proposal_ops_stays_movements_apply.sql)
-- restated in full -- only its create_budget_line insert and
-- update_budget_line branch change, to carry quantity/quantity_unit
-- the same way every other field on that op already does.
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
      insert into scenarios (trip_id, name, competition_id, includes_extension, notes)
      values (
        v_trip_id,
        v_data ->> 'name',
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'competition', 'competition'),
        coalesce((v_data ->> 'includesExtension')::boolean, false),
        v_data ->> 'notes'
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
        (v_data ->> 'dueDate')::date,
        (v_data ->> 'competitionRelated')::boolean
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
        scenario_id, location, start_date, nights, kind, budget_line_id, information_state, source_id, notes
      ) values (
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'scenario', 'scenario'),
        v_data ->> 'location',
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
        scenario_id, sequence, from_location, to_location, depart_date, depart_time,
        arrive_date, arrive_time, mode, budget_line_id, booking_reference, information_state, source_id, notes
      ) values (
        proposal_ref(v_item.batch_id, v_trip_id, v_data -> 'scenario', 'scenario'),
        (v_data ->> 'sequence')::integer,
        v_data ->> 'fromLocation',
        v_data ->> 'toLocation',
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
      v_current := jsonb_build_object('name', v_scenario.name, 'competition', v_scenario.competition_id);
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"competition": "competition"}');
      perform update_scenario(
        v_item.target_id,
        v_new ->> 'name',
        (v_new ->> 'competition')::uuid,
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
        'refundability', v_payment.refundability,
        'competitionRelated', v_payment.competition_related
      );
      v_new := proposal_merge_changes(
        v_item, v_trip_id, v_current, '{"datesSource": "source", "source": "source"}'
      );
      -- No risk-accepted decision is ever passed: accepting a risk stays
      -- a deliberate act on the Payments page, so a change the
      -- acceptance safeguard blocks fails here with its own message.
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
        (v_new ->> 'competitionRelated')::boolean,
        v_item.reason,
        null
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
        'location', v_stay.location,
        'startDate', v_stay.start_date,
        'nights', v_stay.nights,
        'kind', v_stay.kind,
        'budgetLine', v_stay.budget_line_id,
        'informationState', v_stay.information_state,
        'source', v_stay.source_id,
        'notes', v_stay.notes
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"budgetLine": "budget_line", "source": "source"}');
      perform update_stay(
        v_item.target_id,
        v_new ->> 'location',
        (v_new ->> 'startDate')::date,
        (v_new ->> 'nights')::integer,
        (v_new ->> 'kind')::stay_kind,
        (v_new ->> 'budgetLine')::uuid,
        (v_new ->> 'informationState')::info_state,
        (v_new ->> 'source')::uuid,
        v_new ->> 'notes',
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
        'fromLocation', v_movement.from_location,
        'toLocation', v_movement.to_location,
        'departDate', v_movement.depart_date,
        'departTime', v_movement.depart_time,
        'arriveDate', v_movement.arrive_date,
        'arriveTime', v_movement.arrive_time,
        'mode', v_movement.mode,
        'budgetLine', v_movement.budget_line_id,
        'bookingReference', v_movement.booking_reference,
        'informationState', v_movement.information_state,
        'source', v_movement.source_id,
        'notes', v_movement.notes
      );
      v_new := proposal_merge_changes(v_item, v_trip_id, v_current, '{"budgetLine": "budget_line", "source": "source"}');
      perform update_movement(
        v_item.target_id,
        (v_new ->> 'sequence')::integer,
        v_new ->> 'fromLocation',
        v_new ->> 'toLocation',
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
