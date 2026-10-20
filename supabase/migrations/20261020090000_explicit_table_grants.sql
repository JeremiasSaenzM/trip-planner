-- Explicit Data API grants for every table in public.
--
-- Until now no migration granted anything on a table: Supabase's default
-- privileges did it automatically, giving anon, authenticated and
-- service_role every privilege (select, insert, update, delete, truncate,
-- references, trigger) on every new table. RLS is what actually kept
-- data private. From 30 October 2026 new tables -- including every table
-- `supabase db reset` rebuilds in CI -- get no grants at all, so the app
-- would hit "permission denied" there while the hosted database (whose
-- tables already have their grants) kept working.
--
-- So each table now states exactly what it grants, and the same grants
-- hold on hosted, local and CI whichever default is in effect. Revoking
-- everything first matters: under the old default a table already has
-- far more than this, and granting alone would leave the rest in place.
--
-- anon gets nothing. This app has no logged-out data access (the proxy
-- redirects every logged-out request to /login, and the e2e workflow
-- uses service_role only for the Auth admin API, never for a table), so
-- RLS was blocking anon on every row already; now Postgres refuses it
-- before RLS is even consulted.

revoke all on table
  trips, sources, competitions, scenarios, decisions, budget_lines,
  payments, savings_entries, fx_rates, open_items, flight_options,
  flight_segments, change_log
from anon, authenticated, service_role;

-- Plan data: read and write, row by row. RLS still limits authenticated
-- to its own rows; service_role (the admin key, which bypasses RLS) gets
-- the same four privileges. truncate, references and trigger stay with
-- the table owner -- the app never needs them, and truncate in
-- particular ignores RLS entirely.
grant select, insert, update, delete on table
  trips, sources, competitions, scenarios, decisions, budget_lines,
  payments, savings_entries, fx_rates, open_items, flight_options,
  flight_segments
to authenticated, service_role;

-- change_log is append-only: its only writer is change_log_capture(),
-- a security definer trigger that runs as the table owner, so no role
-- needs to insert, update or delete here directly -- not even
-- service_role. Before this, append-only rested on RLS having no write
-- policies; now a direct write is refused outright.
grant select on table change_log to authenticated, service_role;
