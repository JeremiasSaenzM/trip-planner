-- An empty table whose mere presence of a row marks "this database is
-- the demo project." Shared schema (applies to production too, which
-- is fine -- an empty table is inert), but the row itself is only ever
-- inserted by hand, directly in the demo project's SQL editor, never by
-- any migration, workflow, or script. See supabase/demo/reseed.sql,
-- which refuses to run at all if this table has no row.
create table _demo_marker (
  id int primary key
);

alter table _demo_marker enable row level security;
-- Deliberately no policies: nobody via the API can read or write this,
-- only a direct Postgres connection (which bypasses RLS as table owner).
