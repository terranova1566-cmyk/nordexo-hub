create table if not exists public.product_manager_wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.product_manager_wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.product_manager_wishlists(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (wishlist_id, product_id)
);

alter table public.product_manager_wishlists enable row level security;
alter table public.product_manager_wishlist_items enable row level security;

create policy "product_manager_wishlists_select"
  on public.product_manager_wishlists
  for select
  using (auth.uid() = user_id);

create policy "product_manager_wishlists_insert"
  on public.product_manager_wishlists
  for insert
  with check (auth.uid() = user_id);

create policy "product_manager_wishlists_update"
  on public.product_manager_wishlists
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "product_manager_wishlists_delete"
  on public.product_manager_wishlists
  for delete
  using (auth.uid() = user_id);

create policy "product_manager_wishlist_items_select"
  on public.product_manager_wishlist_items
  for select
  using (
    exists (
      select 1
      from public.product_manager_wishlists
      where product_manager_wishlists.id = wishlist_id
        and product_manager_wishlists.user_id = auth.uid()
    )
  );

create policy "product_manager_wishlist_items_insert"
  on public.product_manager_wishlist_items
  for insert
  with check (
    exists (
      select 1
      from public.product_manager_wishlists
      where product_manager_wishlists.id = wishlist_id
        and product_manager_wishlists.user_id = auth.uid()
    )
  );

create policy "product_manager_wishlist_items_delete"
  on public.product_manager_wishlist_items
  for delete
  using (
    exists (
      select 1
      from public.product_manager_wishlists
      where product_manager_wishlists.id = wishlist_id
        and product_manager_wishlists.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.product_manager_wishlists to authenticated;
grant select, insert, update, delete on public.product_manager_wishlist_items to authenticated;
