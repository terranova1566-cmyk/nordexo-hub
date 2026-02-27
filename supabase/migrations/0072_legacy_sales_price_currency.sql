-- Add optional price + currency fields for legacy imports that include accounting totals.

alter table public.legacy_sales_data
  add column if not exists total_price numeric,
  add column if not exists currency text;

create index if not exists legacy_sales_data_currency_idx
  on public.legacy_sales_data (currency);

-- Daily helper with currency + revenue, while keeping existing legacy_sales_daily untouched.
create or replace view public.legacy_sales_daily_priced as
select
  l.sku,
  l.sku_norm,
  l.sold_date,
  coalesce(nullif(l.seller_platform, ''), 'all') as seller,
  coalesce(nullif(l.currency, ''), 'UNK') as currency,
  sum(l.amount_sold) as units_sold,
  sum(coalesce(l.total_price, 0)) as total_price
from public.legacy_sales_data l
group by
  l.sku,
  l.sku_norm,
  l.sold_date,
  coalesce(nullif(l.seller_platform, ''), 'all'),
  coalesce(nullif(l.currency, ''), 'UNK');

grant select on public.legacy_sales_daily_priced to authenticated;
