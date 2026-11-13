-- Two guards that weren't covered yet: the baggage/fee check on
-- flight_options, and the payment/budget-line scenario consistency check.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(2);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- (1) baggage = 'paid_addon' with no bag_fee is rejected.
select throws_like(
  $$ insert into flight_options (owner_id, scenario_id, label, fare, bag_fee, mandatory_fees, currency, source_id, observed_on, baggage)
     values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'pgTAP fixture option', 300, 0, 20, 'EUR', '30000000-0000-0000-0000-000000000001', current_date, 'paid_addon') $$,
  '%flight_options_paid_addon_needs_fee%',
  'a paid_addon fare with no bag_fee is rejected'
);

-- (2) a payment whose own scenario_id conflicts with its budget line's
-- scenario_id is rejected. Seeded budget_lines row 1 belongs to
-- scenario 1; pointing its payment at seeded scenario 2 instead.
select throws_like(
  $$ insert into payments (owner_id, budget_line_id, scenario_id, description, total_amount, currency)
     values ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'conflicting scenario', 50, 'EUR') $$,
  '%belongs to scenario%',
  'a payment scenario that conflicts with its budget line''s scenario is rejected'
);

select * from finish();
rollback;
