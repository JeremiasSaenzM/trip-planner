create table payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  budget_line_id uuid not null references budget_lines (id) on delete cascade,
  scenario_id uuid references scenarios (id),
  description text not null,
  total_amount numeric(12, 2) not null,
  paid_amount numeric(12, 2) not null default 0,
  currency text not null,
  due_date date,
  cancellation_deadline date,
  dates_state info_state not null default 'pending',
  dates_source_id uuid references sources (id),
  timing_type payment_timing not null default 'unknown',
  status payment_status not null default 'planned',
  information_state info_state not null default 'estimate',
  source_id uuid references sources (id),
  refundability refundability not null default 'unknown',
  competition_related boolean not null default true,
  risk_accepted_decision_id uuid references decisions (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payments_paid_not_over_total check (paid_amount <= total_amount),
  constraint payments_confirmed_needs_source
    check (information_state <> 'confirmed' or source_id is not null),
  constraint payments_dates_confirmed_needs_source
    check (dates_state <> 'confirmed' or dates_source_id is not null)
);

create trigger trg_payments_set_updated_at
before update on payments
for each row execute function trigger_set_updated_at();

-- A payment's own scenario_id (if set) must agree with its budget line's
-- scenario. A shared budget line (scenario_id null) can still carry
-- scenario-specific payments; what's not allowed is a payment and its
-- budget line pointing at two *different* scenarios.
create or replace function enforce_payment_scenario_consistency()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_budget_line_scenario_id uuid;
begin
  select scenario_id into v_budget_line_scenario_id
  from budget_lines
  where id = new.budget_line_id;

  if new.scenario_id is not null
     and v_budget_line_scenario_id is not null
     and new.scenario_id <> v_budget_line_scenario_id
  then
    raise exception
      'Payment scenario (%) does not match its budget line''s scenario (%)',
      new.scenario_id, v_budget_line_scenario_id;
  end if;

  return new;
end;
$$;

revoke execute on function enforce_payment_scenario_consistency() from public, anon, authenticated;

-- Hard constraint 3: no non-refundable competition-related commitment
-- before the choir is officially accepted, unless the risk is explicitly
-- accepted. This can't be a plain check constraint because it depends on
-- data in other tables (which competition the payment's scenario points
-- to, and whether that competition is accepted), so it has to be a
-- trigger. "Committed" or "paid" status is what counts as a commitment --
-- a merely "planned" payment is never blocked, however risky it looks.
create or replace function enforce_payment_acceptance_safeguard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_scenario_id uuid;
  v_competition_id uuid;
  v_acceptance acceptance_status;
  v_risk_accepted boolean := false;
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
    select exists (
      select 1
      from decisions d
      where d.id = new.risk_accepted_decision_id
        and d.decided_by = 'traveler'
        and d.competition_id is not distinct from v_competition_id
    )
    into v_risk_accepted;
  end if;

  if v_acceptance = 'accepted' or v_risk_accepted then
    return new;
  end if;

  raise exception
    'Payment is a non-refundable/unknown, competition-related commitment (status %) but the competition is not accepted and risk_accepted_decision_id does not point to a traveler decision for it.',
    new.status;
end;
$$;

revoke execute on function enforce_payment_acceptance_safeguard() from public, anon, authenticated;

-- Numbered so the scenario-consistency check always runs before the
-- acceptance safeguard reads the (now-validated) scenario.
create trigger trg_payments_01_scenario_consistency
before insert or update on payments
for each row execute function enforce_payment_scenario_consistency();

create trigger trg_payments_02_acceptance_safeguard
before insert or update on payments
for each row execute function enforce_payment_acceptance_safeguard();

alter table payments enable row level security;

create policy "owner_all" on payments
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
