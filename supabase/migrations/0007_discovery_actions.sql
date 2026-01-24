create table if not exists public.discovery_product_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null,
  product_id text not null,
  liked boolean not null default false,
  removed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, provider, product_id)
);

create table if not exists public.discovery_wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.discovery_wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.discovery_wishlists(id) on delete cascade,
  provider text not null,
  product_id text not null,
  created_at timestamptz not null default now(),
  unique (wishlist_id, provider, product_id)
);

alter table public.discovery_product_actions enable row level security;
alter table public.discovery_wishlists enable row level security;
alter table public.discovery_wishlist_items enable row level security;

create policy "discovery_product_actions_select"
  on public.discovery_product_actions
  for select
  using (auth.uid() = user_id);

create policy "discovery_product_actions_insert"
  on public.discovery_product_actions
  for insert
  with check (auth.uid() = user_id);

create policy "discovery_product_actions_update"
  on public.discovery_product_actions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "discovery_product_actions_delete"
  on public.discovery_product_actions
  for delete
  using (auth.uid() = user_id);

create policy "discovery_wishlists_select"
  on public.discovery_wishlists
  for select
  using (auth.uid() = user_id);

create policy "discovery_wishlists_insert"
  on public.discovery_wishlists
  for insert
  with check (auth.uid() = user_id);

create policy "discovery_wishlists_update"
  on public.discovery_wishlists
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "discovery_wishlists_delete"
  on public.discovery_wishlists
  for delete
  using (auth.uid() = user_id);

create policy "discovery_wishlist_items_select"
  on public.discovery_wishlist_items
  for select
  using (
    exists (
      select 1
      from public.discovery_wishlists
      where discovery_wishlists.id = wishlist_id
        and discovery_wishlists.user_id = auth.uid()
    )
  );

create policy "discovery_wishlist_items_insert"
  on public.discovery_wishlist_items
  for insert
  with check (
    exists (
      select 1
      from public.discovery_wishlists
      where discovery_wishlists.id = wishlist_id
        and discovery_wishlists.user_id = auth.uid()
    )
  );

create policy "discovery_wishlist_items_delete"
  on public.discovery_wishlist_items
  for delete
  using (
    exists (
      select 1
      from public.discovery_wishlists
      where discovery_wishlists.id = wishlist_id
        and discovery_wishlists.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.discovery_product_actions to authenticated;
grant select, insert, update, delete on public.discovery_wishlists to authenticated;
grant select, insert, update, delete on public.discovery_wishlist_items to authenticated;
