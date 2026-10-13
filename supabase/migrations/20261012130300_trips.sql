create table trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  name text not null,
  status trip_status not null default 'planning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_trips_set_updated_at
before update on trips
for each row execute function trigger_set_updated_at();

alter table trips enable row level security;

create policy "owner_all" on trips
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
