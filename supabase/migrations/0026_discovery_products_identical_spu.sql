-- Add a persistent catalog link for each competitor discovery product.
-- This stores the catalog SPU that has been manually confirmed as identical.

ALTER TABLE public.cdon_products
ADD COLUMN IF NOT EXISTS identical_spu text;

ALTER TABLE public.fyndiq_products
ADD COLUMN IF NOT EXISTS identical_spu text;

-- discovery_products is a view (UNION of provider tables), so we include the new column there too.
CREATE OR REPLACE VIEW public.discovery_products AS
 SELECT 'cdon'::text AS provider,
    p.product_id,
    p.title,
    COALESCE(r.product_url, p.product_url) AS product_url,
    COALESCE(r.image_url, p.image_url) AS image_url,
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
    r.latest_date AS scrape_date,
    r.sold_today,
    r.sold_7d,
    r.sold_7d_prev,
    r.sold_30d_prev,
    r.sold_all_time,
    r.trending_score,
    COALESCE(r.price, p.last_price) AS price,
    COALESCE(r.previous_price, p.last_previous_price) AS previous_price,
    COALESCE(r.reviews, p.last_reviews) AS reviews,
    COALESCE(r.delivery_time, p.last_delivery_time) AS delivery_time,
    p.image_local_path,
    p.image_local_url,
    p.identical_spu
   FROM public.cdon_products p
     LEFT JOIN public.discovery_product_rollups r ON r.provider = 'cdon'::text AND r.product_id = p.product_id
UNION ALL
 SELECT 'fyndiq'::text AS provider,
    p.product_id,
    p.title,
    COALESCE(r.product_url, p.product_url) AS product_url,
    COALESCE(r.image_url, p.image_url) AS image_url,
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
    r.latest_date AS scrape_date,
    r.sold_today,
    r.sold_7d,
    r.sold_7d_prev,
    r.sold_30d_prev,
    r.sold_all_time,
    r.trending_score,
    COALESCE(r.price, p.last_price) AS price,
    COALESCE(r.previous_price, p.last_previous_price) AS previous_price,
    COALESCE(r.reviews, p.last_reviews) AS reviews,
    COALESCE(r.delivery_time, p.last_delivery_time) AS delivery_time,
    p.image_local_path,
    p.image_local_url,
    p.identical_spu
   FROM public.fyndiq_products p
     LEFT JOIN public.discovery_product_rollups r ON r.provider = 'fyndiq'::text AND r.product_id = p.product_id;
