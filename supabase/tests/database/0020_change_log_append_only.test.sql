-- change_log is append-only: the only legitimate writer is the SECURITY
-- DEFINER audit trigger, which runs as the table owner. authenticated
-- has select and nothing else on it (20261020090000_explicit_table_grants.sql),
-- so a direct insert, update or delete is refused outright by Postgres
-- -- before RLS (which has no write policy here either) is consulted.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select throws_like(
  $$ insert into change_log (owner_id, table_name, row_id, action, actor)
     values ('10000000-0000-0000-0000-000000000001', 'trips', '20000000-0000-0000-0000-000000000001', 'insert', 'app') $$,
  '%permission denied for table change_log%',
  'a direct insert into change_log is refused'
);

select throws_like(
  $$ update change_log set reason = 'tampered' where table_name = 'trips' and action = 'insert' $$,
  '%permission denied for table change_log%',
  'a direct update of change_log is refused'
);

select is(
  (select count(*) from change_log where table_name = 'trips' and action = 'insert' and reason = 'tampered')::int,
  0,
  'no change_log row was modified by that update'
);

select throws_like(
  $$ delete from change_log where table_name = 'trips' and action = 'insert' $$,
  '%permission denied for table change_log%',
  'a direct delete from change_log is refused'
);

select is(
  (select count(*) from change_log where table_name = 'trips' and action = 'insert')::int,
  1,
  'the trips insert log row still exists after the attempted delete'
);

select * from finish();
rollback;
