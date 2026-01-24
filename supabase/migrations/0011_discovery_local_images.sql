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
  coalesce(r.delivery_time, p.last_delivery_time) as delivery_time,
  p.image_local_path,
  p.image_local_url
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
  coalesce(r.delivery_time, p.last_delivery_time) as delivery_time,
  p.image_local_path,
  p.image_local_url
from public.fyndiq_products p
left join public.discovery_product_rollups r
  on r.provider = 'fyndiq'
 and r.product_id = p.product_id;
