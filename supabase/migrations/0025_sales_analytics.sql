-- Sales analytics engine: ingest historical sales (Excel -> facts), then query by SKU/category/supplier/time.
-- Designed to be admin-only via RLS (internal tool).

-- Helper for RLS checks (uses the current user's row in partner_user_settings).
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.partner_user_settings s
    where s.user_id = auth.uid()
      and s.is_admin = true
  );
$$;

grant execute on function public.is_admin() to authenticated;

create table if not exists public.sales_import_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  file_name text,
  file_sha256 text,
  raw_row_count integer,
  fact_row_count integer,
  error_count integer not null default 0,
  meta jsonb
);

create table if not exists public.sales_skus (
  sku text primary key,
  sku_norm text,
  title text,
  supplier_name text,
  google_taxonomy_path text,
  google_taxonomy_l1 text,
  google_taxonomy_l2 text,
  google_taxonomy_l3 text,
  import_run_id uuid references public.sales_import_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta jsonb
);

create table if not exists public.sales_facts (
  sku text not null references public.sales_skus(sku) on delete cascade,
  sold_date date not null,
  seller text not null default 'all',
  currency text not null default 'UNK',
  units_sold integer not null check (units_sold >= 0),
  revenue numeric not null check (revenue >= 0),
  import_run_id uuid references public.sales_import_runs(id) on delete set null,
  imported_at timestamptz not null default now(),
  meta jsonb,
  primary key (sku, sold_date, seller, currency)
);

