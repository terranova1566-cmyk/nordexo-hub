-- Amazon scrapes: full product scrapes + lightweight product cards.
-- Idempotent: safe to run multiple times.

create extension if not exists "pgcrypto";

create table if not exists public.amazon_full_scrapes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- Canonical identifiers.
  asin text not null,
  domain text not null default 'com',
  product_url text not null,

  -- Human-friendly fields (mirrors the minimum we need in the UI + downstream tools).
  title text,
  brand text,
  price numeric,
  currency text,
  description text,
  bullet_points text[],
  images jsonb,

  -- Variants + related product ideas.
  variants jsonb,
  related_product_asins text[],
  related_product_cards jsonb,

  -- Debug payloads (structured parse + optional raw HTML ASIN extraction input).
  provider text not null default 'oxylabs',
  raw jsonb,

  scraped_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, asin)
);

create index if not exists amazon_full_scrapes_user_scraped_idx
  on public.amazon_full_scrapes (user_id, scraped_at desc);

create index if not exists amazon_full_scrapes_asin_idx
  on public.amazon_full_scrapes (asin);

create table if not exists public.amazon_product_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  asin text,
  domain text not null default 'com',
  product_url text not null,

  title text,
  image_url text,
  price numeric,
  currency text,

  source_url text,
  source_type text not null default 'listing' check (source_type in ('listing', 'recommended', 'related', 'unknown')),
  source_asin text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  provider text not null default 'oxylabs',
  raw jsonb,

  unique (user_id, source_type, source_url, product_url)
);

create index if not exists amazon_product_cards_user_last_seen_idx
  on public.amazon_product_cards (user_id, last_seen_at desc);

create index if not exists amazon_product_cards_asin_idx
  on public.amazon_product_cards (asin);

alter table public.amazon_full_scrapes enable row level security;
alter table public.amazon_product_cards enable row level security;

create policy "amazon_full_scrapes_select"
  on public.amazon_full_scrapes
  for select
  using (auth.uid() = user_id);

create policy "amazon_full_scrapes_insert"
  on public.amazon_full_scrapes
  for insert
  with check (auth.uid() = user_id);

create policy "amazon_full_scrapes_update"
  on public.amazon_full_scrapes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "amazon_full_scrapes_delete"
  on public.amazon_full_scrapes
  for delete
  using (auth.uid() = user_id);

create policy "amazon_product_cards_select"
  on public.amazon_product_cards
  for select
  using (auth.uid() = user_id);

create policy "amazon_product_cards_insert"
  on public.amazon_product_cards
  for insert
  with check (auth.uid() = user_id);

create policy "amazon_product_cards_update"
  on public.amazon_product_cards
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "amazon_product_cards_delete"
  on public.amazon_product_cards
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.amazon_full_scrapes to authenticated;
grant select, insert, update, delete on public.amazon_product_cards to authenticated;

