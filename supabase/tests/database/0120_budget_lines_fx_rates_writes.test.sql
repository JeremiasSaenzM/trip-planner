-- update_budget_line / delete_budget_line / update_fx_rate
-- (20261015110000_budget_lines_fx_rates_writes.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP fixture trip', 'planning');

insert into scenarios (id, owner_id, trip_id, name) values (
  'e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'pgTAP fixture scenario'
);

insert into sources (id, owner_id, provider, tier, observed_on) values (
  'e0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
  'pgTAP fixture source', 1, '2026-10-01'
);

-- Line 1: auto_created, for the update tests -- proves editing it
-- flips auto_created to false.
insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state, auto_created
) values (
  'e0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
  'A', 'pgTAP update target', 100, 100, 100, 'USD', 'estimate', true
);

-- Line 2: for the delete tests -- starts with a payment attached, to
-- prove delete_budget_line refuses while that's true.
insert into budget_lines (
  id, owner_id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state, auto_created
) values (
  'e0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
  'B', 'pgTAP delete target', 50, 50, 50, 'USD', 'estimate', false
);

insert into payments (
  id, owner_id, budget_line_id, description, total_amount, currency, refundability, competition_related
) values (
  'e0000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000005', 'pgTAP fixture payment', 50, 'USD', 'refundable', false
);

insert into fx_rates (id, owner_id, currency, rate_to_usd, rate_date, rate_kind, source_id) values (
  'e0000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
  'EUR', 1.1, '2026-10-01', 'planning_base', 'e0000000-0000-0000-0000-000000000003'
);
-- A second rate the update-to-collide test will try to overwrite onto.
insert into fx_rates (id, owner_id, currency, rate_to_usd, rate_date, rate_kind, source_id) values (
  'e0000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
  'EUR', 1.3, '2026-10-01', 'planning_conservative', 'e0000000-0000-0000-0000-000000000003'
);

-- update_budget_line

select throws_like(
  $$ select update_budget_line(
       'e0000000-0000-0000-0000-000000000004', 'A', 'renamed', 100, 100, 100, 'USD', 'estimate', null, null, ''
     ) $$,
  '%reason is required%',
  'update_budget_line rejects a blank reason'
);

select throws_like(
  $$ select update_budget_line(
       'e0000000-0000-0000-0000-000000000004', 'A', 'renamed', 100, 50, 100, 'USD', 'estimate', null, null,
       'pgTAP: bad order'
     ) $$,
  '%budget_lines_amount_order%',
  'update_budget_line still enforces min <= target <= conservative'
);

select throws_like(
  $$ select update_budget_line(
       'e0000000-0000-0000-0000-000000000004', 'A', 'renamed', 100, 100, 100, 'USD', 'confirmed', null, null,
       'pgTAP: confirmed with no source'
     ) $$,
  '%budget_lines_confirmed_needs_source%',
  'update_budget_line still enforces confirmed needs a source'
);

select lives_ok(
  $$ select update_budget_line(
       'e0000000-0000-0000-0000-000000000004', 'A', 'renamed', 100, 100, 100, 'USD', 'estimate', null, null,
       'pgTAP: renaming it'
     ) $$,
  'update_budget_line succeeds with a real reason'
);

select results_eq(
  $$ select description, auto_created from budget_lines where id = 'e0000000-0000-0000-0000-000000000004' $$,
  $$ values ('renamed'::text, false) $$,
  'the description was updated and auto_created was cleared'
);

-- delete_budget_line

select throws_like(
  $$ select delete_budget_line('e0000000-0000-0000-0000-000000000005', '') $$,
  '%reason is required%',
  'delete_budget_line rejects a blank reason'
);

select throws_like(
  $$ select delete_budget_line('e0000000-0000-0000-0000-000000000005', 'pgTAP: trying anyway') $$,
  '%still has payments attached%',
  'delete_budget_line refuses while a payment still references it'
);

select set_config('app.change_reason', 'pgTAP: removing the payment first', true);
delete from payments where id = 'e0000000-0000-0000-0000-000000000006';

select lives_ok(
  $$ select delete_budget_line('e0000000-0000-0000-0000-000000000005', 'pgTAP: now nothing references it') $$,
  'delete_budget_line succeeds once nothing references the line'
);

select is(
  (select count(*) from budget_lines where id = 'e0000000-0000-0000-0000-000000000005')::int,
  0,
  'the line is actually gone'
);

-- A second account can't touch either RPC.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_budget_line(
       'e0000000-0000-0000-0000-000000000004', 'A', 'x', 100, 100, 100, 'USD', 'estimate', null, null, 'not mine'
     ) $$,
  '%not found%',
  'a second account updating my budget line gets "not found"'
);

select throws_like(
  $$ select delete_budget_line('e0000000-0000-0000-0000-000000000004', 'not mine') $$,
  '%not found%',
  'a second account deleting my budget line also gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- update_fx_rate

select throws_like(
  $$ select update_fx_rate(
       'e0000000-0000-0000-0000-000000000007', 'EUR', 1.12, '2026-10-02', 'planning_base', 'estimate',
       'e0000000-0000-0000-0000-000000000003', ''
     ) $$,
  '%reason is required%',
  'update_fx_rate rejects a blank reason'
);

select lives_ok(
  $$ select update_fx_rate(
       'e0000000-0000-0000-0000-000000000007', 'EUR', 1.12, '2026-10-02', 'planning_base', 'estimate',
       'e0000000-0000-0000-0000-000000000003', 'pgTAP: refreshing the rate'
     ) $$,
  'update_fx_rate succeeds with a real reason'
);

select is(
  (select rate_to_usd from fx_rates where id = 'e0000000-0000-0000-0000-000000000007'),
  1.12::numeric,
  'the rate was actually updated'
);

select throws_like(
  $$ select update_fx_rate(
       'e0000000-0000-0000-0000-000000000007', 'EUR', 1.3, '2026-10-01', 'planning_conservative', 'estimate',
       'e0000000-0000-0000-0000-000000000003', 'pgTAP: colliding on purpose'
     ) $$,
  '%fx_rates_currency_date_kind_unique%',
  'update_fx_rate still enforces one row per currency/date/kind'
);

-- Grants: authenticated can call every RPC here, anon can't.
select ok(has_function_privilege('authenticated',
  'update_budget_line(uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, text)', 'EXECUTE'),
  'authenticated can execute update_budget_line');
select ok(not has_function_privilege('anon',
  'update_budget_line(uuid, budget_category, text, numeric, numeric, numeric, text, info_state, uuid, text, text)', 'EXECUTE'),
  'anon cannot execute update_budget_line');
select ok(has_function_privilege('authenticated', 'delete_budget_line(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_budget_line');
select ok(not has_function_privilege('anon', 'delete_budget_line(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_budget_line');
select ok(has_function_privilege('authenticated',
  'update_fx_rate(uuid, text, numeric, date, rate_kind, info_state, uuid, text)', 'EXECUTE'),
  'authenticated can execute update_fx_rate');
select ok(not has_function_privilege('anon',
  'update_fx_rate(uuid, text, numeric, date, rate_kind, info_state, uuid, text)', 'EXECUTE'),
  'anon cannot execute update_fx_rate');

select * from finish();
rollback;
