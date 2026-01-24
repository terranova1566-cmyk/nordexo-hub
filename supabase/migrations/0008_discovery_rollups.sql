drop view if exists public.discovery_products;
drop materialized view if exists public.discovery_product_rollups;

create materialized view public.discovery_product_rollups as
with daily as (
  select
    'cdon'::text as provider,
    product_id,
    scrape_date,
    greatest(coalesce(sold_delta, 0), coalesce(sold, 0), 0) as daily_sales,
    price,
    previous_price,
    reviews,
    delivery_time,
    product_url,
    image_url
  from public.cdon_product_daily_with_delta
  union all
  select
    'fyndiq'::text as provider,
    product_id,
    scrape_date,
    greatest(coalesce(sold_delta, 0), coalesce(sold, 0), 0) as daily_sales,
    price,
    previous_price,
    reviews,
    delivery_time,
    product_url,
    image_url
  from public.fyndiq_product_daily_with_delta
),
provider_latest as (
  select provider, max(scrape_date) as latest_date
  from daily
  group by provider
),
product_source as (
  select 'cdon'::text as provider, product_id, first_seen_at
  from public.cdon_products
  union all
  select 'fyndiq'::text as provider, product_id, first_seen_at
  from public.fyndiq_products
),
product_latest as (
  select provider, product_id, max(scrape_date) as latest_date
  from daily
  group by provider, product_id
),
latest_rows as (
  select d.*
  from daily d
  join product_latest l
    on l.provider = d.provider
   and l.product_id = d.product_id
   and l.latest_date = d.scrape_date
),
agg as (
  select
    p.provider,
    p.product_id,
    pl.latest_date as provider_latest_date,
    plr.latest_date as product_latest_date,
    p.first_seen_at,
    sum(d.daily_sales) filter (where d.scrape_date = pl.latest_date) as sold_today,
    sum(d.daily_sales)
      filter (where d.scrape_date >= pl.latest_date - interval '6 days')
      as sold_7d,
    sum(d.daily_sales)
      filter (
        where d.scrape_date >= pl.latest_date - interval '6 days'
          and d.scrape_date <> pl.latest_date
      ) as sold_7d_prev,
    sum(d.daily_sales)
      filter (
        where d.scrape_date >= pl.latest_date - interval '29 days'
          and d.scrape_date <> pl.latest_date
      ) as sold_30d_prev,
    sum(d.daily_sales) as sold_all_time
  from product_source p
  join provider_latest pl
    on pl.provider = p.provider
  left join product_latest plr
    on plr.provider = p.provider
   and plr.product_id = p.product_id
  left join daily d
    on d.provider = p.provider
   and d.product_id = p.product_id
  group by
    p.provider,
    p.product_id,
    pl.latest_date,
    plr.latest_date,
    p.first_seen_at
)
select
  a.provider,
  a.product_id,
  a.provider_latest_date as latest_date,
  coalesce(a.sold_today, 0) as sold_today,
  coalesce(a.sold_7d, 0) as sold_7d,
  coalesce(a.sold_7d_prev, 0) as sold_7d_prev,
  coalesce(a.sold_30d_prev, 0) as sold_30d_prev,
  coalesce(a.sold_all_time, 0) as sold_all_time,
  (
    (
      (coalesce(a.sold_today, 0) * 2)
      + (coalesce(a.sold_7d, 0) * 0.5)
    )
    * case
        when coalesce(a.sold_today, 0) <= 2 then 0.3
        when coalesce(a.sold_today, 0) <= 4 then 0.7
        else 1
      end
    + case
        when a.first_seen_at is not null
          and (a.provider_latest_date::date - a.first_seen_at::date) <= 3
          and coalesce(a.sold_today, 0) >= 5
          then 60
        when a.first_seen_at is not null
          and (a.provider_latest_date::date - a.first_seen_at::date) <= 7
          and coalesce(a.sold_today, 0) >= 5
          then 30
        else 0
      end
    + case
        when coalesce(a.sold_today, 0) >= 5
          and (coalesce(a.sold_today, 0) / greatest(coalesce(a.sold_7d, 0) / 7.0, 1)) >= 2
          then 40
        when coalesce(a.sold_today, 0) >= 4
          and (coalesce(a.sold_today, 0) / greatest(coalesce(a.sold_7d, 0) / 7.0, 1)) >= 1.5
          then 20
        else 0
      end
    + case
        when coalesce(a.sold_today, 0) >= greatest(5, (coalesce(a.sold_7d, 0) / 7.0) * 3)
          then 30
        when coalesce(a.sold_today, 0) >= greatest(5, (coalesce(a.sold_7d, 0) / 7.0) * 2)
          then 15
        else 0
      end
  )::numeric as trending_score,
  lr.price,
  lr.previous_price,
  lr.reviews,
  lr.delivery_time,
  lr.product_url,
  lr.image_url
