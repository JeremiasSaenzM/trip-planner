-- Phase 6.5b: locations and time zones (20261029090000_locations.sql,
-- 20261029090100_locations_backfill.sql, 20261029090200_proposal_ops_locations.sql).
-- Covers the zone-validation trigger, update_location/delete_location,
-- and create_location/update_location round-tripping through
-- approve_proposal().
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(23);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into trips (id, owner_id, name, status) values
  ('d2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pgTAP locations trip', 'planning');
insert into scenarios (id, owner_id, trip_id, name) values (
  'd2000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001', 'pgTAP locations scenario'
);

-- Zone-validation trigger: rejects a typo'd IANA name on insert and on
-- update, accepts a real one, and accepts null (the zone is a visible
-- gap, not a guess, until someone fills it in).

select throws_like(
  $$ insert into locations (owner_id, name, timezone) values (
       '10000000-0000-0000-0000-000000000001', 'pgTAP bad zone on insert', 'Europe/Pairs'
     ) $$,
  '%Not a recognized time zone%',
  'inserting a location with a typo''d time zone is refused'
);

select lives_ok(
  $$ insert into locations (id, owner_id, name, timezone) values (
       'd2000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'pgTAP Paris', 'Europe/Paris'
     ) $$,
  'inserting a location with a real IANA zone succeeds'
);

select lives_ok(
  $$ insert into locations (id, owner_id, name) values (
       'd2000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'pgTAP no zone yet'
     ) $$,
  'inserting a location with no zone at all succeeds'
);

select throws_like(
  $$ update locations set timezone = 'Europe/Pairs' where id = 'd2000000-0000-0000-0000-000000000011' $$,
  '%Not a recognized time zone%',
  'updating a location to a typo''d time zone is also refused'
);

-- update_location / delete_location

select throws_like(
  $$ select update_location('d2000000-0000-0000-0000-000000000011', 'pgTAP renamed', 'Europe/London', 'A note', '') $$,
  '%reason is required%',
  'update_location rejects a blank reason'
);

select lives_ok(
  $$ select update_location('d2000000-0000-0000-0000-000000000011', 'pgTAP renamed', 'Europe/London', 'A note', 'pgTAP: filling in the zone') $$,
  'update_location succeeds with a real reason'
);

select results_eq(
  $$ select name, timezone, notes from locations where id = 'd2000000-0000-0000-0000-000000000011' $$,
  $$ values ('pgTAP renamed'::text, 'Europe/London'::text, 'A note'::text) $$,
  'the location was actually updated'
);

select lives_ok(
  $$ select delete_location('d2000000-0000-0000-0000-000000000011', 'pgTAP: nothing uses it') $$,
  'delete_location succeeds when nothing references the location'
);

insert into stays (id, owner_id, scenario_id, location_id, start_date, nights) values (
  'd2000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000010', '2027-07-01', 5
);

select throws_like(
  $$ select delete_location('d2000000-0000-0000-0000-000000000010', 'pgTAP: trying anyway') $$,
  '%still used by a stay%',
  'delete_location refuses while a stay still references it'
);

select lives_ok(
  $$ select delete_stay('d2000000-0000-0000-0000-000000000012', 'pgTAP: freeing up the location') $$,
  'the referencing stay can be removed'
);

insert into movements (id, owner_id, scenario_id, sequence, from_location_id, to_location_id, depart_date, arrive_date) values (
  'd2000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000002', 1, 'd2000000-0000-0000-0000-000000000010', 'd2000000-0000-0000-0000-000000000010',
  '2027-07-01', '2027-07-01'
);

select throws_like(
  $$ select delete_location('d2000000-0000-0000-0000-000000000010', 'pgTAP: trying anyway') $$,
  '%still used by a movement%',
  'delete_location refuses while a movement still references it'
);

select lives_ok(
  $$ select delete_movement('d2000000-0000-0000-0000-000000000013', 'pgTAP: freeing up the location') $$,
  'the referencing movement can be removed'
);

select lives_ok(
  $$ select delete_location('d2000000-0000-0000-0000-000000000010', 'pgTAP: now nothing references it') $$,
  'delete_location succeeds once nothing references it any more'
);

-- Import proposals: create_location / update_location round-trip
-- through approve_proposal(), same shape as create_source/update_source.

select lives_ok(
  $$ select create_proposal_batch(
       'd2000000-0000-0000-0000-000000000001', 'pgTAP locations batch', '{"raw": "as pasted"}',
       '[{"position": 0, "ref": "loc1", "op": "create_location", "reason": "pgTAP: a new place",
          "payload": {"data": {"name": "pgTAP Verenna", "timezone": "Europe/Rome", "notes": "Via Claude"}}, "dependsOn": []}]'
     ) $$,
  'a batch proposing a new location is saved'
);

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'loc1')) $$,
  'approving create_location succeeds'
);

select results_eq(
  $$ select name, timezone from locations where id = (select result_id from proposal_items where ref = 'loc1') $$,
  $$ values ('pgTAP Verenna'::text, 'Europe/Rome'::text) $$,
  'the proposed location was actually created'
);

select lives_ok(
  $$ select create_proposal_batch(
       'd2000000-0000-0000-0000-000000000001', 'pgTAP locations update batch', '{}',
       format(
         '[{"position": 0, "ref": "loc1-update", "op": "update_location", "reason": "pgTAP: zone confirmed",
            "targetId": "%s",
            "payload": {"changes": {"timezone": {"from": "Europe/Rome", "to": "Europe/Paris"}}}}]',
         (select result_id from proposal_items where ref = 'loc1')
       )::jsonb
     ) $$,
  'a follow-up batch updating the now-real location is saved'
);

select lives_ok(
  $$ select approve_proposal((select id from proposal_items where ref = 'loc1-update')) $$,
  'approving update_location succeeds'
);

select results_eq(
  $$ select timezone from locations where id = (select result_id from proposal_items where ref = 'loc1') $$,
  $$ values ('Europe/Paris'::text) $$,
  'the update actually landed'
);

-- Grants

select ok(has_function_privilege('authenticated', 'update_location(uuid, text, text, text, text)', 'EXECUTE'),
  'authenticated can execute update_location');
select ok(not has_function_privilege('anon', 'update_location(uuid, text, text, text, text)', 'EXECUTE'),
  'anon cannot execute update_location');
select ok(has_function_privilege('authenticated', 'delete_location(uuid, text)', 'EXECUTE'),
  'authenticated can execute delete_location');
select ok(not has_function_privilege('anon', 'delete_location(uuid, text)', 'EXECUTE'),
  'anon cannot execute delete_location');

select * from finish();
rollback;
