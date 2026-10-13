-- "A confirmed value requires a source" is a same-row CHECK constraint
-- on budget_lines (and payments, fx_rates, flight_options the same way).
begin;
set search_path = public, extensions;
select plan(2);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select throws_like(
  $$ insert into budget_lines (owner_id, trip_id, category, description, amount_min, amount_target, amount_conservative, currency, information_state, source_id)
     values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A', 'pgTAP: confirmed without source', 10, 10, 10, 'EUR', 'confirmed', null) $$,
  '%budget_lines_confirmed_needs_source%',
  'a confirmed budget line with no source is rejected'
);

select lives_ok(
  $$ insert into budget_lines (owner_id, trip_id, category, description, amount_min, amount_target, amount_conservative, currency, information_state, source_id)
     values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A', 'pgTAP: confirmed with source', 10, 10, 10, 'EUR', 'confirmed', '30000000-0000-0000-0000-000000000001') $$,
  'the same confirmed budget line succeeds once a source is given'
);

select * from finish();
rollback;
