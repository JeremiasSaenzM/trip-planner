-- Phase 6.5: flights (20261028090000_flight_option_status_and_links.sql,
-- 20261028090100_proposal_ops_flights_apply.sql). Covers the
-- at-most-one-selected-or-booked partial unique index, the new/changed
-- RPCs, decisions.flight_option_id's rationale constraint, and the
-- three new proposal ops round-tripping through approve_proposal().
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(45);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('12000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP fixture trip', 'planning');
insert into competitions (id, trip_id, name) values (
  '12000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000001', 'pgTAP fixture competition'
);
insert into scenarios (id, owner_id, trip_id, name, competition_id) values (
  '12000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001', 'pgTAP fixture scenario', '12000000-0000-0000-0000-000000000002'
);
insert into sources (id, owner_id, provider, tier, observed_on) values (
  '12000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'pgTAP fare source', 2, '2026-10-01'
);
insert into locations (id, owner_id, name) values
  ('12000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Testville'),
  ('12000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'Home');
insert into stays (id, owner_id, scenario_id, location_id, start_date, nights, kind, information_state) values (
  '12000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-00000000000a', '2027-07-01', 5, 'festival', 'estimate'
);
insert into movements (id, owner_id, scenario_id, sequence, from_location_id, to_location_id, depart_date, arrive_date, mode, information_state) values (
  '12000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000003', 1, '12000000-0000-0000-0000-00000000000b', '12000000-0000-0000-0000-00000000000a',
  '2027-07-01', '2027-07-01', 'plane', 'estimate'
);
insert into flight_options (id, owner_id, scenario_id, label, fare, currency, source_id, observed_on) values (
  '12000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000003', 'pgTAP option one', 500, 'USD',
  '12000000-0000-0000-0000-000000000004', '2026-10-01'
);
insert into flight_options (id, owner_id, scenario_id, label, fare, currency, source_id, observed_on) values (
  '12000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000003', 'pgTAP option two', 600, 'USD',
  '12000000-0000-0000-0000-000000000004', '2026-10-01'
);
insert into flight_segments (id, owner_id, flight_option_id, direction, segment_order, from_airport, to_airport, from_country, to_country, depart_at, arrive_at) values (
  '12000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000007', 'outbound', 1, 'MAD', 'CDG', 'ES', 'FR',
  '2027-07-01T06:00:00Z', '2027-07-01T08:00:00Z'
);

-- At most one selected/booked option per scenario (partial unique index).
-- Raw updates, not the RPC, so the change_log trigger needs its own
-- reason set first -- same as any other direct UPDATE in these tests.
select set_config('app.change_reason', 'pgTAP: exercising the partial unique index', true);

select lives_ok(
  $$ update flight_options set status = 'selected' where id = '12000000-0000-0000-0000-000000000007' $$,
  'the first option can be marked selected'
);
select throws_like(
  $$ update flight_options set status = 'selected' where id = '12000000-0000-0000-0000-000000000008' $$,
  '%flight_options_one_selected_or_booked_per_scenario%',
  'a second selected option in the same scenario is refused'
);
select throws_like(
  $$ update flight_options set status = 'booked' where id = '12000000-0000-0000-0000-000000000008' $$,
  '%flight_options_one_selected_or_booked_per_scenario%',
  'booked collides with an already-selected option too'
);
select lives_ok(
  $$ update flight_options set status = 'candidate' where id = '12000000-0000-0000-0000-000000000007' $$,
  'freeing up the slot lets the other option take it'
);
select lives_ok(
  $$ update flight_options set status = 'booked' where id = '12000000-0000-0000-0000-000000000008' $$,
  'option two can now be marked booked'
);
select lives_ok(
  $$ update flight_options set status = 'candidate' where id = '12000000-0000-0000-0000-000000000008' $$,
  'back to candidate, for the RPC tests below'
);

-- update_flight_option / delete_flight_option

select throws_like(
  $$ select update_flight_option(
       '12000000-0000-0000-0000-000000000007', 'Renamed', 500, 0, 0, 'USD', 'estimate',
       '12000000-0000-0000-0000-000000000004', '2026-10-01', 'included', false, 'unknown', true,
       'candidate', null, null, ''
     ) $$,
  '%reason is required%',
  'update_flight_option rejects a blank reason'
);

select lives_ok(
  $$ select update_flight_option(
       '12000000-0000-0000-0000-000000000007', 'Renamed via Doha', 520, 0, 30, 'USD', 'estimate',
       '12000000-0000-0000-0000-000000000004', '2026-10-01', 'included', false, 'non_refundable', true,
       'selected', 'ABC123', null, 'pgTAP: updating it'
     ) $$,
  'update_flight_option succeeds with a real reason'
);

select results_eq(
  $$ select label, fare, status, booking_reference from flight_options where id = '12000000-0000-0000-0000-000000000007' $$,
  $$ values ('Renamed via Doha'::text, 520::numeric, 'selected'::flight_option_status, 'ABC123'::text) $$,
  'the option was actually updated'
);

select throws_like(
  $$ select delete_flight_option('12000000-0000-0000-0000-000000000008', '') $$,
  '%reason is required%',
  'delete_flight_option rejects a blank reason'
);

select lives_ok(
  $$ select delete_flight_option('12000000-0000-0000-0000-000000000008', 'pgTAP: removing the unused candidate') $$,
  'delete_flight_option succeeds with a real reason'
);

select is(
  (select count(*) from flight_options where id = '12000000-0000-0000-0000-000000000008')::int, 0,
  'the option is actually gone'
);

-- delete_flight_segment

select throws_like(
  $$ select delete_flight_segment('12000000-0000-0000-0000-000000000009', '') $$,
  '%reason is required%',
  'delete_flight_segment rejects a blank reason'
);
select lives_ok(
  $$ select delete_flight_segment('12000000-0000-0000-0000-000000000009', 'pgTAP: removing it') $$,
  'delete_flight_segment succeeds with a real reason'
);
select is(
  (select count(*) from flight_segments where id = '12000000-0000-0000-0000-000000000009')::int, 0,
  'the segment is actually gone'
);

-- update_stay / update_movement's new flight_option_id parameter

select lives_ok(
  $$ select update_stay(
       '12000000-0000-0000-0000-000000000005', '12000000-0000-0000-0000-00000000000a', '2027-07-01', 5, 'festival',
       null, 'estimate', null, null, '12000000-0000-0000-0000-000000000007', 'pgTAP: linking the flight'
     ) $$,
  'update_stay accepts a flight_option_id'
);
select results_eq(
  $$ select flight_option_id from stays where id = '12000000-0000-0000-0000-000000000005' $$,
  $$ values ('12000000-0000-0000-0000-000000000007'::uuid) $$,
  'the stay is actually linked to the option'
);
select lives_ok(
  $$ select update_movement(
       '12000000-0000-0000-0000-000000000006', 1, '12000000-0000-0000-0000-00000000000b', '12000000-0000-0000-0000-00000000000a',
       '2027-07-01', null, '2027-07-01', null,
       'plane', null, null, 'estimate', null, null, '12000000-0000-0000-0000-000000000007', 'pgTAP: linking the flight'
     ) $$,
  'update_movement accepts a flight_option_id'
);
select results_eq(
  $$ select flight_option_id from movements where id = '12000000-0000-0000-0000-000000000006' $$,
  $$ values ('12000000-0000-0000-0000-000000000007'::uuid) $$,
  'the movement is actually linked to the option'
);

-- decisions.flight_option_id needs a rationale

select throws_like(
  $$ insert into decisions (id, owner_id, trip_id, competition_id, flight_option_id, title, decided_by)
     values ('12000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001',
             '12000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002',
             '12000000-0000-0000-0000-000000000007', 'pgTAP: missing rationale', 'traveler') $$,
  '%decisions_flight_risk_needs_rationale%',
  'a decision naming a flight option needs a rationale'
);
select lives_ok(
  $$ insert into decisions (id, owner_id, trip_id, competition_id, flight_option_id, title, rationale, decided_by)
     values ('12000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001',
             '12000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002',
             '12000000-0000-0000-0000-000000000007', 'pgTAP accept the risk', 'pgTAP: non-refundable before acceptance',
             'traveler') $$,
  'a decision naming a flight option with a rationale is accepted'
);

-- A second account can't touch any of these RPCs. Checked while option
-- ...0007 still exists -- otherwise "not found" would be true merely
-- because the row is gone, not because RLS excluded it.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select throws_like(
  $$ select update_flight_option(
       '12000000-0000-0000-0000-000000000007', 'x', 1, 0, 0, 'USD', 'estimate', null, '2026-10-01',
       'included', false, 'unknown', true, 'candidate', null, null, 'not mine'
     ) $$,
  '%not found%',
  'a second account updating my flight option gets "not found"'
);
select throws_like(
  $$ select delete_flight_option('12000000-0000-0000-0000-000000000007', 'not mine') $$,
  '%not found%',
  'a second account deleting my flight option gets "not found"'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

-- Deleting the option it names only clears the pointer, same as payment_id.
select lives_ok(
  $$ select delete_flight_option('12000000-0000-0000-0000-000000000007', 'pgTAP: removing the booked option') $$,
  'delete_flight_option succeeds even while a decision names it'
);
select results_eq(
  $$ select flight_option_id from decisions where id = '12000000-0000-0000-0000-000000000011' $$,
  $$ values (null::uuid) $$,
  'the decision survives, with its pointer cleared'
);

-- Grants: authenticated can execute every new/changed RPC here, anon can't.
select ok(has_function_privilege('authenticated',
  'update_flight_option(uuid, text, numeric, numeric, numeric, text, info_state, uuid, date, flight_baggage, boolean, refundability, boolean, flight_option_status, text, text, text)',
  'EXECUTE'), 'authenticated can execute update_flight_option');
select ok(not has_function_privilege('anon',
  'update_flight_option(uuid, text, numeric, numeric, numeric, text, info_state, uuid, date, flight_baggage, boolean, refundability, boolean, flight_option_status, text, text, text)',
  'EXECUTE'), 'anon cannot execute update_flight_option');
select ok(has_function_privilege('authenticated', 'delete_flight_option(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_flight_option');
select ok(not has_function_privilege('anon', 'delete_flight_option(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_flight_option');
select ok(has_function_privilege('authenticated', 'delete_flight_segment(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_flight_segment');
select ok(not has_function_privilege('anon', 'delete_flight_segment(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_flight_segment');

-- Import proposals: create_flight_option / create_flight_segment /
-- update_flight_option round-trip through approve_proposal(). The
-- update needs a second batch, pasted after the first is approved --
-- a proposal can't update a row that only exists as {item: n} inside
-- its own still-pending batch (create_proposal_batch's target-exists
-- check runs at paste time, before anything in the batch is approved).
select lives_ok(
  $$ select create_proposal_batch(
       '12000000-0000-0000-0000-000000000001', 'pgTAP flight batch', '{"raw": "as pasted"}',
       '[
         {"position": 0, "ref": "fo1", "op": "create_flight_option", "reason": "pgTAP: new candidate fare",
          "payload": {"data": {
            "scenario": {"id": "12000000-0000-0000-0000-000000000003"},
            "label": "pgTAP proposed option",
            "fare": 700, "bagFee": 0, "mandatoryFees": 40, "currency": "USD",
            "informationState": "estimate",
            "source": {"id": "12000000-0000-0000-0000-000000000004"},
            "observedOn": "2026-10-20", "baggage": "included", "separateTickets": false,
            "refundability": "non_refundable", "competitionRelated": true
          }}, "dependsOn": []},
         {"position": 1, "ref": "fs1", "op": "create_flight_segment", "reason": "pgTAP: its only segment",
          "payload": {"data": {
            "flightOption": {"item": 0}, "direction": "outbound", "segmentOrder": 1,
            "fromAirport": "MAD", "toAirport": "CDG", "fromCountry": "ES", "toCountry": "FR",
            "departAt": "2027-07-01T06:00:00Z", "arriveAt": "2027-07-01T08:00:00Z", "isTechnicalStop": false
          }}, "dependsOn": [0]}
       ]'
     ) $$,
  'a batch proposing a flight option and its segment is saved'
);

select lives_ok(
  $$ select approve_proposal(id) from proposal_items
     where batch_id = (select id from proposal_batches where note = 'pgTAP flight batch') and position = 0 $$,
  'approving create_flight_option succeeds'
);
select lives_ok(
  $$ select approve_proposal(id) from proposal_items
     where batch_id = (select id from proposal_batches where note = 'pgTAP flight batch') and position = 1 $$,
  'approving create_flight_segment (depending on item 0) succeeds'
);

select lives_ok(
  $$ select create_proposal_batch(
       '12000000-0000-0000-0000-000000000001', 'pgTAP flight fare update', '{"raw": "as pasted"}',
       format(
         '[{"position": 0, "op": "update_flight_option", "targetId": "%s", "reason": "pgTAP: a lower fare was found",
            "payload": {"changes": {"fare": {"from": 700, "to": 650}}}, "dependsOn": []}]',
         (select result_id from proposal_items
          where batch_id = (select id from proposal_batches where note = 'pgTAP flight batch') and position = 0)
       )::jsonb
     ) $$,
  'a follow-up batch updating the now-real option is saved'
);
select lives_ok(
  $$ select approve_proposal(id) from proposal_items
     where batch_id = (select id from proposal_batches where note = 'pgTAP flight fare update') and position = 0 $$,
  'approving update_flight_option succeeds'
);

select results_eq(
  $$ select fo.label, fo.fare, fs.from_airport, fs.to_airport
     from flight_options fo join flight_segments fs on fs.flight_option_id = fo.id
     where fo.id = (
       select result_id from proposal_items
       where batch_id = (select id from proposal_batches where note = 'pgTAP flight batch') and position = 0
     ) $$,
  $$ values ('pgTAP proposed option'::text, 650::numeric, 'MAD'::text, 'CDG'::text) $$,
  'the proposed option, its segment, and the fare update all actually landed'
);

-- Targeted by row_id, not "most recent" -- changed_at is now(), which
-- is frozen for the whole transaction, so every row this file inserts
-- shares one timestamp and "order by changed_at desc" would pick an
-- arbitrary tied row instead of this one.
select is(
  (select actor from change_log
   where table_name = 'flight_options' and action = 'insert'
     and row_id = (
       select result_id from proposal_items
       where batch_id = (select id from proposal_batches where note = 'pgTAP flight batch') and position = 0
     )
   limit 1)::text,
  'claude',
  'the created option is attributed to claude in the audit log'
);

-- update_stay / update_movement: linking to a flight option through a
-- proposal (20261028090200_proposal_ops_flight_option_links.sql) --
-- the same field the Scenario page's own "Flight option" picker sets,
-- now reachable through /import too. Options ...0007/...0008 are gone
-- by this point in the file (deleted above to exercise
-- delete_flight_option), so this links to the option the earlier
-- "pgTAP flight batch" proposal created instead, which outlives them.
select lives_ok(
  $$ select create_proposal_batch(
       '12000000-0000-0000-0000-000000000001', 'pgTAP flight option links', '{"raw": "as pasted"}',
       format(
         '[{"position": 0, "ref": "link-stay", "op": "update_stay", "reason": "pgTAP: linking the booked option",
            "targetId": "12000000-0000-0000-0000-000000000005",
            "payload": {"changes": {"flightOption": {"from": null, "to": {"id": "%1$s"}}}}},
           {"position": 1, "ref": "link-move", "op": "update_movement", "reason": "pgTAP: linking the booked option",
            "targetId": "12000000-0000-0000-0000-000000000006",
            "payload": {"changes": {"flightOption": {"from": null, "to": {"id": "%1$s"}}}}}
         ]',
         (select result_id from proposal_items
          where batch_id = (select id from proposal_batches where note = 'pgTAP flight batch') and position = 0)
       )::jsonb
     ) $$,
  'a batch linking a stay and a movement to an existing flight option is saved'
);

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'link-stay')) $$,
  'approving the stay''s flightOption link succeeds'
);
select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'link-move')) $$,
  'approving the movement''s flightOption link succeeds'
);

