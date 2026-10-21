-- trips' travel window columns and update_trip_travel_window
-- (20261022090000_trip_travel_window.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(16);

select col_is_null('trips', 'departure_date', 'trips.departure_date is nullable (falls back to the competition)');
select col_is_null('trips', 'return_date', 'trips.return_date is nullable');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, name) values ('b1000000-0000-0000-0000-000000000001', 'pgTAP travel window trip');
insert into sources (id, provider, tier, observed_on) values (
  'b1000000-0000-0000-0000-000000000002', 'pgTAP fixture source', 1, '2026-10-01'
);

select is(
  (select travel_dates_state::text from trips where id = 'b1000000-0000-0000-0000-000000000001'),
  'pending',
  'a new trip''s travel dates start out pending'
);

select throws_like(
  $$ select update_trip_travel_window(
       'b1000000-0000-0000-0000-000000000001', '2028-07-02', '2028-07-25', 'estimate', null, ''
     ) $$,
  '%reason is required%',
  'update_trip_travel_window rejects a blank reason'
);

select throws_like(
  $$ select update_trip_travel_window(
       'b1000000-0000-0000-0000-000000000001', '2028-07-25', '2028-07-02', 'estimate', null, 'pgTAP: backwards'
     ) $$,
  '%trips_return_after_departure%',
  'a return before the departure is refused'
);

select throws_like(
  $$ select update_trip_travel_window(
       'b1000000-0000-0000-0000-000000000001', '2028-07-02', '2028-07-25', 'confirmed', null, 'pgTAP: no source'
     ) $$,
  '%trips_travel_dates_confirmed_needs_source%',
  'confirmed travel dates need a source'
);

select throws_like(
  $$ select update_trip_travel_window(
       'b1000000-0000-0000-0000-000000000001', '2028-07-02', null, 'confirmed',
       'b1000000-0000-0000-0000-000000000002', 'pgTAP: half a window'
     ) $$,
  '%trips_confirmed_travel_dates_need_dates%',
  'confirmed travel dates need both dates, even with a source'
);

select lives_ok(
  $$ select update_trip_travel_window(
       'b1000000-0000-0000-0000-000000000001', '2028-07-02', null, 'estimate', null, 'pgTAP: departure only'
     ) $$,
  'a departure date alone is allowed while it is not confirmed'
);

select lives_ok(
  $$ select update_trip_travel_window(
       'b1000000-0000-0000-0000-000000000001', '2028-07-02', '2028-07-25', 'confirmed',
       'b1000000-0000-0000-0000-000000000002', 'pgTAP: flights booked'
     ) $$,
  'update_trip_travel_window succeeds with both dates, a source and a reason'
);

select results_eq(
  $$ select departure_date, return_date, travel_dates_state::text, name
     from trips where id = 'b1000000-0000-0000-0000-000000000001' $$,
  $$ values ('2028-07-02'::date, '2028-07-25'::date, 'confirmed'::text, 'pgTAP travel window trip'::text) $$,
  'the window was saved, and nothing else on the trip changed'
);

-- Looked up by its reason, not "latest by changed_at": changed_at is
-- now(), the same for every write in this one test transaction.
select ok(
  exists (
    select 1 from change_log
    where table_name = 'trips' and row_id = 'b1000000-0000-0000-0000-000000000001' and action = 'update'
      and reason = 'pgTAP: flights booked'
      and new_data ->> 'departure_date' = '2028-07-02'
      and new_data ->> 'travel_dates_state' = 'confirmed'
  ),
  'the edit is in change_log with its reason and new values'
);

select lives_ok(
  $$ select update_trip_travel_window(
       'b1000000-0000-0000-0000-000000000001', null, null, 'pending', null, 'pgTAP: cleared'
     ) $$,
  'the window can be cleared again'
);

-- A second account can't touch it.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_trip_travel_window(
       'b1000000-0000-0000-0000-000000000001', '2028-07-02', '2028-07-25', 'estimate', null, 'not mine'
     ) $$,
  '%not found%',
  'a second account updating my trip gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is(
  (select departure_date from trips where id = 'b1000000-0000-0000-0000-000000000001'),
  null::date,
  'the second account''s attempt changed nothing'
);

select ok(has_function_privilege('authenticated',
  'update_trip_travel_window(uuid, date, date, info_state, uuid, text)', 'EXECUTE'),
  'authenticated can execute update_trip_travel_window');
select ok(not has_function_privilege('anon',
  'update_trip_travel_window(uuid, date, date, info_state, uuid, text)', 'EXECUTE'),
  'anon cannot execute update_trip_travel_window');

select * from finish();
rollback;
