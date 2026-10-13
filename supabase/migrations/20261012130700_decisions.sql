create table decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  trip_id uuid not null references trips (id) on delete cascade,
  competition_id uuid references competitions (id),
  title text not null,
  rationale text,
  decided_on date not null default current_date,
  decided_by text not null default 'traveler',
  reversible boolean not null default true,
  superseded_by uuid references decisions (id),
  source_id uuid references sources (id),
  created_at timestamptz not null default now(),
  constraint decisions_decided_by_values
    check (decided_by in ('traveler', 'choir_director', 'other'))
);

alter table decisions enable row level security;

create policy "owner_all" on decisions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
