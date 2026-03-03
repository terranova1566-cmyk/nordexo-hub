create table if not exists public.discovery_product_stack_items (
  provider text not null,
  product_id text not null,
  stack_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, product_id)
);

create index if not exists discovery_product_stack_items_stack_idx
  on public.discovery_product_stack_items (stack_id);

alter table public.discovery_product_stack_items enable row level security;

drop policy if exists "discovery_product_stack_items_select"
  on public.discovery_product_stack_items;
create policy "discovery_product_stack_items_select"
  on public.discovery_product_stack_items
  for select
  using (auth.uid() is not null);

drop policy if exists "discovery_product_stack_items_insert"
  on public.discovery_product_stack_items;
create policy "discovery_product_stack_items_insert"
  on public.discovery_product_stack_items
  for insert
  with check (auth.uid() is not null);

drop policy if exists "discovery_product_stack_items_update"
  on public.discovery_product_stack_items;
create policy "discovery_product_stack_items_update"
  on public.discovery_product_stack_items
  for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "discovery_product_stack_items_delete"
  on public.discovery_product_stack_items;
create policy "discovery_product_stack_items_delete"
  on public.discovery_product_stack_items
  for delete
  using (auth.uid() is not null);

grant select, insert, update, delete on public.discovery_product_stack_items to authenticated;
