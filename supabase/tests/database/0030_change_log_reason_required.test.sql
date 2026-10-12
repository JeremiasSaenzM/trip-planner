-- Phase 6 writes (the future Claude/MCP bridge) skip the edit UI
-- entirely, so "you must explain why" has to live in the database, not
-- a form. app.actor defaults to 'app' when unset, so this exercises the
-- normal path every non-seed writer goes through.
begin;
set search_path = public, extensions;
select plan(4);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select throws_like(
  $$ update trips set name = 'renamed without reason' where id = '20000000-0000-0000-0000-000000000001' $$,
  '%reason is required%',
  'updating without a reason is rejected'
);

select is(
  (select name from trips where id = '20000000-0000-0000-0000-000000000001'),
  'Fictional 2027 choir trip',
  'the trip name is unchanged after the rejected update'
);

select set_config('app.change_reason', 'pgTAP test: proving the reason requirement works', true);

select lives_ok(
  $$ update trips set name = 'renamed with reason' where id = '20000000-0000-0000-0000-000000000001' $$,
  'updating with a reason set succeeds'
);

select is(
  (select name from trips where id = '20000000-0000-0000-0000-000000000001'),
  'renamed with reason',
  'the trip name was actually updated once a reason was given'
);

select * from finish();
rollback;
