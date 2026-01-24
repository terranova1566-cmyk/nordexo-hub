alter table public.catalog_variants
  add column if not exists b2b_dropship_price_se numeric,
  add column if not exists b2b_dropship_price_no numeric,
  add column if not exists b2b_dropship_price_dk numeric,
  add column if not exists b2b_dropship_price_fi numeric;
