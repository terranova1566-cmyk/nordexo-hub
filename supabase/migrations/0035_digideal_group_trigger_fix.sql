-- Fix: avoid updating the same row being inserted/updated inside the grouping trigger.
-- Otherwise Postgres can raise:
--   "tuple to be updated was already modified by an operation triggered by the current command"

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

  IF NEW.digideal_group_id IS NOT NULL THEN
    candidate_group_ids := array_append(candidate_group_ids, NEW.digideal_group_id);
  END IF;

  SELECT dp.digideal_group_id
  INTO chosen_group_id
  FROM public.digideal_products dp
  WHERE dp.digideal_group_id = ANY(candidate_group_ids)
  ORDER BY dp.first_seen_at ASC NULLS LAST, dp.digideal_group_id ASC
  LIMIT 1;

  IF chosen_group_id IS NULL THEN
    chosen_group_id := public.digideal_make_group_id(8);
  END IF;

  -- Merge other groups into the canonical group.
  UPDATE public.digideal_products
  SET digideal_group_id = chosen_group_id
  WHERE product_id <> NEW.product_id
    AND digideal_group_id IS NOT NULL
    AND digideal_group_id = ANY(candidate_group_ids)
    AND digideal_group_id <> chosen_group_id;

  -- Attach matching rows without a group.
  UPDATE public.digideal_products dp
  SET digideal_group_id = chosen_group_id
  WHERE dp.product_id <> NEW.product_id
    AND dp.digideal_group_id IS NULL
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

notify pgrst, 'reload schema';

