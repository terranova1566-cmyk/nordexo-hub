create table if not exists public.discovery_wishlist_shares (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.discovery_wishlists(id) on delete cascade,
  shared_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shared_by_email text not null default '',
  shared_with_email text not null default '',
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists discovery_wishlist_shares_unique
  on public.discovery_wishlist_shares (wishlist_id, shared_with_email, is_public);

alter table public.discovery_wishlist_shares enable row level security;

create policy "discovery_wishlist_shares_select"
  on public.discovery_wishlist_shares
  for select
  using (
    shared_by = auth.uid()
    or is_public
    or shared_with_email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "discovery_wishlist_shares_insert"
  on public.discovery_wishlist_shares
  for insert
  with check (
    shared_by = auth.uid()
    and exists (
      select 1 from public.discovery_wishlists
      where discovery_wishlists.id = wishlist_id
        and discovery_wishlists.user_id = auth.uid()
    )
  );

create policy "discovery_wishlist_shares_delete"
  on public.discovery_wishlist_shares
  for delete
  using (shared_by = auth.uid());

grant select, insert, delete on public.discovery_wishlist_shares to authenticated;

create policy "discovery_wishlists_select_shared"
  on public.discovery_wishlists
  for select
  using (
    exists (
      select 1
      from public.discovery_wishlist_shares
      where discovery_wishlist_shares.wishlist_id = discovery_wishlists.id
        and (
          discovery_wishlist_shares.is_public
          or discovery_wishlist_shares.shared_by = auth.uid()
          or discovery_wishlist_shares.shared_with_email = coalesce(auth.jwt() ->> 'email', '')
        )
    )
  );

create policy "discovery_wishlist_items_select_shared"
  on public.discovery_wishlist_items
  for select
  using (
    exists (
      select 1
      from public.discovery_wishlist_shares
      where discovery_wishlist_shares.wishlist_id = wishlist_id
        and (
          discovery_wishlist_shares.is_public
          or discovery_wishlist_shares.shared_by = auth.uid()
          or discovery_wishlist_shares.shared_with_email = coalesce(auth.jwt() ->> 'email', '')
        )
    )
  );
