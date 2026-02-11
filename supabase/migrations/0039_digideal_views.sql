-- DigiDeal: per-user Views (similar to wishlists) for filtering and batch actions.

create table if not exists public.digideal_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.digideal_view_items (
  id uuid primary key default gen_random_uuid(),
  view_id uuid not null references public.digideal_views(id) on delete cascade,
  product_id text not null references public.digideal_products(product_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (view_id, product_id)
);

create index if not exists digideal_view_items_view_id_idx
  on public.digideal_view_items(view_id);

create index if not exists digideal_view_items_product_id_idx
  on public.digideal_view_items(product_id);

alter table public.digideal_views enable row level security;
alter table public.digideal_view_items enable row level security;

create policy "digideal_views_select"
  on public.digideal_views
  for select
  using (auth.uid() = user_id);

create policy "digideal_views_insert"
  on public.digideal_views
  for insert
  with check (auth.uid() = user_id);

create policy "digideal_views_update"
  on public.digideal_views
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "digideal_views_delete"
  on public.digideal_views
  for delete
  using (auth.uid() = user_id);

create policy "digideal_view_items_select"
  on public.digideal_view_items
  for select
  using (
    exists (
      select 1
      from public.digideal_views
      where digideal_views.id = view_id
        and digideal_views.user_id = auth.uid()
    )
  );

create policy "digideal_view_items_insert"
  on public.digideal_view_items
  for insert
  with check (
    exists (
      select 1
      from public.digideal_views
      where digideal_views.id = view_id
        and digideal_views.user_id = auth.uid()
    )
  );

create policy "digideal_view_items_delete"
  on public.digideal_view_items
  for delete
  using (
    exists (
      select 1
      from public.digideal_views
      where digideal_views.id = view_id
        and digideal_views.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.digideal_views to authenticated;
grant select, insert, update, delete on public.digideal_view_items to authenticated;

notify pgrst, 'reload schema';

