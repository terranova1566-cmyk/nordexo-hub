create table if not exists public.discovery_hidden_products_global (
  provider text not null,
  product_id text not null,
  hidden_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, product_id)
);

create index if not exists discovery_hidden_products_global_provider_idx
  on public.discovery_hidden_products_global (provider);

alter table public.discovery_hidden_products_global enable row level security;

drop policy if exists "discovery_hidden_products_global_select"
  on public.discovery_hidden_products_global;
create policy "discovery_hidden_products_global_select"
  on public.discovery_hidden_products_global
  for select
  using (auth.uid() is not null);

drop policy if exists "discovery_hidden_products_global_insert"
  on public.discovery_hidden_products_global;
create policy "discovery_hidden_products_global_insert"
  on public.discovery_hidden_products_global
  for insert
  with check (auth.uid() is not null);

drop policy if exists "discovery_hidden_products_global_update"
  on public.discovery_hidden_products_global;
create policy "discovery_hidden_products_global_update"
  on public.discovery_hidden_products_global
  for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "discovery_hidden_products_global_delete"
  on public.discovery_hidden_products_global;
create policy "discovery_hidden_products_global_delete"
  on public.discovery_hidden_products_global
  for delete
  using (auth.uid() is not null);

grant select, insert, update, delete on public.discovery_hidden_products_global to authenticated;
