-- Market Trends sales vectors:
-- Daily cross-channel snapshot of strongest sales signals from scraper datasets.

create extension if not exists "pgcrypto";

create table if not exists public.market_sales_vector_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  total_items integer not null default 0,
  source_counts jsonb not null default '{}'::jsonb,
  generation_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_sales_vector_snapshots_date_idx
  on public.market_sales_vector_snapshots (snapshot_date desc);

create table if not exists public.market_sales_vector_items (
  id bigserial primary key,
  snapshot_id uuid not null references public.market_sales_vector_snapshots(id) on delete cascade,
  rank integer not null,
  source text not null,
  source_scrape_date date,
  product_id text not null,
  title text,
  product_url text,
  image_url text,
  price numeric,
  currency text,
  sales_total integer,
  delta_1d integer,
  delta_7d integer,
  baseline_7d numeric,
  spike_ratio numeric,
  signal_score numeric,
  is_new_release boolean not null default false,
  is_resurgence boolean not null default false,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  taxonomy_path text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (snapshot_id, source, product_id)
);

create index if not exists market_sales_vector_items_snapshot_rank_idx
  on public.market_sales_vector_items (snapshot_id, rank asc);

create index if not exists market_sales_vector_items_snapshot_source_idx
  on public.market_sales_vector_items (snapshot_id, source, signal_score desc);

create index if not exists market_sales_vector_items_source_date_idx
  on public.market_sales_vector_items (source, source_scrape_date desc);

create table if not exists public.market_sales_vector_reports (
  snapshot_id uuid primary key references public.market_sales_vector_snapshots(id) on delete cascade,
  model text,
  summary_markdown text,
  report_json jsonb,
  hottest_top10 jsonb,
  categories jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.market_sales_vector_latest as
select
  s.id as snapshot_id,
  s.snapshot_date,
  s.total_items,
  s.source_counts,
  s.generation_meta,
  s.created_at as snapshot_created_at,
  r.model as report_model,
  r.summary_markdown,
  r.report_json,
  r.hottest_top10,
  r.categories,
  r.updated_at as report_updated_at
from public.market_sales_vector_snapshots s
left join public.market_sales_vector_reports r
  on r.snapshot_id = s.id
where s.snapshot_date = (
  select max(snapshot_date) from public.market_sales_vector_snapshots
);

alter table public.market_sales_vector_snapshots enable row level security;
alter table public.market_sales_vector_items enable row level security;
alter table public.market_sales_vector_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'market_sales_vector_snapshots'
      and policyname = 'market_sales_vector_snapshots_select_auth'
  ) then
    create policy market_sales_vector_snapshots_select_auth
      on public.market_sales_vector_snapshots
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'market_sales_vector_items'
      and policyname = 'market_sales_vector_items_select_auth'
  ) then
    create policy market_sales_vector_items_select_auth
      on public.market_sales_vector_items
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'market_sales_vector_reports'
      and policyname = 'market_sales_vector_reports_select_auth'
  ) then
    create policy market_sales_vector_reports_select_auth
      on public.market_sales_vector_reports
      for select
      to authenticated
      using (true);
  end if;
end $$;

grant select on public.market_sales_vector_snapshots to authenticated;
grant select on public.market_sales_vector_items to authenticated;
grant select on public.market_sales_vector_reports to authenticated;
grant select on public.market_sales_vector_latest to authenticated;

notify pgrst, 'reload schema';
