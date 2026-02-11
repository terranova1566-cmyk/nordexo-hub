-- Cache 1688 image-search supplier suggestions per production item + store the selected supplier.
-- Admin-only via RLS using public.is_admin().

create table if not exists public.discovery_production_supplier_searches (
  provider text not null,
  product_id text not null,
  source text not null default '1688_image_search',
  fetched_at timestamptz not null default now(),
  offers jsonb not null default '[]'::jsonb,
  meta jsonb,
  input jsonb,
  primary key (provider, product_id)
);

create index if not exists discovery_production_supplier_searches_fetched_idx
  on public.discovery_production_supplier_searches (fetched_at desc);

create table if not exists public.discovery_production_supplier_selection (
  provider text not null,
  product_id text not null,
  selected_offer_id text,
  selected_detail_url text,
  selected_offer jsonb,
  selected_at timestamptz not null default now(),
  selected_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (provider, product_id)
);

create index if not exists discovery_production_supplier_selection_updated_idx
  on public.discovery_production_supplier_selection (updated_at desc);

alter table public.discovery_production_supplier_searches enable row level security;
alter table public.discovery_production_supplier_selection enable row level security;

create policy "discovery_production_supplier_searches_admin"
  on public.discovery_production_supplier_searches
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "discovery_production_supplier_selection_admin"
  on public.discovery_production_supplier_selection
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.discovery_production_supplier_searches to authenticated;
grant select, insert, update, delete on public.discovery_production_supplier_selection to authenticated;

