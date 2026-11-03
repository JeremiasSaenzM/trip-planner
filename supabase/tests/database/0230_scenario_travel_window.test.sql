-- scenarios' travel window columns and update_scenario's extended
-- signature (20261103090000_scenario_travel_window.sql). Mirrors
-- 0170_trip_travel_window.test.sql's shape; scenarios_travel_dates_together
-- has no trip-level equivalent (see that migration's own comment).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(15);

select col_is_null('scenarios', 'departure_date', 'scenarios.departure_date is nullable (inherits the trip''s)');
select col_is_null('scenarios', 'return_date', 'scenarios.return_date is nullable');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, name) values ('d1000000-0000-0000-0000-000000000001', 'pgTAP scenario window trip');
insert into scenarios (id, trip_id, name) values (
  'd1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'pgTAP scenario window scenario'
);
insert into sources (id, provider, tier, observed_on) values (
  'd1000000-0000-0000-0000-000000000003', 'pgTAP fixture source', 1, '2026-10-01'
);

select is(
  (select travel_dates_state::text from scenarios where id = 'd1000000-0000-0000-0000-000000000002'),
  'pending',
  'a new scenario''s travel dates start out pending, inheriting the trip''s window'
);

select throws_like(
  $$ select update_scenario(
       'd1000000-0000-0000-0000-000000000002', 'pgTAP scenario window scenario', null,
       '2028-07-02', null, 'estimate', null, 'pgTAP: half a window'
     ) $$,
  '%scenarios_travel_dates_together%',
  'one date without the other is refused'
);

select throws_like(
  $$ select update_scenario(
       'd1000000-0000-0000-0000-000000000002', 'pgTAP scenario window scenario', null,
       '2028-07-25', '2028-07-02', 'estimate', null, 'pgTAP: backwards'
     ) $$,
  '%scenarios_return_after_departure%',
  'a return before the departure is refused'
);

select throws_like(
  $$ select update_scenario(
       'd1000000-0000-0000-0000-000000000002', 'pgTAP scenario window scenario', null,
       '2028-07-02', '2028-07-25', 'confirmed', null, 'pgTAP: no source'
     ) $$,
  '%scenarios_travel_dates_confirmed_needs_source%',
  'confirmed travel dates need a source'
);

select throws_like(
  $$ select update_scenario(
       'd1000000-0000-0000-0000-000000000002', 'pgTAP scenario window scenario', null,
       null, null, 'confirmed', 'd1000000-0000-0000-0000-000000000003', 'pgTAP: confirmed but no dates'
     ) $$,
  '%scenarios_confirmed_travel_dates_need_dates%',
  'confirmed travel dates need both dates, even with a source'
);

select lives_ok(
  $$ select update_scenario(
       'd1000000-0000-0000-0000-000000000002', 'pgTAP scenario window scenario', null,
       '2028-06-28', '2028-07-10', 'confirmed', 'd1000000-0000-0000-0000-000000000003', 'pgTAP: shorter trip'
     ) $$,
  'update_scenario succeeds with both dates, a source and a reason'
);

select results_eq(
  $$ select departure_date, return_date, travel_dates_state::text, name
     from scenarios where id = 'd1000000-0000-0000-0000-000000000002' $$,
  $$ values ('2028-06-28'::date, '2028-07-10'::date, 'confirmed'::text, 'pgTAP scenario window scenario'::text) $$,
  'the override was saved, and nothing else on the scenario changed'
);

select ok(
  exists (
    select 1 from change_log
    where table_name = 'scenarios' and row_id = 'd1000000-0000-0000-0000-000000000002' and action = 'update'
      and reason = 'pgTAP: shorter trip'
      and new_data ->> 'departure_date' = '2028-06-28'
      and new_data ->> 'travel_dates_state' = 'confirmed'
  ),
  'the edit is in change_log with its reason and new values'
);

select lives_ok(
  $$ select update_scenario(
       'd1000000-0000-0000-0000-000000000002', 'pgTAP scenario window scenario', null,
       null, null, 'pending', null, 'pgTAP: reverted to the trip''s window'
     ) $$,
  'the override can be cleared again, inheriting the trip''s window'
);

-- A second account can't touch it.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_scenario(
       'd1000000-0000-0000-0000-000000000002', 'x', null, '2028-07-02', '2028-07-25', 'estimate', null, 'not mine'
     ) $$,
  '%not found%',
  'a second account updating my scenario''s window gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is(
  (select departure_date from scenarios where id = 'd1000000-0000-0000-0000-000000000002'),
  null::date,
  'the second account''s attempt changed nothing'
);

select ok(has_function_privilege(
  'authenticated', 'update_scenario(uuid, text, uuid, date, date, info_state, uuid, text)', 'EXECUTE'
), 'authenticated can execute update_scenario');
select ok(not has_function_privilege(
  'anon', 'update_scenario(uuid, text, uuid, date, date, info_state, uuid, text)', 'EXECUTE'
), 'anon cannot execute update_scenario');

select * from finish();
rollback;
