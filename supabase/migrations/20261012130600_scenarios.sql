-- A scenario is one concrete plan under a trip: "Thornmere 2029" or
-- "Thornmere 2030 + Paris". budget_lines and payments that are specific
-- to a plan attach to a scenario; rows that apply no matter which plan
-- wins (scenario_id null on those tables) are shared across all of them.
create table scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  trip_id uuid not null references trips (id) on delete cascade,
  name text not null,
  competition_id uuid references competitions (id),
  includes_extension boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_scenarios_set_updated_at
before update on scenarios
for each row execute function trigger_set_updated_at();

alter table scenarios enable row level security;

create policy "owner_all" on scenarios
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
