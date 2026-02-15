-- Market Trends: frontpage scrapes + AI-generated reports.
-- Idempotent: safe to run multiple times.

create extension if not exists "pgcrypto";

create table if not exists public.market_trend_sites (
  provider text primary key,
  name text not null,
  base_url text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_trend_frontpage_scrapes (
  id uuid primary key default gen_random_uuid(),
  provider text not null references public.market_trend_sites(provider) on delete restrict,
  page_url text not null,
  scrape_date date not null,
  scraped_at timestamptz not null default now(),

  -- Extracted content.
  visible_text text,
  urls jsonb,
  images jsonb,
  ocr jsonb,
  meta jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (provider, scrape_date)
);

create index if not exists market_trend_frontpage_scrapes_provider_date_idx
  on public.market_trend_frontpage_scrapes (provider, scrape_date desc);

create index if not exists market_trend_frontpage_scrapes_scraped_idx
  on public.market_trend_frontpage_scrapes (scraped_at desc);

create table if not exists public.market_trend_frontpage_products (
  id uuid primary key default gen_random_uuid(),
  provider text not null references public.market_trend_sites(provider) on delete restrict,
  scrape_date date not null,
  product_url text not null,
  title text,
  image_url text,
  prominence numeric,
  position int,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, scrape_date, product_url)
);

create index if not exists market_trend_frontpage_products_provider_date_idx
  on public.market_trend_frontpage_products (provider, scrape_date desc);

create index if not exists market_trend_frontpage_products_provider_url_idx
  on public.market_trend_frontpage_products (provider, product_url);

create table if not exists public.market_trend_reports (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('site', 'all')),
  provider text references public.market_trend_sites(provider) on delete restrict,
  period text not null check (period in ('daily', 'weekly')),
  period_start date not null,
  period_end date not null,

  source_snapshot_id uuid references public.market_trend_frontpage_scrapes(id) on delete set null,

  report_markdown text,
  report_json jsonb,
  condensed_markdown text,
  condensed_json jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint market_trend_reports_scope_provider_chk
    check (
      (scope = 'all' and provider is null)
      or
      (scope = 'site' and provider is not null)
    ),

  constraint market_trend_reports_period_dates_chk
    check (
      (period = 'daily' and period_end = period_start)
      or
      (period = 'weekly' and period_end >= period_start)
    )
);

alter table public.market_trend_reports
  add column if not exists provider_key text generated always as (coalesce(provider, '__all__')) stored;

create index if not exists market_trend_reports_latest_idx
  on public.market_trend_reports (scope, provider, period, period_start desc);

drop index if exists public.market_trend_reports_all_unique;

create unique index if not exists market_trend_reports_unique_idx
  on public.market_trend_reports (scope, provider_key, period, period_start);

create or replace view public.market_trend_frontpage_product_rollups as
with provider_latest as (
  select provider, max(scrape_date) as latest_date
  from public.market_trend_frontpage_products
  group by provider
),
agg as (
  select
    provider,
    product_url,
    min(scrape_date) as first_seen_date,
    max(scrape_date) as last_seen_date,
    count(distinct scrape_date) as days_seen
  from public.market_trend_frontpage_products
  group by provider, product_url
),
latest_row as (
  select distinct on (provider, product_url)
    provider,
    product_url,
    title,
    image_url,
    scrape_date
  from public.market_trend_frontpage_products
  order by provider, product_url, scrape_date desc, position asc nulls last
)
select
  a.provider,
  a.product_url,
  l.title,
  l.image_url,
  a.first_seen_date,
  a.last_seen_date,
  a.days_seen,
  (a.last_seen_date = pl.latest_date) as is_current,
  (a.first_seen_date = pl.latest_date) as is_new_today,
  (pl.latest_date - a.first_seen_date + 1) as day_span
from agg a
left join latest_row l
  on l.provider = a.provider
 and l.product_url = a.product_url
left join provider_latest pl
  on pl.provider = a.provider;

alter table public.market_trend_sites enable row level security;
alter table public.market_trend_frontpage_scrapes enable row level security;
alter table public.market_trend_frontpage_products enable row level security;
alter table public.market_trend_reports enable row level security;

create policy "market_trend_sites_select_auth"
  on public.market_trend_sites
  for select
  to authenticated
  using (true);

create policy "market_trend_frontpage_scrapes_select_auth"
  on public.market_trend_frontpage_scrapes
  for select
  to authenticated
  using (true);

create policy "market_trend_frontpage_products_select_auth"
  on public.market_trend_frontpage_products
  for select
  to authenticated
  using (true);

create policy "market_trend_reports_select_auth"
  on public.market_trend_reports
  for select
  to authenticated
  using (true);

grant select on public.market_trend_sites to authenticated;
grant select on public.market_trend_frontpage_scrapes to authenticated;
grant select on public.market_trend_frontpage_products to authenticated;
grant select on public.market_trend_reports to authenticated;

notify pgrst, 'reload schema';
