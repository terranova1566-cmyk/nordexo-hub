-- DigiDeal: primary image perceptual hash (pHash) fingerprint.
-- Used to identify "same deal rerun" even when titles change.

ALTER TABLE IF EXISTS public.digideal_products
  ADD COLUMN IF NOT EXISTS primary_image_phash bigint,
  ADD COLUMN IF NOT EXISTS primary_image_phash_hex text,
  ADD COLUMN IF NOT EXISTS primary_image_phash_updated_at timestamptz;

-- Speed up exact match lookups and pre-filtering by seller.
CREATE INDEX IF NOT EXISTS idx_digideal_products_primary_image_phash
  ON public.digideal_products (primary_image_phash)
  WHERE primary_image_phash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_digideal_products_seller_primary_image_phash
  ON public.digideal_products (seller_name, primary_image_phash)
  WHERE primary_image_phash IS NOT NULL;

-- Hamming distance for two signed BIGINTs interpreted as 64-bit patterns.
-- Example: 95% similarity threshold ~= distance <= 3 (since (64 - 3) / 64 ≈ 95.3%).
CREATE OR REPLACE FUNCTION public.phash64_distance(a bigint, b bigint)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT bit_count(((a # b)::bit(64)));
$$;

CREATE OR REPLACE FUNCTION public.phash64_similarity(a bigint, b bigint)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT (64 - bit_count(((a # b)::bit(64)))) / 64.0;
$$;

