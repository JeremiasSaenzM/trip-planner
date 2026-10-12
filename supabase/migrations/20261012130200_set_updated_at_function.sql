-- Shared BEFORE UPDATE trigger: every table with an updated_at column
-- attaches this so "when was this last touched" is never stale or
-- something the application has to remember to set itself.
create or replace function trigger_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
