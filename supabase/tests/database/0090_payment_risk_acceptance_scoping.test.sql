-- 20261015090000_payment_risk_acceptance_scoping.sql: a risk-accepted
-- decision now has to name the exact payment it unblocks (payment_id),
-- not just share its competition -- otherwise one decision could
-- unblock every non-refundable payment under that competition.
-- Self-contained fixtures (not seed data), matching
-- 0040_payment_acceptance_safeguard.test.sql's own convention.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP fixture trip', 'planning');

insert into competitions (id, owner_id, trip_id, name, city, country, start_date, end_date, timezone, dates_state)
values (
  'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'pgTAP fixture competition', 'Nowhere', 'Noland',
  '2029-01-01', '2029-01-05', 'UTC', 'estimate'
);

insert into scenarios (id, owner_id, trip_id, name, competition_id) values (
  'e0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'pgTAP fixture scenario', 'e0000000-0000-0000-0000-000000000002'
);

insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values (
  'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003',
  'A', 'pgTAP fixture fee', 100, 100, 100, 'EUR', 'estimate'
);

insert into payments (id, owner_id, budget_line_id, description, total_amount, currency, status, refundability, competition_related)
values
  ('e0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000004', 'payment A', 100, 'EUR', 'planned', 'non_refundable', true),
  ('e0000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000004', 'payment B', 100, 'EUR', 'planned', 'non_refundable', true);

-- The rationale-required constraint is conditional: a decision that
-- names no payment (a choir director's choice, unrelated to money)
-- still doesn't need one.
select lives_ok(
  $$ insert into decisions (id, owner_id, trip_id, title, decided_by)
     values ('e0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
             'e0000000-0000-0000-0000-000000000001', 'pgTAP: an unrelated decision', 'traveler') $$,
  'a decision with no payment_id doesn''t need a rationale'
);

select throws_like(
  $$ insert into decisions (id, owner_id, trip_id, competition_id, payment_id, title, decided_by)
     values ('e0000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001',
             'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
             'e0000000-0000-0000-0000-000000000005', 'pgTAP: missing rationale', 'traveler') $$,
  '%decisions_payment_risk_needs_rationale%',
  'a decision naming a payment requires a rationale'
);

select throws_like(
  $$ insert into decisions (id, owner_id, trip_id, competition_id, payment_id, title, rationale, decided_by, accepted_amount, accepted_currency)
     values ('e0000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001',
             'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
             'e0000000-0000-0000-0000-000000000005', 'pgTAP: bad currency', 'because', 'traveler', 100, 'eur') $$,
  '%decisions_accepted_currency_format%',
  'accepted_currency has to be a 3-letter uppercase code'
);

-- The real risk-acceptance decision, scoped to payment A specifically.
insert into decisions (
  id, owner_id, trip_id, competition_id, payment_id, title, rationale,
  decided_by, accepted_amount, accepted_currency
) values (
  'e0000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000005', 'pgTAP: accept the risk for payment A', 'small enough to risk',
  'traveler', 100, 'EUR'
);

select lives_ok(
  $$ update payments set status = 'committed', risk_accepted_decision_id = 'e0000000-0000-0000-0000-000000000007'
     where id = 'e0000000-0000-0000-0000-000000000005' $$,
  'the decision unblocks the payment it names (A)'
);

select throws_like(
  $$ update payments set status = 'committed', risk_accepted_decision_id = 'e0000000-0000-0000-0000-000000000007'
     where id = 'e0000000-0000-0000-0000-000000000006' $$,
  '%competition is not accepted%',
  'the same decision does not unblock a sibling payment (B) under the same competition'
);

select is(
  (select status::text from payments where id = 'e0000000-0000-0000-0000-000000000006'),
  'planned',
  'payment B is still unchanged after the rejected attempt'
);

-- Independent of the trigger: a payment that never reaches
-- committed/paid never runs the safeguard's own check at all, so the
-- unique constraint on risk_accepted_decision_id is what has to stop
-- the same decision being attached to it anyway.
select throws_like(
  $$ update payments set risk_accepted_decision_id = 'e0000000-0000-0000-0000-000000000007'
     where id = 'e0000000-0000-0000-0000-000000000006' $$,
  '%payments_risk_accepted_decision_id_unique%',
  'the same decision can''t be attached to a second payment even while merely planned'
);

select is(
  (select risk_accepted_decision_id from payments where id = 'e0000000-0000-0000-0000-000000000006'),
  null,
  'payment B still has no risk_accepted_decision_id after the rejected attempt'
);

select is(
  (select status::text from payments where id = 'e0000000-0000-0000-0000-000000000005'),
  'committed',
  'payment A is still committed'
);

select is(
  (select accepted_amount from decisions where id = 'e0000000-0000-0000-0000-000000000007'),
  100::numeric,
  'the decision keeps its own frozen snapshot of the amount accepted'
);

select * from finish();
rollback;
