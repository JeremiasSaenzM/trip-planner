-- Removing the acceptance safeguard (hard constraint 3) from payments --
-- the real enforcement, via enforce_payment_acceptance_safeguard()'s
-- trigger. Same reasoning as the previous migration (20261102090000):
-- the rule was never actually the traveler's own, see CLAUDE.md.
drop trigger trg_payments_02_acceptance_safeguard on payments;
drop function enforce_payment_acceptance_safeguard();

alter table decisions drop constraint decisions_payment_risk_needs_rationale;
alter table decisions drop constraint decisions_accepted_currency_format;
alter table payments drop constraint payments_risk_accepted_decision_id_unique;

alter table decisions drop column payment_id;
alter table decisions drop column accepted_amount;
alter table decisions drop column accepted_currency;
alter table payments drop column risk_accepted_decision_id;
alter table payments drop column competition_related;

-- create_payment: plain insert, but its identity (and every overload
-- Postgres would otherwise keep callable) changes with the dropped
-- parameter, so dropped and recreated rather than CREATE OR REPLACE'd.
drop function create_payment(
  uuid, uuid, uuid, budget_category, text, text, numeric, refundability, date, payment_timing, date, boolean
);

create function create_payment(
  p_trip_id uuid,
  p_scenario_id uuid,
  p_budget_line_id uuid,
  p_category budget_category,
  p_description text,
  p_currency text,
  p_total_amount numeric,
  p_refundability refundability,
  p_cancellation_deadline date,
  p_timing_type payment_timing,
  p_due_date date
)
returns payments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_budget_line_id uuid := p_budget_line_id;
  v_row payments;
begin
  if v_budget_line_id is null then
    if p_category is null then
      raise exception 'A budget category is required when creating a new budget line for this payment.';
    end if;

    insert into budget_lines (
      trip_id, scenario_id, category, description,
      amount_min, amount_target, amount_conservative, currency,
      information_state, auto_created
    ) values (
      p_trip_id, p_scenario_id, p_category, p_description,
      p_total_amount, p_total_amount, p_total_amount, p_currency,
      'estimate', true
    )
    returning id into v_budget_line_id;
  end if;

  insert into payments (
    budget_line_id, scenario_id, description, total_amount, currency,
    refundability, cancellation_deadline, timing_type, due_date
  ) values (
    v_budget_line_id, p_scenario_id, p_description, p_total_amount, p_currency,
    p_refundability, p_cancellation_deadline, p_timing_type, p_due_date
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function create_payment(
  uuid, uuid, uuid, budget_category, text, text, numeric, refundability, date, payment_timing, date
) from public, anon;
grant execute on function create_payment(
  uuid, uuid, uuid, budget_category, text, text, numeric, refundability, date, payment_timing, date
) to authenticated;

drop function update_payment_status(uuid, payment_status, text, uuid);

create function update_payment_status(
  p_payment_id uuid,
  p_status payment_status,
  p_reason text
)
returns payments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row payments;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update payments
  set status = p_status
  where id = p_payment_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Payment % not found (or not yours)', p_payment_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_payment_status(uuid, payment_status, text) from public, anon;
grant execute on function update_payment_status(uuid, payment_status, text) to authenticated;

drop function update_payment_details(
  uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, boolean, text, uuid
);

create function update_payment_details(
  p_payment_id uuid,
  p_description text,
  p_total_amount numeric,
  p_currency text,
  p_due_date date,
  p_cancellation_deadline date,
  p_dates_state info_state,
  p_dates_source_id uuid,
  p_timing_type payment_timing,
  p_information_state info_state,
  p_source_id uuid,
  p_refundability refundability,
  p_reason text
)
returns payments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row payments;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update payments
  set description = p_description,
      total_amount = p_total_amount,
      currency = p_currency,
      due_date = p_due_date,
      cancellation_deadline = p_cancellation_deadline,
      dates_state = p_dates_state,
      dates_source_id = p_dates_source_id,
      timing_type = p_timing_type,
      information_state = p_information_state,
      source_id = p_source_id,
      refundability = p_refundability
  where id = p_payment_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Payment % not found (or not yours)', p_payment_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_payment_details(
  uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, text
) from public, anon;
grant execute on function update_payment_details(
  uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, text
) to authenticated;

-- update_scenario()'s signature doesn't change -- only the guard
-- clause against re-pointing a scenario's competition while it holds a
-- committed non-refundable competition-related payment, which existed
-- purely to protect the now-removed safeguard.
create or replace function update_scenario(
  p_id uuid,
  p_name text,
  p_competition_id uuid,
  p_reason text
)
returns scenarios
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing scenarios;
  v_row scenarios;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  select * into v_existing from scenarios where id = p_id;
  if v_existing.id is null then
    raise exception 'Scenario % not found (or not yours)', p_id;
  end if;

  if p_competition_id is not null and not exists (
    select 1 from competitions where id = p_competition_id and trip_id = v_existing.trip_id
  ) then
    raise exception 'Competition % not found (or not yours)', p_competition_id;
  end if;

  perform set_config('app.change_reason', p_reason, true);

  update scenarios
  set name = p_name,
      competition_id = p_competition_id
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function update_scenario(uuid, text, uuid, text) from public, anon;
grant execute on function update_scenario(uuid, text, uuid, text) to authenticated;

-- delete_scenario_cascade (20261027090000) cleared decisions.payment_id
-- before deleting the payments it pointed at, so the decision survived
-- losing the payment it was about. That column is gone now -- nothing
-- left to clear, and no caller ever reads a decision's payment link
-- again, so the whole update is dropped rather than reworded. Signature
-- is unchanged, so CREATE OR REPLACE is enough here.
create or replace function delete_scenario_cascade(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_scenario scenarios;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  select * into v_scenario from scenarios where id = p_id;
  if v_scenario.id is null then
    raise exception 'Scenario % not found (or not yours)', p_id;
  end if;

  perform set_config('app.change_reason', p_reason, true);

  -- Before budget_lines: stays/movements.budget_line_id has no cascade
  -- of its own, so deleting a budget line a surviving stay or movement
  -- still points at would fail on that foreign key.
  delete from stays where scenario_id = p_id;
  delete from movements where scenario_id = p_id;

  -- Before budget_lines too, so a payment on a *shared* budget line
  -- (scenario_id null on the line, but this scenario_id on the
  -- payment) is caught here rather than surviving the line it's priced
  -- against staying put.
  delete from payments where scenario_id = p_id;

  -- Cascades flight_segments.
  delete from flight_options where scenario_id = p_id;

  -- Cascades any payment still attached that was reached only through
  -- budget_line_id (scenario_id null on the payment, the line's own
  -- scenario_id set to this scenario) -- not caught by the explicit
  -- payments delete above.
  delete from budget_lines where scenario_id = p_id;

  delete from scenarios where id = p_id;
end;
$$;

revoke execute on function delete_scenario_cascade(uuid, text) from public, anon;
grant execute on function delete_scenario_cascade(uuid, text) to authenticated;
