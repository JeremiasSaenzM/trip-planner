-- change_log has no insert/update/delete policy for anyone, including
-- its owner -- the only legitimate writer is the SECURITY DEFINER audit
-- trigger. Direct inserts must be rejected outright; direct updates and
-- deletes have no USING clause to match against, so they must silently
-- affect zero rows rather than touch anything.
begin;
set search_path = public, extensions;
select plan(5);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select throws_like(
  $$ insert into change_log (owner_id, table_name, row_id, action, actor)
     values ('10000000-0000-0000-0000-000000000001', 'trips', '20000000-0000-0000-0000-000000000001', 'insert', 'app') $$,
  '%row-level security policy%',
  'a direct insert into change_log is rejected by RLS'
);

select lives_ok(
  $$ update change_log set reason = 'tampered' where table_name = 'trips' and action = 'insert' $$,
  'an update statement against change_log does not raise (RLS just matches zero rows)'
);

select is(
  (select count(*) from change_log where table_name = 'trips' and action = 'insert' and reason = 'tampered')::int,
  0,
  'no change_log row was actually modified by that update'
);

select lives_ok(
  $$ delete from change_log where table_name = 'trips' and action = 'insert' $$,
  'a delete statement against change_log does not raise either'
);

select is(
  (select count(*) from change_log where table_name = 'trips' and action = 'insert')::int,
  1,
  'the trips insert log row still exists after the attempted delete'
);

select * from finish();
rollback;
