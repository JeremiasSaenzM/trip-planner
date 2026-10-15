-- 20261015100000_payment_risk_amount_check.sql: a decision scoped to a
-- payment (0090) still didn't scope the *amount* -- raising
-- total_amount past what was accepted, or changing its currency, now
-- re-blocks the payment until a new decision covers the new snapshot.
-- Self-contained fixtures, matching 0040/0090's own convention.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(11);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP fixture trip', 'planning');

insert into competitions (id, owner_id, trip_id, name, city, country, start_date, end_date, timezone, dates_state)
values (
  'c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001', 'pgTAP fixture competition', 'Nowhere', 'Noland',
  '2029-01-01', '2029-01-05', 'UTC', 'estimate'
);

insert into scenarios (id, owner_id, trip_id, name, competition_id) values (
  'c0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001', 'pgTAP fixture scenario', 'c0000000-0000-0000-0000-000000000002'
);

insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values (
  'c0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
  'A', 'pgTAP fixture fee', 100, 100, 100, 'EUR', 'estimate'
);

insert into payments (
  id, owner_id, budget_line_id, description, total_amount, currency,
  status, refundability, competition_related
) values
  -- the amount-scoped target: non-refundable and competition-related.
  ('c0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000004', 'payment A', 100, 'EUR', 'planned', 'non_refundable', true),
  -- refundable: the safeguard never looks at this one at all, no
  -- matter how its amount changes.
  ('c0000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000004', 'payment B (refundable)', 100, 'EUR', 'planned', 'refundable', true),
  -- not competition-related: same early exit.
  ('c0000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000004', 'payment C (not competition-related)', 100, 'EUR', 'planned', 'non_refundable', false);

insert into decisions (
  id, owner_id, trip_id, competition_id, payment_id, title, rationale,
  decided_by, accepted_amount, accepted_currency
) values (
  'c0000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000005', 'pgTAP: accept the risk for payment A at EUR 100', 'small enough to risk',
  'traveler', 100, 'EUR'
);

select set_config('app.change_reason', 'pgTAP: committing payment A at the accepted amount', true);

select lives_ok(
  $$ update payments set status = 'committed', risk_accepted_decision_id = 'c0000000-0000-0000-0000-000000000008'
     where id = 'c0000000-0000-0000-0000-000000000005' $$,
  'payment A commits at exactly the accepted amount and currency'
);

select throws_like(
  $$ update payments set total_amount = 150 where id = 'c0000000-0000-0000-0000-000000000005' $$,
  '%exceeds what was risk-accepted for it%',
  'raising total_amount past the accepted amount re-blocks the committed payment'
);

select is(
  (select total_amount from payments where id = 'c0000000-0000-0000-0000-000000000005'),
  100::numeric,
  'total_amount is unchanged after the rejected raise'
);

select lives_ok(
  $$ update payments set total_amount = 100 where id = 'c0000000-0000-0000-0000-000000000005' $$,
  'setting it back to exactly the accepted amount is still fine (<=, not <)'
);

select throws_like(
  $$ update payments set currency = 'USD' where id = 'c0000000-0000-0000-0000-000000000005' $$,
  '%exceeds what was risk-accepted for it%',
  'changing currency away from what was accepted re-blocks the payment too, even at the same amount'
);

select set_config('app.change_reason', 'pgTAP: raising a refundable payment''s amount', true);

select lives_ok(
  $$ update payments set status = 'committed', total_amount = 9999 where id = 'c0000000-0000-0000-0000-000000000006' $$,
  'a refundable payment is never checked, no matter its amount or whether it has any decision at all'
);

select set_config('app.change_reason', 'pgTAP: raising a non-competition payment''s amount', true);

select lives_ok(
  $$ update payments set status = 'committed', total_amount = 9999 where id = 'c0000000-0000-0000-0000-000000000007' $$,
  'a payment that is not competition-related is never checked either'
);

-- Accepting the risk again at the new amount: a brand new decision,
-- naming the same payment, with its own frozen snapshot. The unique
-- constraint on risk_accepted_decision_id is keyed on the *decision*
-- id, not the payment, so pointing the payment at this new, distinct
-- decision is never a reuse of the old one.
insert into decisions (
  id, owner_id, trip_id, competition_id, payment_id, title, rationale,
  decided_by, accepted_amount, accepted_currency
) values (
  'c0000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000005', 'pgTAP: accept the risk for payment A at EUR 150', 'still worth it',
  'traveler', 150, 'EUR'
);

select set_config('app.change_reason', 'pgTAP: accepting the new, higher amount', true);

select lives_ok(
  $$ update payments set total_amount = 150, risk_accepted_decision_id = 'c0000000-0000-0000-0000-000000000009'
     where id = 'c0000000-0000-0000-0000-000000000005' $$,
  'the new decision, naming the same payment at the new amount, unblocks it again'
);

select is(
  (select risk_accepted_decision_id from payments where id = 'c0000000-0000-0000-0000-000000000005'),
  'c0000000-0000-0000-0000-000000000009'::uuid,
  'the payment now points at the new decision'
);

select is(
  (select accepted_amount from decisions where id = 'c0000000-0000-0000-0000-000000000008'),
  100::numeric,
  'the superseded decision keeps its own original frozen snapshot, unchanged'
);

select is(
  (select count(*) from decisions where payment_id = 'c0000000-0000-0000-0000-000000000005')::int,
  2,
  'both the superseded and the current decision remain on the record'
);

select * from finish();
rollback;
