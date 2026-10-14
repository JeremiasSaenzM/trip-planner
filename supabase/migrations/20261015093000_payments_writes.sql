-- There's no budget-lines screen yet (that's Phase 5's next PR), so
-- "add a payment" has to be able to create its own budget line behind
-- the scenes when the person isn't attaching the payment to one they
-- already have. auto_created marks exactly those lines, so
-- delete_payment below knows which ones it's allowed to clean up.
alter table budget_lines add column auto_created boolean not null default false;

-- Plain inserts: nothing existed before to justify changing, so
-- change_log's trigger doesn't require a reason, and no reason
-- parameter is needed here. Still an RPC, not two separate client
-- inserts, so the budget line and the payment are created together or
-- not at all -- a client-side failure between two separate insert
-- calls would otherwise risk an orphaned budget line.
create or replace function create_payment(
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
  p_due_date date,
  p_competition_related boolean
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

    -- 'estimate', never 'confirmed': budget_lines_confirmed_needs_source
    -- requires a source, and this form has no way to create or pick one.
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
    refundability, cancellation_deadline, timing_type, due_date, competition_related
  ) values (
    v_budget_line_id, p_scenario_id, p_description, p_total_amount, p_currency,
    p_refundability, p_cancellation_deadline, p_timing_type, p_due_date, p_competition_related
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function create_payment(
  uuid, uuid, uuid, budget_category, text, text, numeric, refundability, date, payment_timing, date, boolean
) from public, anon;
grant execute on function create_payment(
  uuid, uuid, uuid, budget_category, text, text, numeric, refundability, date, payment_timing, date, boolean
) to authenticated;

-- Unlike recording a savings entry (a fresh row, no reason needed),
-- there's no payments ledger table -- paid_amount is a running total on
-- the payment's own row, so adding to it is an UPDATE change_log's
-- trigger does require a reason for.
create or replace function record_payment(p_payment_id uuid, p_amount numeric, p_reason text)
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
  set paid_amount = paid_amount + p_amount
  where id = p_payment_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Payment % not found (or not yours)', p_payment_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function record_payment(uuid, numeric, text) from public, anon;
grant execute on function record_payment(uuid, numeric, text) to authenticated;

-- p_risk_accepted_decision_id is only ever non-null on the "I accept
-- this risk" retry (see src/app/(app)/payment-actions.ts) -- coalesce
-- leaves whatever was already on the row alone for a plain status
-- change.
create or replace function update_payment_status(
  p_payment_id uuid,
  p_status payment_status,
  p_reason text,
  p_risk_accepted_decision_id uuid default null
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
  set status = p_status,
      risk_accepted_decision_id = coalesce(p_risk_accepted_decision_id, risk_accepted_decision_id)
  where id = p_payment_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Payment % not found (or not yours)', p_payment_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_payment_status(uuid, payment_status, text, uuid) from public, anon;
grant execute on function update_payment_status(uuid, payment_status, text, uuid) to authenticated;

-- Everything editable about a payment except its budget category (that
-- lives on the linked budget_lines row, out of scope here -- deferred
-- to the budget-lines editing screen).
create or replace function update_payment_details(
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
  p_competition_related boolean,
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
      refundability = p_refundability,
      competition_related = p_competition_related
  where id = p_payment_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Payment % not found (or not yours)', p_payment_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_payment_details(
  uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, boolean, text
) from public, anon;
grant execute on function update_payment_details(
  uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, boolean, text
) to authenticated;

-- Deletes the payment's budget line too, but only when that line was
-- auto_created for this payment specifically and nothing else
-- references it -- a line the person picked (shared, or created by a
-- later budget-lines screen) is always left alone, whether or not
-- anything still points to it.
create or replace function delete_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_budget_line_id uuid;
  v_deleted_id uuid;
  v_auto_created boolean;
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for this change.';
  end if;

  perform set_config('app.change_reason', p_reason, true);

  delete from payments where id = p_payment_id
  returning id, budget_line_id into v_deleted_id, v_budget_line_id;

  if v_deleted_id is null then
    raise exception 'Payment % not found (or not yours)', p_payment_id;
  end if;

  select auto_created into v_auto_created from budget_lines where id = v_budget_line_id;

  if v_auto_created and not exists (select 1 from payments where budget_line_id = v_budget_line_id) then
    delete from budget_lines where id = v_budget_line_id;
  end if;
end;
$$;

revoke execute on function delete_payment(uuid, text) from public, anon;
grant execute on function delete_payment(uuid, text) to authenticated;
