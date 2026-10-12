create table sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  provider text not null,
  tier smallint not null,
  url text,
  observed_on date not null,
  applicable_period daterange,
  notes text,
  created_at timestamptz not null default now(),
  constraint sources_tier_range check (tier between 1 and 6)
);

alter table sources enable row level security;

create policy "owner_all" on sources
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
