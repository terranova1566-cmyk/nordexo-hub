-- Store confidence + status for DigiDeal taxonomy assignments.

alter table public.digideal_products
  add column if not exists google_taxonomy_confidence double precision,
  add column if not exists google_taxonomy_status text,
  add column if not exists google_taxonomy_model_pass1 text,
  add column if not exists google_taxonomy_model_pass2 text,
  add column if not exists google_taxonomy_categorized_at timestamptz;

create index if not exists digideal_products_google_taxonomy_status_idx
  on public.digideal_products (google_taxonomy_status);