select results_eq(
  $$ select flight_option_id from stays where id = '12000000-0000-0000-0000-000000000005' $$,
  $$ select result_id from proposal_items
     where batch_id = (select id from proposal_batches where note = 'pgTAP flight batch') and position = 0 $$,
  'the stay is now linked to the flight option'
);
select results_eq(
  $$ select flight_option_id from movements where id = '12000000-0000-0000-0000-000000000006' $$,
  $$ select result_id from proposal_items
     where batch_id = (select id from proposal_batches where note = 'pgTAP flight batch') and position = 0 $$,
  'the movement is now linked to the flight option'
);

-- The stay is already linked (to the same option) at this point, so a
-- proposal still claiming "from": null is stale regardless of what
-- "to" resolves to -- proposal_merge_changes catches this before it
-- ever calls proposal_ref.
select lives_ok(
  $$ select create_proposal_batch(
       '12000000-0000-0000-0000-000000000001', 'pgTAP flight option link stale', '{}',
       format(
         '[{"position": 0, "ref": "link-stay-stale", "op": "update_stay", "reason": "pgTAP: written against old data",
            "targetId": "12000000-0000-0000-0000-000000000005",
            "payload": {"changes": {"flightOption": {"from": null, "to": {"id": "%1$s"}}}}}]',
         (select result_id from proposal_items
          where batch_id = (select id from proposal_batches where note = 'pgTAP flight batch') and position = 0)
       )::jsonb
     ) $$,
  'a batch proposing a stale flightOption change is saved'
);
select throws_like(
  $$ select approve_proposal((select id from proposal_items where ref = 'link-stay-stale')) $$,
  '%Proposal is out of date: flightOption is now%',
  'a flightOption change against a stale "from" is refused, same as budgetLine/source'
);

select * from finish();
rollback;
