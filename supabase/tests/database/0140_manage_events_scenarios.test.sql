-- Optional event fields, update_event, update_scenario and
-- delete_scenario (20261019090000_manage_competitions_scenarios.sql,
-- renamed by 20261104090000_rename_competitions_to_events.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(40);

-- Optional columns

select col_is_null('events', 'city', 'events.city is nullable');
select col_is_null('events', 'country', 'events.country is nullable');
select col_is_null('events', 'start_date', 'events.start_date is nullable');
select col_is_null('events', 'end_date', 'events.end_date is nullable');
select col_is_null('events', 'timezone', 'events.timezone is nullable');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP manage trip', 'planning');

insert into sources (id, owner_id, provider, tier, observed_on) values (
  'a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'pgTAP fixture source', 1, '2026-10-01'
);

select lives_ok(
  $$ insert into events (id, trip_id, name) values (
       'a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Host not announced yet'
     ) $$,
  'an event with only a name (no city, country, dates or time zone) can be created'
);

-- The dates check: both or neither.

select throws_like(
  $$ insert into events (trip_id, name, start_date) values (
       'a1000000-0000-0000-0000-000000000001', 'Start only', '2028-07-01'
     ) $$,
  '%events_dates_together%',
  'a start date with no end date is refused'
);

select throws_like(
  $$ insert into events (trip_id, name, end_date) values (
       'a1000000-0000-0000-0000-000000000001', 'End only', '2028-07-07'
     ) $$,
  '%events_dates_together%',
  'an end date with no start date is refused'
);

select throws_like(
  $$ insert into events (trip_id, name, dates_state, dates_source_id) values (
       'a1000000-0000-0000-0000-000000000001', 'Confirmed nothing', 'confirmed', 'a1000000-0000-0000-0000-000000000002'
     ) $$,
  '%events_confirmed_dates_need_dates%',
  'confirmed dates with no dates are refused, even with a source'
);

select throws_like(
  $$ insert into events (trip_id, name, start_date, end_date) values (
       'a1000000-0000-0000-0000-000000000001', 'Backwards', '2028-07-07', '2028-07-01'
     ) $$,
  '%events_end_after_start%',
  'end before start is still refused when both dates are set'
);

-- An event with full dates, for the update_scenario linking tests below.
insert into events (
  id, trip_id, name, city, country, start_date, end_date, timezone
) values (
  'a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
  'Fully dated event', 'Fontvieux', 'France', '2027-07-05', '2027-07-11', 'Europe/Paris'
);

-- update_event

select throws_like(
  $$ select update_event(
       'a1000000-0000-0000-0000-000000000003', 'Renamed', null, null, null, null, null, null, 'pending', null, ''
     ) $$,
  '%reason is required%',
  'update_event rejects a blank reason'
);

select throws_like(
  $$ select update_event(
       'a1000000-0000-0000-0000-000000000003', 'Renamed', null, null, null, '2028-07-01', null, null, 'pending', null,
       'pgTAP: half a period'
     ) $$,
  '%events_dates_together%',
  'update_event still enforces both-or-neither dates'
);

select throws_like(
  $$ select update_event(
       'a1000000-0000-0000-0000-000000000003', 'Renamed', null, null, null, '2028-07-01', '2028-07-07', null,
       'confirmed', null, 'pgTAP: confirmed with no source'
     ) $$,
  '%events_dates_confirmed_needs_source%',
  'update_event still enforces confirmed dates need a source'
);

select lives_ok(
  $$ select update_event(
       'a1000000-0000-0000-0000-000000000003', 'Verenna event', 'Verenna', 'Italy', null, '2028-07-01',
       '2028-07-07', 'Europe/Rome', 'confirmed', 'a1000000-0000-0000-0000-000000000002', 'pgTAP: host announced'
     ) $$,
  'update_event succeeds with dates, a source and a reason'
);

select results_eq(
  $$ select name, city, start_date, end_date, dates_state::text
     from events where id = 'a1000000-0000-0000-0000-000000000003' $$,
  $$ values ('Verenna event'::text, 'Verenna'::text, '2028-07-01'::date, '2028-07-07'::date,
             'confirmed'::text) $$,
  'the event was updated'
);

select is(
  (select reason from change_log
   where table_name = 'events' and row_id = 'a1000000-0000-0000-0000-000000000003' and action = 'update'),
  'pgTAP: host announced',
  'the edit is in change_log with its reason'
);

select lives_ok(
  $$ select update_event(
       'a1000000-0000-0000-0000-000000000003', 'Verenna event', 'Verenna', 'Italy', null, null, null,
       'Europe/Rome', 'pending', null, 'pgTAP: dates withdrawn'
     ) $$,
  'update_event can clear both dates again'
);

-- Scenarios: one empty, one with a budget line, one with a payment
-- attached directly, one with a flight option.
insert into scenarios (id, trip_id, name, event_id) values
  ('a1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'Empty', null),
  ('a1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'Has a line',
   'a1000000-0000-0000-0000-000000000004'),
  ('a1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000001', 'Has a payment', null),
  ('a1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000001', 'Has a flight', null);

insert into budget_lines (
  id, trip_id, scenario_id, category, description,
  amount_min, amount_target, amount_conservative, currency, information_state
) values
  ('a1000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000012', 'A', 'Registration', 100, 100, 100, 'USD', 'estimate'),
  -- A shared line (no scenario), so the payment below is scoped to
  -- scenario 13 only through its own scenario_id.
  ('a1000000-0000-0000-0000-000000000022', 'a1000000-0000-0000-0000-000000000001',
   null, 'C', 'Shared lodging', 50, 50, 50, 'USD', 'estimate');

insert into payments (
  id, budget_line_id, scenario_id, description, total_amount, currency, refundability
) values (
  'a1000000-0000-0000-0000-000000000032', 'a1000000-0000-0000-0000-000000000022',
  'a1000000-0000-0000-0000-000000000013', 'Lodging deposit', 50, 'USD', 'refundable'
);

insert into flight_options (
  id, scenario_id, label, fare, currency, source_id, observed_on
) values (
  'a1000000-0000-0000-0000-000000000041', 'a1000000-0000-0000-0000-000000000014',
  'pgTAP fixture option', 900, 'USD', 'a1000000-0000-0000-0000-000000000002', '2026-10-01'
);

-- update_scenario

select throws_like(
  $$ select update_scenario('a1000000-0000-0000-0000-000000000011', 'Renamed', null, null, null, 'pending', null, '') $$,
  '%reason is required%',
  'update_scenario rejects a blank reason'
);

select lives_ok(
  $$ select update_scenario(
       'a1000000-0000-0000-0000-000000000011', 'Host TBA', 'a1000000-0000-0000-0000-000000000003',
       null, null, 'pending', null, 'pgTAP: linking an event'
     ) $$,
  'update_scenario renames and links an event to a scenario that had none'
);

select results_eq(
  $$ select name, event_id from scenarios where id = 'a1000000-0000-0000-0000-000000000011' $$,
  $$ values ('Host TBA'::text, 'a1000000-0000-0000-0000-000000000003'::uuid) $$,
  'the scenario was renamed and linked'
);

select lives_ok(
  $$ select update_scenario(
       'a1000000-0000-0000-0000-000000000011', 'Host TBA', null, null, null, 'pending', null, 'pgTAP: unlinking'
     ) $$,
  'update_scenario can unlink the event again'
);

select lives_ok(
  $$ select update_scenario(
       'a1000000-0000-0000-0000-000000000012', 'Has a line (renamed)', 'a1000000-0000-0000-0000-000000000004',
       null, null, 'pending', null, 'pgTAP: renaming only'
     ) $$,
  'update_scenario still allows renaming that scenario while keeping its event'
);

select throws_like(
  $$ select update_scenario(
       'a1000000-0000-0000-0000-000000000011', 'Host TBA', 'a1000000-0000-0000-0000-0000000000ff',
       null, null, 'pending', null, 'pgTAP: bad id'
     ) $$,
  '%not found%',
  'update_scenario refuses an event id that does not exist'
);

-- delete_scenario

select throws_like(
  $$ select delete_scenario('a1000000-0000-0000-0000-000000000011', '') $$,
  '%reason is required%',
  'delete_scenario rejects a blank reason'
);

select throws_like(
  $$ select delete_scenario('a1000000-0000-0000-0000-000000000012', 'pgTAP: trying anyway') $$,
  '%still has budget lines%',
  'delete_scenario refuses while budget lines reference it'
);

select throws_like(
  $$ select delete_scenario('a1000000-0000-0000-0000-000000000013', 'pgTAP: trying anyway') $$,
  '%still has payments%',
  'delete_scenario refuses while payments reference it'
);

select throws_like(
  $$ select delete_scenario('a1000000-0000-0000-0000-000000000014', 'pgTAP: trying anyway') $$,
  '%still has flight options%',
  'delete_scenario refuses while flight options reference it (they would cascade away silently)'
);

select is(
  (select count(*) from flight_options where id = 'a1000000-0000-0000-0000-000000000041')::int,
  1,
  'the flight option is still there after the refused delete'
);

select lives_ok(
  $$ select delete_scenario('a1000000-0000-0000-0000-000000000011', 'pgTAP: nothing references it') $$,
  'delete_scenario succeeds for a scenario nothing references'
);

select is(
  (select count(*) from scenarios where id = 'a1000000-0000-0000-0000-000000000011')::int,
  0,
  'the scenario is actually gone'
);

select is(
  (select reason from change_log
   where table_name = 'scenarios' and row_id = 'a1000000-0000-0000-0000-000000000011' and action = 'delete'),
  'pgTAP: nothing references it',
  'the delete is in change_log with its reason'
);

-- A second account can't touch any of the three RPCs.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_event(
       'a1000000-0000-0000-0000-000000000003', 'x', null, null, null, null, null, null, 'pending', null, 'not mine'
     ) $$,
  '%not found%',
  'a second account updating my event gets "not found"'
);

