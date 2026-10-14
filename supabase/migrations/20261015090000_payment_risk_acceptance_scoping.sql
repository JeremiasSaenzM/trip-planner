-- enforce_payment_acceptance_safeguard() (20261012130900_payments.sql)
-- only checked that a risk-accepted decision belonged to the *same
-- competition* as the payment -- not to the payment itself. That meant
-- one traveler decision could unblock every non-refundable payment
-- under a competition, not just the one it was meant for.

-- The live link to the specific payment this decision unblocks. Nullable:
-- most decisions (a choir director's choice, a general trip decision)
-- aren't about any one payment.
alter table decisions add column payment_id uuid references payments(id);

-- A frozen record of what was actually agreed to, independent of the
-- live payment_id join: if the payment's own amount or currency ever
-- changes later, this still shows what the risk acceptance covered at
-- the time. The FK above is "what this decision currently unblocks";
-- these are "what was agreed to, back when it was agreed to."
alter table decisions add column accepted_amount numeric(12, 2);
alter table decisions add column accepted_currency text;

alter table decisions
  add constraint decisions_accepted_currency_format
    check (accepted_currency is null or accepted_currency ~ '^[A-Z]{3}$');

-- A decision that unblocks a payment has to say why -- the general
-- decisions.rationale column stays optional for every other kind of
-- decision (a choir director's choice doesn't need one from me), but
-- not for this one.
alter table decisions
  add constraint decisions_payment_risk_needs_rationale
    check (payment_id is null or rationale is not null);

-- A decision can unblock at most one payment -- without this, nothing
-- stops the same decision row from being attached to a second payment
-- via risk_accepted_decision_id directly (bypassing the trigger below
-- entirely, since it only runs for a payment that's actually reaching
-- committed/paid status; a payment that never does is never checked).
alter table payments
  add constraint payments_risk_accepted_decision_id_unique unique (risk_accepted_decision_id);

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
        and d.payment_id = new.id
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
