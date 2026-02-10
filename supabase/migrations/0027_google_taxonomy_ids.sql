-- Add Google Product Taxonomy ID + path storage.
-- This is additive and safe to run multiple times.

-- 1) Taxonomy lookup table (path + optional official numeric ID).
create table if not exists public.google_product_taxonomy (
  path text primary key,
  category_id bigint null unique,
  l1 text not null,
  l2 text null,
  l3 text null,
  depth int not null,
  source text not null default 'google',
  version text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.google_product_taxonomy
  add column if not exists category_id bigint;

create unique index if not exists google_product_taxonomy_category_id_idx
  on public.google_product_taxonomy (category_id);

create index if not exists google_product_taxonomy_l1_idx on public.google_product_taxonomy (l1);
create index if not exists google_product_taxonomy_l1_l2_idx on public.google_product_taxonomy (l1, l2);
create index if not exists google_product_taxonomy_l1_l2_l3_idx on public.google_product_taxonomy (l1, l2, l3);

-- 2) Catalog products: store numeric ID (canonical) and human-readable path (denormalized snapshot).
alter table public.catalog_products
  add column if not exists google_taxonomy_id bigint,
  add column if not exists google_taxonomy_id_secondary bigint,
  add column if not exists google_taxonomy_path text,
  add column if not exists google_taxonomy_path_secondary text;

-- 3) DigiDeal products: store taxonomy for analytics and UI (no SPU required).
alter table public.digideal_products
  add column if not exists google_taxonomy_id bigint,
  add column if not exists google_taxonomy_path text;

