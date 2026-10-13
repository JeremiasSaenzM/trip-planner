-- Every budget line must have Minimum <= Target <= Conservative.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select throws_like(
  $$ insert into budget_lines (owner_id, trip_id, category, description, amount_min, amount_target, amount_conservative, currency, information_state)
     values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A', 'pgTAP: minimum exceeds target', 200, 100, 300, 'EUR', 'estimate') $$,
  '%budget_lines_amount_order%',
  'a budget line where minimum exceeds target is rejected'
);

select * from finish();
rollback;
