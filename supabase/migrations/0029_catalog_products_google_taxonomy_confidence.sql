-- Store model confidence + status for taxonomy assignments so we can re-run low-confidence items later.

alter table public.catalog_products
  add column if not exists google_taxonomy_confidence double precision,
  add column if not exists google_taxonomy_confidence_secondary double precision,
  add column if not exists google_taxonomy_status text,
  add column if not exists google_taxonomy_model_pass1 text,
  add column if not exists google_taxonomy_model_pass2 text,
  add column if not exists google_taxonomy_categorized_at timestamptz;

create index if not exists catalog_products_google_taxonomy_status_idx
  on public.catalog_products (google_taxonomy_status);

