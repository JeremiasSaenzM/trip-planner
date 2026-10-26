-- Optional competition fields, update_competition, update_scenario and
-- delete_scenario (20261019090000_manage_competitions_scenarios.sql).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(41);

-- Optional columns

select col_is_null('competitions', 'city', 'competitions.city is nullable');
select col_is_null('competitions', 'country', 'competitions.country is nullable');
select col_is_null('competitions', 'start_date', 'competitions.start_date is nullable');
select col_is_null('competitions', 'end_date', 'competitions.end_date is nullable');
select col_is_null('competitions', 'timezone', 'competitions.timezone is nullable');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP manage trip', 'planning');

insert into sources (id, owner_id, provider, tier, observed_on) values (
  'a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'pgTAP fixture source', 1, '2026-10-01'
);

select lives_ok(
  $$ insert into competitions (id, trip_id, name) values (
       'a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Host not announced yet'
     ) $$,
  'a competition with only a name (no city, country, dates or time zone) can be created'
);

-- The dates check: both or neither.

select throws_like(
  $$ insert into competitions (trip_id, name, start_date) values (
       'a1000000-0000-0000-0000-000000000001', 'Start only', '2028-07-01'
     ) $$,
  '%competitions_dates_together%',
  'a start date with no end date is refused'
);

select throws_like(
  $$ insert into competitions (trip_id, name, end_date) values (
       'a1000000-0000-0000-0000-000000000001', 'End only', '2028-07-07'
     ) $$,
  '%competitions_dates_together%',
  'an end date with no start date is refused'
);

select throws_like(
  $$ insert into competitions (trip_id, name, dates_state, dates_source_id) values (
       'a1000000-0000-0000-0000-000000000001', 'Confirmed nothing', 'confirmed', 'a1000000-0000-0000-0000-000000000002'
     ) $$,
  '%competitions_confirmed_dates_need_dates%',
  'confirmed dates with no dates are refused, even with a source'
);

select throws_like(
  $$ insert into competitions (trip_id, name, start_date, end_date) values (
       'a1000000-0000-0000-0000-000000000001', 'Backwards', '2028-07-07', '2028-07-01'
     ) $$,
  '%competitions_end_after_start%',
  'end before start is still refused when both dates are set'
);

-- An accepted competition, for the update_scenario safeguard test below.
insert into competitions (
  id, trip_id, name, city, country, start_date, end_date, timezone, acceptance_status
) values (
  'a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
  'Accepted competition', 'Fontvieux', 'France', '2027-07-05', '2027-07-11', 'Europe/Paris', 'accepted'
);

-- update_competition

select throws_like(
  $$ select update_competition(
       'a1000000-0000-0000-0000-000000000003', 'Renamed', null, null, null, null, null, null, 'pending', null, ''
     ) $$,
  '%reason is required%',
  'update_competition rejects a blank reason'
);

select throws_like(
  $$ select update_competition(
       'a1000000-0000-0000-0000-000000000003', 'Renamed', null, null, null, '2028-07-01', null, null, 'pending', null,
       'pgTAP: half a period'
     ) $$,
  '%competitions_dates_together%',
  'update_competition still enforces both-or-neither dates'
);

select throws_like(
  $$ select update_competition(
       'a1000000-0000-0000-0000-000000000003', 'Renamed', null, null, null, '2028-07-01', '2028-07-07', null,
       'confirmed', null, 'pgTAP: confirmed with no source'
     ) $$,
  '%competitions_dates_confirmed_needs_source%',
  'update_competition still enforces confirmed dates need a source'
);

select lives_ok(
  $$ select update_competition(
       'a1000000-0000-0000-0000-000000000003', 'Verenna festival', 'Verenna', 'Italy', null, '2028-07-01',
       '2028-07-07', 'Europe/Rome', 'confirmed', 'a1000000-0000-0000-0000-000000000002', 'pgTAP: host announced'
     ) $$,
  'update_competition succeeds with dates, a source and a reason'
);

select results_eq(
  $$ select name, city, start_date, end_date, dates_state::text, acceptance_status::text
     from competitions where id = 'a1000000-0000-0000-0000-000000000003' $$,
  $$ values ('Verenna festival'::text, 'Verenna'::text, '2028-07-01'::date, '2028-07-07'::date,
             'confirmed'::text, 'pending'::text) $$,
  'the competition was updated, and acceptance_status was left alone'
);

select is(
  (select reason from change_log
   where table_name = 'competitions' and row_id = 'a1000000-0000-0000-0000-000000000003' and action = 'update'),
  'pgTAP: host announced',
  'the edit is in change_log with its reason'
);

