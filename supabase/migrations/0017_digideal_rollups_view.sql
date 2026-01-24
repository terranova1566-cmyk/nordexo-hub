create or replace view public.digideal_products_search as
with daily as (
  select
    product_id,
    scrape_date::date as scrape_date,
    greatest(
      coalesce(purchased_delta, 0),
      coalesce(purchased_count, 0),
      0
    ) as daily_value
  from public.digideal_product_daily_with_delta
),
latest as (
  select distinct on (product_id)
    product_id,
    daily_value as sold_today,
    scrape_date
  from daily
  where scrape_date >= current_date - interval '6 days'
  order by product_id, scrape_date desc
),
sum7 as (
  select
    product_id,
    sum(daily_value) as sold_7d
  from daily
  where scrape_date >= current_date - interval '6 days'
  group by product_id
)
select
  dp.*,
  case
    when jsonb_typeof(dp.bullet_points) = 'array'
      then (
        select string_agg(value, ' ')
        from jsonb_array_elements_text(dp.bullet_points) as value
      )
    else ''
  end as bullet_points_text,
  coalesce(latest.sold_today, 0) as sold_today,
  coalesce(sum7.sold_7d, 0) as sold_7d
from public.digideal_products dp
left join latest on latest.product_id = dp.product_id
left join sum7 on sum7.product_id = dp.product_id;

grant select on public.digideal_products_search to anon, authenticated;
