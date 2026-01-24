create table if not exists public.discovery_production_items (
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  product_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, provider, product_id)
);

alter table public.discovery_production_items enable row level security;

create policy "discovery_production_items_select"
  on public.discovery_production_items
  for select
  using (auth.uid() = user_id);

create policy "discovery_production_items_insert"
  on public.discovery_production_items
  for insert
  with check (auth.uid() = user_id);

create policy "discovery_production_items_delete"
  on public.discovery_production_items
  for delete
  using (auth.uid() = user_id);

create index if not exists discovery_production_items_user_idx
  on public.discovery_production_items (user_id, created_at desc);
