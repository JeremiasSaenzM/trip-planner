-- pgTAP powers our test suite (supabase/tests/database). It ships in the
-- Supabase Postgres image already, so this just switches it on.
create extension if not exists pgtap with schema extensions;
