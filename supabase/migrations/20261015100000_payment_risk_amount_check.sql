-- A decision scoped to a payment (20261015090000) still didn't scope
-- the *amount*: a $100 risk-accepted commitment could later have its
-- total_amount raised to $5,000 with no new decision, since the
-- trigger only checked payment_id, not whether the live amount still
-- matches what was actually agreed to.

create or replace function enforce_payment_acceptance_safeguard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_scenario_id uuid;
  v_competition_id uuid;
  v_acceptance acceptance_status;
  v_decision_names_payment boolean := false;
  v_risk_accepted boolean := false;
  v_accepted_amount numeric;
  v_accepted_currency text;
begin
  if new.status not in ('committed', 'paid') then
    return new;
  end if;

  if not new.competition_related then
    return new;
  end if;

  if new.refundability not in ('non_refundable', 'unknown') then
    return new;
  end if;

  v_scenario_id := new.scenario_id;
  if v_scenario_id is null then
    select scenario_id into v_scenario_id
    from budget_lines
    where id = new.budget_line_id;
  end if;

  if v_scenario_id is not null then
    select competition_id into v_competition_id
    from scenarios
    where id = v_scenario_id;
  end if;

  if v_competition_id is not null then
    select acceptance_status into v_acceptance
    from competitions
    where id = v_competition_id;
  end if;

  if new.risk_accepted_decision_id is not null then
    select
      d.accepted_amount,
      d.accepted_currency,
      (d.decided_by = 'traveler'
        and d.payment_id = new.id
        and d.competition_id is not distinct from v_competition_id)
    into v_accepted_amount, v_accepted_currency, v_decision_names_payment
    from decisions d
    where d.id = new.risk_accepted_decision_id;

    -- select ... into leaves the variables (and their declared
    -- defaults) untouched when risk_accepted_decision_id doesn't match
    -- any row, so v_decision_names_payment correctly stays false.
    if v_decision_names_payment then
      v_risk_accepted := new.total_amount <= v_accepted_amount
        and new.currency = v_accepted_currency;
    end if;
  end if;

  if v_acceptance = 'accepted' or v_risk_accepted then
    return new;
  end if;

  if v_decision_names_payment then
    raise exception
      'Payment''s amount exceeds what was risk-accepted for it (accepted % %, now % %) -- accept the risk again at the new amount.',
      v_accepted_amount, v_accepted_currency, new.total_amount, new.currency;
  end if;

  raise exception
    'Payment is a non-refundable/unknown, competition-related commitment (status %) but the competition is not accepted and risk_accepted_decision_id does not point to a traveler decision for it.',
    new.status;
end;
$$;

revoke execute on function enforce_payment_acceptance_safeguard() from public, anon, authenticated;

-- update_payment_details needs to be able to attach a freshly-accepted
-- decision too, the same way update_payment_status already can
-- (p_risk_accepted_decision_id on that one) -- raising total_amount
-- past what was accepted is a details edit, not a status change, so
-- the retry-after-accepting-risk has to go through this function.
-- Adding a parameter changes the function's identity (its argument
-- *types* are what Postgres keys overloads on, defaults included), so
-- the old 14-arg signature is dropped explicitly rather than left
-- behind as a dead, callable overload.
drop function if exists update_payment_details(
  uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, boolean, text
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
  p_competition_related boolean,
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
      competition_related = p_competition_related,
      risk_accepted_decision_id = coalesce(p_risk_accepted_decision_id, risk_accepted_decision_id)
  where id = p_payment_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Payment % not found (or not yours)', p_payment_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function update_payment_details(
  uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, boolean, text, uuid
) from public, anon;
grant execute on function update_payment_details(
  uuid, text, numeric, text, date, date, info_state, uuid, payment_timing, info_state, uuid, refundability, boolean, text, uuid
) to authenticated;
