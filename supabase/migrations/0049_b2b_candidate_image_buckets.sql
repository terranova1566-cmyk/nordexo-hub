-- B2B product candidates: keep gallery vs description-body images separated.
alter table if exists public.b2b_product_candidates
  add column if not exists gallery_images text[] not null default array[]::text[],
  add column if not exists description_images text[] not null default array[]::text[];

-- Backfill existing rows (before this migration) with gallery_images = images.
update public.b2b_product_candidates
set gallery_images = images
where coalesce(array_length(gallery_images, 1), 0) = 0
  and coalesce(array_length(images, 1), 0) > 0;

