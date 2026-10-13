-- A candidate competition under a trip. start_date is the first official
-- festival day, end_date the final official festival day -- hard
-- constraint 2 is "land before start_date begins, depart after end_date
-- ends", in the competition's own time zone. What happens during the
-- festival (which days you have an activity) does not matter to that
-- check, so there is deliberately no "first required activity" column.
create table competitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  trip_id uuid not null references trips (id) on delete cascade,
  name text not null,
  city text not null,
  country text not null,
  venue text,
  start_date date not null,
  end_date date not null,
  timezone text not null,
  dates_state info_state not null default 'pending',
  dates_source_id uuid references sources (id),
  acceptance_status acceptance_status not null default 'pending',
  acceptance_decided_on date,
  acceptance_source_id uuid references sources (id),
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_end_after_start check (end_date >= start_date),
  constraint competitions_dates_confirmed_needs_source
    check (dates_state <> 'confirmed' or dates_source_id is not null)
);

-- Only one candidate competition per trip can be "the" selected one.
create unique index competitions_one_selected_per_trip
  on competitions (trip_id)
  where is_selected;

create trigger trg_competitions_set_updated_at
before update on competitions
for each row execute function trigger_set_updated_at();

alter table competitions enable row level security;

create policy "owner_all" on competitions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