select throws_like(
  $$ select update_scenario('a1000000-0000-0000-0000-000000000012', 'x', null, null, null, 'pending', null, 'not mine') $$,
  '%not found%',
  'a second account updating my scenario gets "not found"'
);

select throws_like(
  $$ select delete_scenario('a1000000-0000-0000-0000-000000000012', 'not mine') $$,
  '%not found%',
  'a second account deleting my scenario gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- Grants: authenticated can call every RPC here, anon can't.
select ok(has_function_privilege('authenticated',
  'update_event(uuid, text, text, text, text, date, date, text, info_state, uuid, text)', 'EXECUTE'),
  'authenticated can execute update_event');
select ok(not has_function_privilege('anon',
  'update_event(uuid, text, text, text, text, date, date, text, info_state, uuid, text)', 'EXECUTE'),
  'anon cannot execute update_event');
select ok(has_function_privilege(
  'authenticated', 'update_scenario(uuid, text, uuid, date, date, info_state, uuid, text)', 'EXECUTE'
), 'authenticated can execute update_scenario');
select ok(not has_function_privilege(
  'anon', 'update_scenario(uuid, text, uuid, date, date, info_state, uuid, text)', 'EXECUTE'
), 'anon cannot execute update_scenario');
select ok(has_function_privilege('authenticated', 'delete_scenario(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_scenario');
select ok(not has_function_privilege('anon', 'delete_scenario(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_scenario');

select * from finish();
rollback;
