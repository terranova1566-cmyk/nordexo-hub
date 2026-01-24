create table if not exists public.discovery_production_comments (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  product_id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_label text not null,
  comment text not null,
  created_at timestamptz not null default now()
);

create index if not exists discovery_production_comments_item_idx
  on public.discovery_production_comments (provider, product_id, created_at desc);

create index if not exists discovery_production_comments_user_idx
  on public.discovery_production_comments (user_id, created_at desc);

alter table public.discovery_production_comments enable row level security;

create policy "discovery_production_comments_select"
  on public.discovery_production_comments
  for select
  using (auth.uid() = user_id);

create policy "discovery_production_comments_insert"
  on public.discovery_production_comments
  for insert
  with check (auth.uid() = user_id);

grant select, insert on public.discovery_production_comments to authenticated;
