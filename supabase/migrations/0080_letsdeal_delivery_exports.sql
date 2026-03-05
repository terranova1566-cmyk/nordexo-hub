-- LetsDeal delivery exports: generated copy storage + per-list rewrite job tracking.

create table if not exists public.letsdeal_product_texts (
  product_id uuid primary key references public.catalog_products(id) on delete cascade,
  title_1_sv text,
  title_2_sv text,
  summary_sv text,
  product_information_sv text,
  title_1_no text,
  title_2_no text,
  summary_no text,
  product_information_no text,
  source_hash text,
  source_payload jsonb,
  model_sv text,
  model_no text,
  generated_at_sv timestamptz,
  generated_at_no timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.letsdeal_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.product_manager_wishlists(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  attempt_count integer not null default 0,
  error_message text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wishlist_id, product_id)
);

create index if not exists letsdeal_delivery_jobs_wishlist_status_idx
  on public.letsdeal_delivery_jobs (wishlist_id, status, updated_at desc);

create index if not exists letsdeal_delivery_jobs_product_idx
  on public.letsdeal_delivery_jobs (product_id, updated_at desc);

alter table public.letsdeal_product_texts enable row level security;
alter table public.letsdeal_delivery_jobs enable row level security;

drop policy if exists "letsdeal_product_texts_admin" on public.letsdeal_product_texts;
create policy "letsdeal_product_texts_admin"
  on public.letsdeal_product_texts
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "letsdeal_delivery_jobs_admin" on public.letsdeal_delivery_jobs;
create policy "letsdeal_delivery_jobs_admin"
  on public.letsdeal_delivery_jobs
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.letsdeal_product_texts to authenticated;
grant select, insert, update, delete on public.letsdeal_delivery_jobs to authenticated;
