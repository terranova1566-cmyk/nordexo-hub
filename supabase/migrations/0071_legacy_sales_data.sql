-- Staging table for messy legacy sales batches (no revenue column).
-- Keeps row-level lineage (batch/file/row) so repeated loads are idempotent.

create table if not exists public.legacy_sales_data (
  id bigserial primary key,
  batch_label text not null,
  source_file text not null,
  source_row_number integer not null check (source_row_number > 0),
  seller_platform text,
  sku text not null,
  sku_norm text,
  sold_date date not null,
  amount_sold numeric not null check (amount_sold >= 0),
  imported_at timestamptz not null default now(),
  meta jsonb
);

create unique index if not exists legacy_sales_data_source_unique_idx
  on public.legacy_sales_data (batch_label, source_file, source_row_number);

create index if not exists legacy_sales_data_sku_idx
  on public.legacy_sales_data (sku);

create index if not exists legacy_sales_data_sku_norm_idx
  on public.legacy_sales_data (sku_norm);

create index if not exists legacy_sales_data_sold_date_idx
  on public.legacy_sales_data (sold_date);

create index if not exists legacy_sales_data_seller_idx
  on public.legacy_sales_data (seller_platform);

alter table public.legacy_sales_data enable row level security;
alter table public.legacy_sales_data force row level security;

drop policy if exists legacy_sales_data_admin_select on public.legacy_sales_data;
drop policy if exists legacy_sales_data_admin_insert on public.legacy_sales_data;
drop policy if exists legacy_sales_data_admin_update on public.legacy_sales_data;
drop policy if exists legacy_sales_data_admin_delete on public.legacy_sales_data;

create policy "legacy_sales_data_admin_select"
  on public.legacy_sales_data
  for select
  using (public.is_admin());

create policy "legacy_sales_data_admin_insert"
  on public.legacy_sales_data
  for insert
  with check (public.is_admin());

create policy "legacy_sales_data_admin_update"
  on public.legacy_sales_data
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "legacy_sales_data_admin_delete"
  on public.legacy_sales_data
  for delete
  using (public.is_admin());

grant select, insert, update, delete on public.legacy_sales_data to authenticated;
grant usage, select on sequence public.legacy_sales_data_id_seq to authenticated;

-- Daily rollup helper aligned to existing sales-facts grain for SKU calculations.
create or replace view public.legacy_sales_daily as
select
  l.sku,
  l.sku_norm,
  l.sold_date,
  coalesce(nullif(l.seller_platform, ''), 'all') as seller,
  sum(l.amount_sold) as units_sold
from public.legacy_sales_data l
group by
  l.sku,
  l.sku_norm,
  l.sold_date,
  coalesce(nullif(l.seller_platform, ''), 'all');

grant select on public.legacy_sales_daily to authenticated;
