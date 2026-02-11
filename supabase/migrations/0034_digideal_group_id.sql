-- DigiDeal: deal grouping ID.
--
-- Group definition (within seller_name):
-- - Exact same listing_title belong together, even if image differs.
-- - Images that are very similar (pHash distance <= 3 ~ 95%+) belong together.
-- - Group membership is transitive (new items can merge existing groups).

ALTER TABLE IF EXISTS public.digideal_products
  ADD COLUMN IF NOT EXISTS digideal_group_id text;

CREATE INDEX IF NOT EXISTS idx_digideal_products_group_id
  ON public.digideal_products (digideal_group_id)
  WHERE digideal_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_digideal_products_seller_title
  ON public.digideal_products (seller_name, listing_title)
  WHERE seller_name IS NOT NULL AND listing_title IS NOT NULL;

-- Short, mostly human-friendly group IDs (8 chars, alphanumeric).
CREATE OR REPLACE FUNCTION public.digideal_make_group_id(len integer DEFAULT 8)
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  id text;
  effective_len integer := greatest(4, least(len, 16));
BEGIN
  LOOP
    id := substring(
      translate(encode(gen_random_bytes(12), 'base64'), '+/=', 'abc'),
      1,
      effective_len
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.digideal_products
      WHERE digideal_group_id = id
    );
  END LOOP;
  RETURN id;
END;
$$;

CREATE OR REPLACE FUNCTION public.digideal_products_assign_group_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  seller text;
  title text;
  phash bigint;
  candidate_group_ids text[];
  chosen_group_id text;
BEGIN
  seller := nullif(btrim(NEW.seller_name), '');
  IF seller IS NULL THEN
    RETURN NEW;
  END IF;

  title := nullif(btrim(NEW.listing_title), '');
  phash := NEW.primary_image_phash;

  -- Find all existing groups that match (within seller) by:
  -- - exact title OR
  -- - pHash similarity >= ~95% (distance <= 3)
  SELECT array_agg(DISTINCT dp.digideal_group_id)
  INTO candidate_group_ids
  FROM public.digideal_products dp
  WHERE dp.seller_name = seller
    AND dp.digideal_group_id IS NOT NULL
    AND (
      (title IS NOT NULL AND dp.listing_title = title)
      OR (
        phash IS NOT NULL
        AND dp.primary_image_phash IS NOT NULL
        AND public.phash64_distance(dp.primary_image_phash, phash) <= 3
      )
    );

  -- Include the row's current group (if any) so updates can merge groups.
  IF NEW.digideal_group_id IS NOT NULL THEN
    candidate_group_ids := array_append(candidate_group_ids, NEW.digideal_group_id);
  END IF;

  -- Pick a stable "canonical" group id: oldest first_seen among candidates.
  SELECT dp.digideal_group_id
  INTO chosen_group_id
  FROM public.digideal_products dp
  WHERE dp.digideal_group_id = ANY(candidate_group_ids)
  ORDER BY dp.first_seen_at ASC NULLS LAST, dp.digideal_group_id ASC
  LIMIT 1;

  IF chosen_group_id IS NULL THEN
    chosen_group_id := public.digideal_make_group_id(8);
  END IF;

  -- Merge any other group IDs into the canonical one (do not trigger recursion;
  -- the trigger is bound to updates of seller/title/phash only).
  UPDATE public.digideal_products
  SET digideal_group_id = chosen_group_id
  WHERE digideal_group_id IS NOT NULL
    AND digideal_group_id = ANY(candidate_group_ids)
    AND digideal_group_id <> chosen_group_id;

  -- Attach any matching rows that don't yet have a group.
  UPDATE public.digideal_products dp
  SET digideal_group_id = chosen_group_id
  WHERE dp.digideal_group_id IS NULL
    AND dp.seller_name = seller
    AND (
      (title IS NOT NULL AND dp.listing_title = title)
      OR (
        phash IS NOT NULL
        AND dp.primary_image_phash IS NOT NULL
        AND public.phash64_distance(dp.primary_image_phash, phash) <= 3
      )
    );

  NEW.digideal_group_id := chosen_group_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_digideal_products_assign_group_id ON public.digideal_products;
CREATE TRIGGER trg_digideal_products_assign_group_id
BEFORE INSERT OR UPDATE OF seller_name, listing_title, primary_image_phash
ON public.digideal_products
FOR EACH ROW
EXECUTE FUNCTION public.digideal_products_assign_group_id();

-- Ensure the app-facing view includes the group id.
create or replace view public.digideal_products_search as
with daily_raw as (
  select
    d.product_id,
    d.scrape_date,
    d.purchased_count,
    lag(d.purchased_count) over (
      partition by d.product_id
      order by d.scrape_date
    ) as prev_count
  from public.digideal_product_daily d
),
daily as (
  select
    daily_raw.product_id,
    daily_raw.scrape_date,
    case
      when daily_raw.prev_count is null then null::integer
      when daily_raw.purchased_count is null then null::integer
      else greatest(daily_raw.purchased_count - daily_raw.prev_count, 0)
    end as daily_value
  from daily_raw
),
history as (
  select daily_raw.product_id
  from daily_raw
  group by daily_raw.product_id
  having count(*) >= 7
),
latest as (
  select distinct on (d.product_id)
    d.product_id,
    d.daily_value as sold_today,
    d.scrape_date
  from daily d
  join history h on h.product_id = d.product_id
  where d.daily_value is not null
  order by d.product_id, d.scrape_date desc
),
sum7 as (
  select
    d.product_id,
    sum(d.daily_value) as sold_7d
  from daily d
  join history h on h.product_id = d.product_id
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
  dp.digideal_group_id
from public.digideal_products dp
left join latest on latest.product_id = dp.product_id
left join sum7 on sum7.product_id = dp.product_id;

grant select on public.digideal_products_search to anon, authenticated;

-- Ensure PostgREST picks up the updated schema/view definition without requiring a restart.
notify pgrst, 'reload schema';