from agg a
left join latest_rows lr
  on lr.provider = a.provider
 and lr.product_id = a.product_id
 and lr.scrape_date = a.product_latest_date;

create unique index if not exists discovery_product_rollups_pk
  on public.discovery_product_rollups (provider, product_id);
create index if not exists discovery_product_rollups_sold7d
  on public.discovery_product_rollups (provider, sold_7d desc);
create index if not exists discovery_product_rollups_sold1d
  on public.discovery_product_rollups (provider, sold_today desc);
create index if not exists discovery_product_rollups_soldall
  on public.discovery_product_rollups (provider, sold_all_time desc);
create index if not exists discovery_product_rollups_trending
  on public.discovery_product_rollups (provider, trending_score desc);
create index if not exists discovery_product_rollups_latest
  on public.discovery_product_rollups (provider, latest_date desc);

create or replace view public.discovery_products as
select
  'cdon'::text as provider,
  p.product_id,
  p.title,
  coalesce(r.product_url, p.product_url) as product_url,
  coalesce(r.image_url, p.image_url) as image_url,
  p.source_url,
  p.last_price,
  p.last_previous_price,
  p.last_reviews,
  p.last_delivery_time,
  p.taxonomy_l1,
  p.taxonomy_l2,
  p.taxonomy_l3,
  p.taxonomy_path,
  p.taxonomy_confidence,
  p.taxonomy_updated_at,
  p.first_seen_at,
  p.last_seen_at,
  r.latest_date as scrape_date,
  r.sold_today,
  r.sold_7d,
  r.sold_7d_prev,
  r.sold_30d_prev,
  r.sold_all_time,
  r.trending_score,
  coalesce(r.price, p.last_price) as price,
  coalesce(r.previous_price, p.last_previous_price) as previous_price,
  coalesce(r.reviews, p.last_reviews) as reviews,
  coalesce(r.delivery_time, p.last_delivery_time) as delivery_time
from public.cdon_products p
left join public.discovery_product_rollups r
  on r.provider = 'cdon'
 and r.product_id = p.product_id
union all
select
  'fyndiq'::text as provider,
  p.product_id,
  p.title,
  coalesce(r.product_url, p.product_url) as product_url,
  coalesce(r.image_url, p.image_url) as image_url,
  p.source_url,
  p.last_price,
  p.last_previous_price,
  p.last_reviews,
  p.last_delivery_time,
  p.taxonomy_l1,
  p.taxonomy_l2,
  p.taxonomy_l3,
  p.taxonomy_path,
  p.taxonomy_confidence,
  p.taxonomy_updated_at,
  p.first_seen_at,
  p.last_seen_at,
  r.latest_date as scrape_date,
  r.sold_today,
  r.sold_7d,
  r.sold_7d_prev,
  r.sold_30d_prev,
  r.sold_all_time,
  r.trending_score,
  coalesce(r.price, p.last_price) as price,
  coalesce(r.previous_price, p.last_previous_price) as previous_price,
  coalesce(r.reviews, p.last_reviews) as reviews,
  coalesce(r.delivery_time, p.last_delivery_time) as delivery_time
from public.fyndiq_products p
left join public.discovery_product_rollups r
  on r.provider = 'fyndiq'
 and r.product_id = p.product_id;

create or replace function public.refresh_discovery_product_rollups()
returns void
language plpgsql
as $$
begin
  refresh materialized view concurrently public.discovery_product_rollups;
end;
$$;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    -- ignore if pg_cron is not available
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1 from cron.job where jobname = 'refresh_discovery_product_rollups'
    ) then
      perform cron.schedule(
        'refresh_discovery_product_rollups',
        '0 2 * * *',
        'select public.refresh_discovery_product_rollups();'
      );
    end if;
  end if;
end $$;
