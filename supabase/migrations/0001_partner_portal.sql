create table if not exists public.partner_saved_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists partner_saved_products_user_idx
  on public.partner_saved_products (user_id);

create index if not exists partner_saved_products_product_idx
  on public.partner_saved_products (product_id);

create table if not exists public.partner_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'generated', 'failed')),
  file_path text,
  meta jsonb
);

create index if not exists partner_exports_user_idx
  on public.partner_exports (user_id, created_at desc);

create table if not exists public.partner_export_items (
  id uuid primary key default gen_random_uuid(),
  export_id uuid not null references public.partner_exports(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  snapshot jsonb
);

create index if not exists partner_export_items_export_idx
  on public.partner_export_items (export_id);

create index if not exists partner_export_items_product_idx
  on public.partner_export_items (product_id);

alter table public.partner_saved_products enable row level security;
alter table public.partner_exports enable row level security;
alter table public.partner_export_items enable row level security;

create policy "partner_saved_products_select"
  on public.partner_saved_products
  for select
  using (auth.uid() = user_id);

create policy "partner_saved_products_insert"
  on public.partner_saved_products
  for insert
  with check (auth.uid() = user_id);

create policy "partner_saved_products_delete"
  on public.partner_saved_products
  for delete
  using (auth.uid() = user_id);

create policy "partner_exports_select"
  on public.partner_exports
  for select
  using (auth.uid() = user_id);

create policy "partner_exports_insert"
  on public.partner_exports
  for insert
  with check (auth.uid() = user_id);

create policy "partner_exports_update"
  on public.partner_exports
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "partner_export_items_select"
  on public.partner_export_items
  for select
  using (
    exists (
      select 1
      from public.partner_exports
      where partner_exports.id = export_id
        and partner_exports.user_id = auth.uid()
    )
  );

create policy "partner_export_items_insert"
  on public.partner_export_items
  for insert
  with check (
    exists (
      select 1
      from public.partner_exports
      where partner_exports.id = export_id
        and partner_exports.user_id = auth.uid()
    )
  );

create policy "partner_export_items_delete"
  on public.partner_export_items
  for delete
  using (
    exists (
      select 1
      from public.partner_exports
      where partner_exports.id = export_id
        and partner_exports.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.partner_saved_products to authenticated;
grant select, insert, update, delete on public.partner_exports to authenticated;
grant select, insert, update, delete on public.partner_export_items to authenticated;