create table if not exists public.sales_import_errors (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.sales_import_runs(id) on delete cascade,
  row_number integer,
  error text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sales_facts_sold_date_idx
  on public.sales_facts (sold_date);

create index if not exists sales_facts_seller_idx
  on public.sales_facts (seller);

create index if not exists sales_skus_supplier_idx
  on public.sales_skus (supplier_name);

create index if not exists sales_skus_taxonomy_idx
  on public.sales_skus (google_taxonomy_l1, google_taxonomy_l2, google_taxonomy_l3);

create or replace function public.sales_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sales_skus_touch_updated_at on public.sales_skus;
create trigger sales_skus_touch_updated_at
before update on public.sales_skus
for each row
execute function public.sales_touch_updated_at();

-- RLS: sales analytics are internal-only.
alter table public.sales_import_runs enable row level security;
alter table public.sales_skus enable row level security;
alter table public.sales_facts enable row level security;
alter table public.sales_import_errors enable row level security;

-- FORCE RLS to avoid accidental bypass via views owned by postgres.
alter table public.sales_import_runs force row level security;
alter table public.sales_skus force row level security;
alter table public.sales_facts force row level security;
alter table public.sales_import_errors force row level security;

-- Make the migration re-runnable (manual psql applies) by dropping policies first.
drop policy if exists sales_import_runs_admin_select on public.sales_import_runs;
drop policy if exists sales_skus_admin_select on public.sales_skus;
drop policy if exists sales_facts_admin_select on public.sales_facts;
drop policy if exists sales_import_errors_admin_select on public.sales_import_errors;
drop policy if exists sales_skus_admin_write on public.sales_skus;
drop policy if exists sales_facts_admin_write on public.sales_facts;
drop policy if exists sales_skus_admin_update on public.sales_skus;
drop policy if exists sales_skus_admin_delete on public.sales_skus;
drop policy if exists sales_facts_admin_update on public.sales_facts;
drop policy if exists sales_facts_admin_delete on public.sales_facts;
drop policy if exists sales_import_runs_admin_write on public.sales_import_runs;
drop policy if exists sales_import_errors_admin_write on public.sales_import_errors;

create policy "sales_import_runs_admin_select"
  on public.sales_import_runs
  for select
  using (public.is_admin());

create policy "sales_skus_admin_select"
  on public.sales_skus
  for select
  using (public.is_admin());

create policy "sales_facts_admin_select"
  on public.sales_facts
  for select
  using (public.is_admin());

create policy "sales_import_errors_admin_select"
  on public.sales_import_errors
  for select
  using (public.is_admin());

-- (Optional) allow admins to mutate via the UI; service role bypasses RLS for imports regardless.
create policy "sales_skus_admin_write"
  on public.sales_skus
  for insert
  with check (public.is_admin());

create policy "sales_facts_admin_write"
  on public.sales_facts
  for insert
  with check (public.is_admin());

create policy "sales_skus_admin_update"
  on public.sales_skus
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "sales_skus_admin_delete"
  on public.sales_skus
  for delete
  using (public.is_admin());

create policy "sales_facts_admin_update"
  on public.sales_facts
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "sales_facts_admin_delete"
  on public.sales_facts
  for delete
  using (public.is_admin());

create policy "sales_import_runs_admin_write"
  on public.sales_import_runs
  for insert
  with check (public.is_admin());

create policy "sales_import_errors_admin_write"
  on public.sales_import_errors
  for insert
  with check (public.is_admin());

grant select, insert on public.sales_import_runs to authenticated;
grant select, insert on public.sales_import_errors to authenticated;
grant select, insert, update on public.sales_skus to authenticated;
grant select, insert, update, delete on public.sales_facts to authenticated;

-- Enriched SKU view that prefers catalog data when present, but keeps your imported taxonomy/title as fallback.
create or replace view public.sales_sku_enriched as
select
  s.sku,
  s.sku_norm,
  v.id as catalog_variant_id,
  v.product_id as catalog_product_id,
  coalesce(p.title, s.title) as title,
  coalesce(v.supplier_name, s.supplier_name) as supplier_name,
  coalesce(p.google_taxonomy_l1, s.google_taxonomy_l1) as google_taxonomy_l1,
  coalesce(p.google_taxonomy_l2, s.google_taxonomy_l2) as google_taxonomy_l2,
  coalesce(p.google_taxonomy_l3, s.google_taxonomy_l3) as google_taxonomy_l3,
  coalesce(
    nullif(s.google_taxonomy_path, ''),
    nullif(concat_ws(' > ', p.google_taxonomy_l1, p.google_taxonomy_l2, p.google_taxonomy_l3), '')
  ) as google_taxonomy_path,
  s.created_at,
  s.updated_at
from public.sales_skus s
left join lateral (
  select v.*
  from public.catalog_variants v
  where v.sku = s.sku
     or (s.sku_norm is not null and v.sku_norm = s.sku_norm)
  order by
    case when v.sku = s.sku then 0 else 1 end,
    v.id asc
  limit 1
) v on true
left join public.catalog_products p
  on p.id = v.product_id;

grant select on public.sales_sku_enriched to authenticated;

-- Common rollups (views) to make ad-hoc analysis fast and consistent.
create or replace view public.sales_sku_rollups as
select
  f.sku,
  sum(f.units_sold)::bigint as units_sold_all_time,
  sum(f.revenue) as revenue_all_time,
  min(f.sold_date) as first_sold_date,
  max(f.sold_date) as last_sold_date
from public.sales_facts f
group by f.sku;

grant select on public.sales_sku_rollups to authenticated;

create or replace view public.sales_sku_month_of_year as
select
  f.sku,
  extract(month from f.sold_date)::int as month,
  sum(f.units_sold)::bigint as units_sold,
  sum(f.revenue) as revenue,
  count(distinct extract(year from f.sold_date)::int) as years_present
from public.sales_facts f
group by f.sku, extract(month from f.sold_date)::int;

grant select on public.sales_sku_month_of_year to authenticated;

create or replace view public.sales_category_month_of_year as
select
  e.google_taxonomy_path,
  extract(month from f.sold_date)::int as month,
  sum(f.units_sold)::bigint as units_sold,
  sum(f.revenue) as revenue,
  count(distinct f.sku) as sku_count
from public.sales_facts f
join public.sales_sku_enriched e
  on e.sku = f.sku
group by e.google_taxonomy_path, extract(month from f.sold_date)::int;

grant select on public.sales_category_month_of_year to authenticated;

create or replace view public.sales_supplier_month_of_year as
select
  e.supplier_name,
  extract(month from f.sold_date)::int as month,
  sum(f.units_sold)::bigint as units_sold,
  sum(f.revenue) as revenue,
  count(distinct f.sku) as sku_count
from public.sales_facts f
join public.sales_sku_enriched e
  on e.sku = f.sku
group by e.supplier_name, extract(month from f.sold_date)::int;

grant select on public.sales_supplier_month_of_year to authenticated;

-- RPC helpers (invoker rights) for the web app to call directly via supabase-js.
drop function if exists public.sales_top_skus_in_range(date, date, integer, text, text, text);
create function public.sales_top_skus_in_range(
  p_start date,
  p_end date,
  p_limit integer default 100,
  p_seller text default null,
  p_supplier_name text default null,
  p_taxonomy_path text default null
)
returns table (
  sku text,
  units_sold bigint,
  revenue numeric,
  title text,
  supplier_name text,
  google_taxonomy_path text
)
language sql
stable
as $$
  select
    f.sku,
    sum(f.units_sold)::bigint as units_sold,
    sum(f.revenue) as revenue,
    max(e.title) as title,
    max(e.supplier_name) as supplier_name,
    max(e.google_taxonomy_path) as google_taxonomy_path
  from public.sales_facts f
  join public.sales_sku_enriched e
    on e.sku = f.sku
  where f.sold_date >= p_start
    and f.sold_date <= p_end
    and (p_seller is null or f.seller = p_seller)
    and (p_supplier_name is null or e.supplier_name = p_supplier_name)
    and (p_taxonomy_path is null or e.google_taxonomy_path = p_taxonomy_path)
  group by f.sku
  order by units_sold desc, revenue desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.sales_top_skus_in_range(date, date, integer, text, text, text) to authenticated;

drop function if exists public.sales_top_skus_for_month(integer, integer, integer, text, text, text);
create function public.sales_top_skus_for_month(
  p_month integer,
  p_year integer default null,
  p_limit integer default 100,
  p_seller text default null,
  p_supplier_name text default null,
  p_taxonomy_path text default null
)
returns table (
  sku text,
  units_sold bigint,
  revenue numeric,
  title text,
  supplier_name text,
  google_taxonomy_path text
)
language sql
stable
as $$
  select
    f.sku,
    sum(f.units_sold)::bigint as units_sold,
    sum(f.revenue) as revenue,
    max(e.title) as title,
    max(e.supplier_name) as supplier_name,
    max(e.google_taxonomy_path) as google_taxonomy_path
  from public.sales_facts f
  join public.sales_sku_enriched e
    on e.sku = f.sku
  where extract(month from f.sold_date)::int = p_month
    and (p_year is null or extract(year from f.sold_date)::int = p_year)
    and (p_seller is null or f.seller = p_seller)
    and (p_supplier_name is null or e.supplier_name = p_supplier_name)
    and (p_taxonomy_path is null or e.google_taxonomy_path = p_taxonomy_path)
  group by f.sku
  order by units_sold desc, revenue desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.sales_top_skus_for_month(integer, integer, integer, text, text, text) to authenticated;

drop function if exists public.sales_top_categories_in_range(date, date, integer, text, text);
create function public.sales_top_categories_in_range(
  p_start date,
  p_end date,
  p_limit integer default 50,
  p_seller text default null,
  p_supplier_name text default null
)
returns table (
  google_taxonomy_path text,
  units_sold bigint,
  revenue numeric,
  sku_count bigint
)
language sql
stable
as $$
  select
    e.google_taxonomy_path,
    sum(f.units_sold)::bigint as units_sold,
    sum(f.revenue) as revenue,
    count(distinct f.sku)::bigint as sku_count
  from public.sales_facts f
  join public.sales_sku_enriched e
    on e.sku = f.sku
  where f.sold_date >= p_start
    and f.sold_date <= p_end
    and e.google_taxonomy_path is not null
    and (p_seller is null or f.seller = p_seller)
    and (p_supplier_name is null or e.supplier_name = p_supplier_name)
  group by e.google_taxonomy_path
  order by units_sold desc, revenue desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.sales_top_categories_in_range(date, date, integer, text, text) to authenticated;

drop function if exists public.sales_top_categories_for_month(integer, integer, integer, text, text);
create function public.sales_top_categories_for_month(
  p_month integer,
  p_year integer default null,
  p_limit integer default 50,
  p_seller text default null,
  p_supplier_name text default null
)
returns table (
  google_taxonomy_path text,
  units_sold bigint,
  revenue numeric,
  sku_count bigint
)
language sql
stable
as $$
  select
    e.google_taxonomy_path,
    sum(f.units_sold)::bigint as units_sold,
    sum(f.revenue) as revenue,
    count(distinct f.sku)::bigint as sku_count
  from public.sales_facts f
  join public.sales_sku_enriched e
    on e.sku = f.sku
  where extract(month from f.sold_date)::int = p_month
    and (p_year is null or extract(year from f.sold_date)::int = p_year)
    and e.google_taxonomy_path is not null
    and (p_seller is null or f.seller = p_seller)
    and (p_supplier_name is null or e.supplier_name = p_supplier_name)
  group by e.google_taxonomy_path
  order by units_sold desc, revenue desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.sales_top_categories_for_month(integer, integer, integer, text, text) to authenticated;

drop function if exists public.sales_top_suppliers_in_range(date, date, integer, text, text);
create function public.sales_top_suppliers_in_range(
  p_start date,
  p_end date,
  p_limit integer default 50,
  p_seller text default null,
  p_taxonomy_path text default null
)
returns table (
  supplier_name text,
  units_sold bigint,
  revenue numeric,
  sku_count bigint
)
language sql
stable
as $$
  select
    e.supplier_name,
    sum(f.units_sold)::bigint as units_sold,
    sum(f.revenue) as revenue,
    count(distinct f.sku)::bigint as sku_count
  from public.sales_facts f
  join public.sales_sku_enriched e
    on e.sku = f.sku
  where f.sold_date >= p_start
    and f.sold_date <= p_end
    and e.supplier_name is not null
    and (p_seller is null or f.seller = p_seller)
    and (p_taxonomy_path is null or e.google_taxonomy_path = p_taxonomy_path)
  group by e.supplier_name
  order by units_sold desc, revenue desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.sales_top_suppliers_in_range(date, date, integer, text, text) to authenticated;

drop function if exists public.sales_top_suppliers_for_month(integer, integer, integer, text, text);
create function public.sales_top_suppliers_for_month(
  p_month integer,
  p_year integer default null,
  p_limit integer default 50,
  p_seller text default null,
  p_taxonomy_path text default null
)
returns table (
  supplier_name text,
  units_sold bigint,
  revenue numeric,
  sku_count bigint
)
language sql
stable
as $$
  select
    e.supplier_name,
    sum(f.units_sold)::bigint as units_sold,
    sum(f.revenue) as revenue,
    count(distinct f.sku)::bigint as sku_count
  from public.sales_facts f
  join public.sales_sku_enriched e
    on e.sku = f.sku
  where extract(month from f.sold_date)::int = p_month
    and (p_year is null or extract(year from f.sold_date)::int = p_year)
    and e.supplier_name is not null
    and (p_seller is null or f.seller = p_seller)
    and (p_taxonomy_path is null or e.google_taxonomy_path = p_taxonomy_path)
  group by e.supplier_name
  order by units_sold desc, revenue desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.sales_top_suppliers_for_month(integer, integer, integer, text, text) to authenticated;

drop function if exists public.sales_product_summary(uuid, text, text);
create function public.sales_product_summary(
  p_product_id uuid,
  p_seller text default null,
  p_currency text default null
)
returns table (
  units_sold bigint,
  revenue numeric,
  first_sold_date date,
  last_sold_date date,
  sku_count bigint
)
language sql
stable
as $$
  select
    coalesce(sum(f.units_sold)::bigint, 0) as units_sold,
    coalesce(sum(f.revenue), 0) as revenue,
    min(f.sold_date) as first_sold_date,
    max(f.sold_date) as last_sold_date,
    count(distinct f.sku)::bigint as sku_count
  from public.sales_facts f
  join public.sales_sku_enriched e
    on e.sku = f.sku
  where e.catalog_product_id = p_product_id
    and (p_seller is null or f.seller = p_seller)
    and (p_currency is null or f.currency = p_currency);
$$;

grant execute on function public.sales_product_summary(uuid, text, text) to authenticated;

drop function if exists public.sales_product_timeseries(uuid, date, date, text, text);
create function public.sales_product_timeseries(
  p_product_id uuid,
  p_start date default null,
  p_end date default null,
  p_seller text default null,
  p_currency text default null
)
returns table (
  sold_date date,
  units_sold bigint,
  revenue numeric
)
language sql
stable
as $$
  select
    f.sold_date,
    sum(f.units_sold)::bigint as units_sold,
    sum(f.revenue) as revenue
  from public.sales_facts f
  join public.sales_sku_enriched e
    on e.sku = f.sku
  where e.catalog_product_id = p_product_id
    and (p_start is null or f.sold_date >= p_start)
    and (p_end is null or f.sold_date <= p_end)
    and (p_seller is null or f.seller = p_seller)
    and (p_currency is null or f.currency = p_currency)
  group by f.sold_date
  order by f.sold_date asc;
$$;

grant execute on function public.sales_product_timeseries(uuid, date, date, text, text) to authenticated;

drop function if exists public.sales_sku_timeseries(text, date, date, text, text);
create function public.sales_sku_timeseries(
  p_sku text,
  p_start date default null,
  p_end date default null,
  p_seller text default null,
  p_currency text default null
)
returns table (
  sold_date date,
  units_sold bigint,
  revenue numeric
)
language sql
stable
as $$
  select
    f.sold_date,
    sum(f.units_sold)::bigint as units_sold,
    sum(f.revenue) as revenue
  from public.sales_facts f
  where f.sku = p_sku
    and (p_start is null or f.sold_date >= p_start)
    and (p_end is null or f.sold_date <= p_end)
    and (p_seller is null or f.seller = p_seller)
    and (p_currency is null or f.currency = p_currency)
  group by f.sold_date
  order by f.sold_date asc;
$$;

grant execute on function public.sales_sku_timeseries(text, date, date, text, text) to authenticated;
