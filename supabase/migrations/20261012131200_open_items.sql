create table open_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  trip_id uuid not null references trips (id) on delete cascade,
  competition_id uuid references competitions (id),
  title text not null,
  description text,
  due_date date,
  dates_state info_state not null default 'pending',
  dates_source_id uuid references sources (id),
  category open_item_category not null,
  status open_item_status not null default 'open',
  related_budget_line_id uuid references budget_lines (id),
  related_payment_id uuid references payments (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint open_items_dates_confirmed_needs_source
    check (dates_state <> 'confirmed' or dates_source_id is not null)
);

alter table open_items enable row level security;

create policy "owner_all" on open_items
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