select lives_ok(
  $$ select update_competition(
       'a1000000-0000-0000-0000-000000000003', 'Verenna festival', 'Verenna', 'Italy', null, null, null,
       'Europe/Rome', 'pending', null, 'pgTAP: dates withdrawn'
     ) $$,
  'update_competition can clear both dates again'
);

-- Scenarios: one empty, one with a budget line, one with a payment
-- attached directly, one with a flight option.
insert into scenarios (id, trip_id, name, competition_id) values
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

-- Committed, non-refundable and competition-related: allowed because
-- scenario 12's competition is accepted.
insert into payments (
  id, budget_line_id, description, total_amount, currency, refundability, competition_related, status
) values (
  'a1000000-0000-0000-0000-000000000031', 'a1000000-0000-0000-0000-000000000021',
  'Registration fee', 100, 'USD', 'non_refundable', true, 'committed'
);

insert into payments (
  id, budget_line_id, scenario_id, description, total_amount, currency, refundability, competition_related
) values (
  'a1000000-0000-0000-0000-000000000032', 'a1000000-0000-0000-0000-000000000022',
  'a1000000-0000-0000-0000-000000000013', 'Lodging deposit', 50, 'USD', 'refundable', false
);

insert into flight_options (
  id, scenario_id, label, fare, currency, source_id, observed_on
) values (
  'a1000000-0000-0000-0000-000000000041', 'a1000000-0000-0000-0000-000000000014',
  'pgTAP fixture option', 900, 'USD', 'a1000000-0000-0000-0000-000000000002', '2026-10-01'
);

-- update_scenario

select throws_like(
  $$ select update_scenario('a1000000-0000-0000-0000-000000000011', 'Renamed', null, '') $$,
  '%reason is required%',
  'update_scenario rejects a blank reason'
);

select lives_ok(
  $$ select update_scenario(
       'a1000000-0000-0000-0000-000000000011', 'Host TBA', 'a1000000-0000-0000-0000-000000000003',
       'pgTAP: linking a competition'
     ) $$,
  'update_scenario renames and links a competition to a scenario that had none'
);

select results_eq(
  $$ select name, competition_id from scenarios where id = 'a1000000-0000-0000-0000-000000000011' $$,
  $$ values ('Host TBA'::text, 'a1000000-0000-0000-0000-000000000003'::uuid) $$,
  'the scenario was renamed and linked'
);

select lives_ok(
  $$ select update_scenario('a1000000-0000-0000-0000-000000000011', 'Host TBA', null, 'pgTAP: unlinking') $$,
  'update_scenario can unlink the competition again'
);

select throws_like(
  $$ select update_scenario(
       'a1000000-0000-0000-0000-000000000012', 'Has a line', 'a1000000-0000-0000-0000-000000000003',
       'pgTAP: moving a committed payment under a pending competition'
     ) $$,
  '%committed non-refundable competition payments%',
  'update_scenario refuses to change the competition under a committed non-refundable payment'
);

select lives_ok(
  $$ select update_scenario(
       'a1000000-0000-0000-0000-000000000012', 'Has a line (renamed)', 'a1000000-0000-0000-0000-000000000004',
       'pgTAP: renaming only'
     ) $$,
  'update_scenario still allows renaming that scenario while keeping its competition'
);

select throws_like(
  $$ select update_scenario(
       'a1000000-0000-0000-0000-000000000011', 'Host TBA', 'a1000000-0000-0000-0000-0000000000ff', 'pgTAP: bad id'
     ) $$,
  '%not found%',
  'update_scenario refuses a competition id that does not exist'
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
  $$ select update_competition(
       'a1000000-0000-0000-0000-000000000003', 'x', null, null, null, null, null, null, 'pending', null, 'not mine'
     ) $$,
  '%not found%',
  'a second account updating my competition gets "not found"'
);

select throws_like(
  $$ select update_scenario('a1000000-0000-0000-0000-000000000012', 'x', null, 'not mine') $$,
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
  'update_competition(uuid, text, text, text, text, date, date, text, info_state, uuid, text)', 'EXECUTE'),
  'authenticated can execute update_competition');
select ok(not has_function_privilege('anon',
  'update_competition(uuid, text, text, text, text, date, date, text, info_state, uuid, text)', 'EXECUTE'),
  'anon cannot execute update_competition');
select ok(has_function_privilege('authenticated', 'update_scenario(uuid, text, uuid, text)', 'EXECUTE'),
  'authenticated can execute update_scenario');
select ok(not has_function_privilege('anon', 'update_scenario(uuid, text, uuid, text)', 'EXECUTE'),
  'anon cannot execute update_scenario');
select ok(has_function_privilege('authenticated', 'delete_scenario(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_scenario');
select ok(not has_function_privilege('anon', 'delete_scenario(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_scenario');

select * from finish();
rollback;
