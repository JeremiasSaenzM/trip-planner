-- update_trip (20261109090000_update_trip.sql) -- renames a trip and/or
-- changes its status. The travel window stays
-- update_trip_travel_window's own (0170_trip_travel_window.test.sql);
-- this only ever touches name and status.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(8);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, name) values ('b2000000-0000-0000-0000-000000000001', 'pgTAP update_trip trip');

select throws_like(
  $$ select update_trip('b2000000-0000-0000-0000-000000000001', 'Renamed', 'confirmed', '') $$,
  '%reason is required%',
  'update_trip rejects a blank reason'
);

select lives_ok(
  $$ select update_trip('b2000000-0000-0000-0000-000000000001', 'Renamed trip', 'confirmed', 'pgTAP: booked it') $$,
  'update_trip succeeds with a reason'
);

select results_eq(
  $$ select name, status::text from trips where id = 'b2000000-0000-0000-0000-000000000001' $$,
  $$ values ('Renamed trip'::text, 'confirmed'::text) $$,
  'the name and status were saved'
);

select ok(
  exists (
    select 1 from change_log
    where table_name = 'trips' and row_id = 'b2000000-0000-0000-0000-000000000001' and action = 'update'
      and reason = 'pgTAP: booked it'
      and new_data ->> 'name' = 'Renamed trip'
      and new_data ->> 'status' = 'confirmed'
  ),
  'the edit is in change_log with its reason and new values'
);

-- A second account can't touch it.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_trip('b2000000-0000-0000-0000-000000000001', 'Hijacked', 'cancelled', 'not mine') $$,
  '%not found%',
  'a second account updating my trip gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is(
  (select name from trips where id = 'b2000000-0000-0000-0000-000000000001'),
  'Renamed trip',
  'the second account''s attempt changed nothing'
);

select ok(has_function_privilege('authenticated',
  'update_trip(uuid, text, trip_status, text)', 'EXECUTE'),
  'authenticated can execute update_trip');
select ok(not has_function_privilege('anon',
  'update_trip(uuid, text, trip_status, text)', 'EXECUTE'),
  'anon cannot execute update_trip');

select * from finish();
rollback;
