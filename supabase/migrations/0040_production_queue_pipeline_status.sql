-- Track Production Queue pipeline progress per product and map SPUs back to queue rows.

create table if not exists public.discovery_production_status (
  provider text not null,
  product_id text not null,
  status text,
  spu_assigned_at timestamptz,
  production_started_at timestamptz,
  production_done_at timestamptz,
  last_file_name text,
  last_job_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, product_id)
);

create index if not exists discovery_production_status_status_idx
  on public.discovery_production_status (status, updated_at desc);

create table if not exists public.discovery_production_item_spus (
  provider text not null,
  product_id text not null,
  spu text not null,
  source_file_name text,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (provider, product_id, spu)
);

create index if not exists discovery_production_item_spus_spu_idx
  on public.discovery_production_item_spus (spu);

create index if not exists discovery_production_item_spus_file_idx
  on public.discovery_production_item_spus (source_file_name, assigned_at desc);

alter table public.discovery_production_status enable row level security;
alter table public.discovery_production_item_spus enable row level security;

drop policy if exists "discovery_production_status_admin"
  on public.discovery_production_status;
create policy "discovery_production_status_admin"
  on public.discovery_production_status
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "discovery_production_item_spus_admin"
  on public.discovery_production_item_spus;
create policy "discovery_production_item_spus_admin"
  on public.discovery_production_item_spus
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.discovery_production_status to authenticated;
grant select, insert, update, delete on public.discovery_production_item_spus to authenticated;
