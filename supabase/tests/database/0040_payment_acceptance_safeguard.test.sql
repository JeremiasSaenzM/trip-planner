-- Hard constraint 3: no non-refundable competition-related commitment
-- before the choir is officially accepted, unless the risk is
-- explicitly accepted. Builds its own throwaway trip/competition/
-- scenario/budget line (competition left at the default 'pending'
-- acceptance) rather than touching seed data, so it's self-contained.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('d0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP fixture trip', 'planning');

insert into competitions (id, owner_id, trip_id, name, city, country, start_date, end_date, timezone, dates_state)
values (
  'd0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', 'pgTAP fixture competition', 'Nowhere', 'Noland',
  '2029-01-01', '2029-01-05', 'UTC', 'estimate'
);

insert into scenarios (id, owner_id, trip_id, name, competition_id) values (
  'd0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', 'pgTAP fixture scenario', 'd0000000-0000-0000-0000-000000000002'
);

insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values (
  'd0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003',
  'A', 'pgTAP fixture fee', 100, 100, 100, 'EUR', 'estimate'
);

select throws_like(
  $$ insert into payments (owner_id, budget_line_id, description, total_amount, currency, status, refundability, competition_related)
     values ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'blocked deposit', 100, 'EUR', 'committed', 'non_refundable', true) $$,
  '%competition is not accepted%',
  'a committed, non-refundable, competition-related payment is rejected while the competition is still pending'
);

-- decisions.payment_id (20261015090000) is a real foreign key, so the
-- payment has to exist before a decision can name it -- inserted as
-- 'planned' first (which the safeguard never blocks, no matter how
-- risky), with an explicit id so the decision can reference it. This
-- also matches how the app actually does it: the payment is always
-- created well before anyone tries to commit it. The status change to
-- 'committed' happens last, as a plain update.
insert into payments (id, owner_id, budget_line_id, description, total_amount, currency, status, refundability, competition_related)
values (
  'd0000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000004', 'accepted-risk deposit', 100, 'EUR', 'planned', 'non_refundable', true
);

insert into decisions (
  id, owner_id, trip_id, competition_id, payment_id, title, rationale,
  decided_by, reversible, accepted_amount, accepted_currency
) values (
  'd0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000006', 'pgTAP fixture: accept the risk',
  'pgTAP fixture rationale', 'traveler', false, 100, 'EUR'
);

select set_config('app.change_reason', 'pgTAP: committing now that the risk is accepted', true);

select lives_ok(
  $$ update payments set status = 'committed', risk_accepted_decision_id = 'd0000000-0000-0000-0000-000000000005'
     where id = 'd0000000-0000-0000-0000-000000000006' $$,
  'the same payment succeeds once a traveler risk-accepted decision is linked to it'
);

select lives_ok(
  $$ insert into payments (owner_id, budget_line_id, description, total_amount, currency, status, refundability, competition_related)
     values ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'just planned', 100, 'EUR', 'planned', 'non_refundable', true) $$,
  'a merely "planned" payment is never blocked, no matter how risky it looks'
);

select * from finish();
rollback;
