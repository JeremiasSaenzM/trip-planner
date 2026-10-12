-- Three guards that weren't covered yet: the baggage/fee check on
-- flight_options, the acceptance safeguard rejecting a non-traveler
-- risk decision, and the payment/budget-line scenario consistency check.
begin;
set search_path = public, extensions;
select plan(3);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- (1) baggage = 'paid_addon' with no bag_fee is rejected.
select throws_like(
  $$ insert into flight_options (owner_id, scenario_id, fare, bag_fee, mandatory_fees, currency, source_id, observed_on, baggage, arrival_at)
     values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 300, 0, 20, 'EUR', '30000000-0000-0000-0000-000000000001', current_date, 'paid_addon', now()) $$,
  '%flight_options_paid_addon_needs_fee%',
  'a paid_addon fare with no bag_fee is rejected'
);

-- (2) a risk-accepted decision that wasn't made by the traveler does not
-- unlock a committed, non-refundable, competition-related payment.
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

insert into decisions (id, owner_id, trip_id, competition_id, title, decided_by, reversible) values (
  'e0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
  'pgTAP fixture: choir director decides, not the traveler', 'choir_director', false
);

select throws_like(
  $$ insert into payments (owner_id, budget_line_id, description, total_amount, currency, status, refundability, competition_related, risk_accepted_decision_id)
     values ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 'blocked deposit', 100, 'EUR', 'committed', 'non_refundable', true, 'e0000000-0000-0000-0000-000000000005') $$,
  '%competition is not accepted%',
  'a risk decision not made by the traveler does not unlock the payment'
);

-- (3) a payment whose own scenario_id conflicts with its budget line's
-- scenario_id is rejected. Seeded budget_lines row 1 belongs to
-- scenario 1; pointing its payment at seeded scenario 2 instead.
select throws_like(
  $$ insert into payments (owner_id, budget_line_id, scenario_id, description, total_amount, currency)
     values ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'conflicting scenario', 50, 'EUR') $$,
  '%does not match its budget line%',
  'a payment scenario that conflicts with its budget line''s scenario is rejected'
);

select * from finish();
rollback;
