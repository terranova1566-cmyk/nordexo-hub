-- DigiDeal: fix sold_today/sold_7d deltas and expose group counts.
--
-- Sales logic:
-- - For products with multiple daily snapshots, treat the first snapshot as a baseline (no sales delta).
-- - For products with only a single non-null snapshot, treat purchased_count as "sales so far" (useful for new deals).
--
-- Grouping:
-- - Expose a group count so the UI can show "(n)" next to the digideal_group_id.

create or replace view public.digideal_products_search as
with daily_raw as (
  select
    d.product_id,
    d.scrape_date,
    d.purchased_count,
    lag(d.purchased_count) over (
      partition by d.product_id
      order by d.scrape_date
    ) as prev_count,
    count(d.purchased_count) over (partition by d.product_id) as non_null_count
  from public.digideal_product_daily d
),
daily as (
  select
    daily_raw.product_id,
    daily_raw.scrape_date,
    case
      when daily_raw.purchased_count is null then null::integer
      -- If we only have one meaningful snapshot, use that as the sales figure.
      when daily_raw.non_null_count = 1 and daily_raw.prev_count is null
        then greatest(daily_raw.purchased_count, 0)
      -- Otherwise, treat the first snapshot as a baseline (no delta).
      when daily_raw.prev_count is null then null::integer
      else greatest(daily_raw.purchased_count - daily_raw.prev_count, 0)
    end as daily_value
  from daily_raw
),
latest as (
  select distinct on (d.product_id)
    d.product_id,
    d.daily_value as sold_today,
    d.scrape_date
  from daily d
  where d.daily_value is not null
  order by d.product_id, d.scrape_date desc
),
sum7 as (
  select
    d.product_id,
    sum(d.daily_value) as sold_7d
  from daily d
  where d.daily_value is not null
    and d.scrape_date >= current_date - interval '6 days'
  group by d.product_id
)
select
  dp.product_id,
  dp.retailer_item_id,
  dp.listing_title,
  dp.title_h1,
  dp.product_url,
  dp.product_slug,
  dp.prodno,
  dp.seller_name,
  dp.seller_orgnr,
  dp.seller_ids,
  dp.status,
  dp.last_price,
  dp.last_original_price,
  dp.last_discount_percent,
  dp.last_you_save_kr,
  dp.last_purchased_count,
  dp.last_instock_qty,
  dp.last_available_qty,
  dp.last_reserved_qty,
  dp.deal_start_unix,
  dp.deal_start_iso,
  dp.deal_end_unix,
  dp.deal_end_iso,
  dp.variants,
  dp.bullet_points,
  dp.description_html,
  dp.primary_image_url,
  dp.image_urls,
  dp.variation_images,
  dp.description_images,
  dp.first_seen_at,
  dp.last_seen_at,
  dp.digideal_rerun_added,
  dp.digideal_rerun_partner_comment,
  dp.digideal_rerun_status,
  dp.digideal_add_rerun,
  dp.digideal_add_rerun_at,
  dp.digideal_add_rerun_comment,
  case
    when jsonb_typeof(dp.bullet_points) = 'array'
      then (
        select string_agg(value, ' ')
        from jsonb_array_elements_text(dp.bullet_points) as value
      )
    else ''
  end as bullet_points_text,
  coalesce(latest.sold_today, 0) as sold_today,
  coalesce(sum7.sold_7d, 0::bigint) as sold_7d,
  dp.shipping_cost_kr,
  dp.identical_spu,
  dp.google_taxonomy_id,
  dp.google_taxonomy_path,
  dp.digideal_group_id,
  case
    when dp.digideal_group_id is null or dp.digideal_group_id = '' then null::bigint
    else count(*) over (partition by dp.digideal_group_id)
  end as digideal_group_count
from public.digideal_products dp
left join latest on latest.product_id = dp.product_id
left join sum7 on sum7.product_id = dp.product_id;

grant select on public.digideal_products_search to anon, authenticated;

notify pgrst, 'reload schema';

