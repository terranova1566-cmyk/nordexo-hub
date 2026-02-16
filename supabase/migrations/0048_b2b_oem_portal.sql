-- B2B OEM sourcing + production management portal (MVP skeleton).
-- Internal-only via RLS + public share links via server-side (service role) access.

create or replace function public.b2b_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Customers
create table if not exists public.b2b_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_info jsonb not null default '{}'::jsonb,
  main_currency text not null default 'SEK',
  contacts jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists b2b_customers_touch_updated_at on public.b2b_customers;
create trigger b2b_customers_touch_updated_at
before update on public.b2b_customers
for each row
execute function public.b2b_touch_updated_at();

create index if not exists b2b_customers_name_idx
  on public.b2b_customers (name);

-- Roles (optional): allows future separation of Admin vs Worker vs Customer.
create table if not exists public.b2b_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'worker' check (role in ('admin', 'worker', 'customer')),
  customer_id uuid references public.b2b_customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists b2b_user_roles_touch_updated_at on public.b2b_user_roles;
create trigger b2b_user_roles_touch_updated_at
before update on public.b2b_user_roles
for each row
execute function public.b2b_touch_updated_at();

-- RLS helper for B2B: internal users are either existing app admins or explicit B2B workers.
create or replace function public.b2b_is_internal()
returns boolean
language sql
stable
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.b2b_user_roles r
      where r.user_id = auth.uid()
        and r.role in ('admin', 'worker')
    );
$$;

grant execute on function public.b2b_is_internal() to authenticated;

-- Projects
create table if not exists public.b2b_projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.b2b_customers(id) on delete cascade,
  title text not null,
  description text,
  brief text,
  status text not null default 'lead' check (
    status in (
      'lead',
      'sourcing',
      'sampling',
      'negotiation',
      'ordering',
      'production',
      'shipping',
      'complete',
      'paused',
      'cancelled'
    )
  ),
  target_start_date date,
  target_end_date date,
  currency text not null default 'SEK',
  exchange_rate_cny numeric not null default 1 check (exchange_rate_cny > 0),
  margin_percent_default numeric not null default 0 check (margin_percent_default >= 0),
  margin_fixed_default numeric not null default 0 check (margin_fixed_default >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists b2b_projects_touch_updated_at on public.b2b_projects;
create trigger b2b_projects_touch_updated_at
before update on public.b2b_projects
for each row
execute function public.b2b_touch_updated_at();

create index if not exists b2b_projects_customer_idx
  on public.b2b_projects (customer_id);

create index if not exists b2b_projects_status_idx
  on public.b2b_projects (status);

-- Suppliers (sensitive: never expose publicly)
create table if not exists public.b2b_suppliers (
  id uuid primary key default gen_random_uuid(),
  platform text not null default '1688' check (platform in ('1688')),
  internal_name text not null,
  platform_store_url text,
  contact_handles jsonb not null default '{}'::jsonb,
  ratings jsonb not null default '{}'::jsonb,
  is_sensitive boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists b2b_suppliers_touch_updated_at on public.b2b_suppliers;
create trigger b2b_suppliers_touch_updated_at
before update on public.b2b_suppliers
for each row
execute function public.b2b_touch_updated_at();

create unique index if not exists b2b_suppliers_platform_store_url_unique
  on public.b2b_suppliers (platform_store_url)
  where platform_store_url is not null;

-- Product candidates
create table if not exists public.b2b_product_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.b2b_projects(id) on delete cascade,
  source_type text not null default 'manual' check (source_type in ('1688_product_url', 'manual')),
  source_url text,
  supplier_id uuid references public.b2b_suppliers(id) on delete set null,
  raw_scrape_json jsonb,
  title text,
  images text[] not null default array[]::text[],
  videos text[] not null default array[]::text[],
  price_tiers jsonb not null default '[]'::jsonb,
  source_currency text not null default 'CNY',
  source_price_min_cny numeric,
  source_price_max_cny numeric,
  moq integer,
  variants jsonb not null default '{}'::jsonb,
  weight_product_kg numeric,
  weight_package_kg numeric,
  packaging jsonb not null default '{}'::jsonb,
  lead_times jsonb not null default '{}'::jsonb,
  final_price_with_logo_cny numeric,
  final_price_without_logo_cny numeric,
  final_moq integer,
  final_lead_time_days integer,
  branding_costs_cny jsonb not null default '{}'::jsonb,
  packaging_costs_cny jsonb not null default '{}'::jsonb,
  notes text,
  margin_percent_override numeric check (margin_percent_override is null or margin_percent_override >= 0),
  margin_fixed_override numeric check (margin_fixed_override is null or margin_fixed_override >= 0),
  status text not null default 'candidate' check (
    status in (
      'candidate',
      'contacting',
      'sampling',
      'negotiating',
      'approved',
      'ordered',
      'in_production',
      'shipped',
      'delivered',
      'dropped'
    )
  ),
  is_shortlisted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists b2b_product_candidates_touch_updated_at on public.b2b_product_candidates;
create trigger b2b_product_candidates_touch_updated_at
before update on public.b2b_product_candidates
for each row
execute function public.b2b_touch_updated_at();

create index if not exists b2b_product_candidates_project_idx
  on public.b2b_product_candidates (project_id, updated_at desc);

create index if not exists b2b_product_candidates_status_idx
  on public.b2b_product_candidates (status);

create index if not exists b2b_product_candidates_shortlist_idx
  on public.b2b_product_candidates (project_id, is_shortlisted);

-- Supplier lookbooks
create table if not exists public.b2b_supplier_lookbooks (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.b2b_suppliers(id) on delete set null,
  title text not null,
  description text,
  curated_for_customer_id uuid references public.b2b_customers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists b2b_supplier_lookbooks_touch_updated_at on public.b2b_supplier_lookbooks;
create trigger b2b_supplier_lookbooks_touch_updated_at
before update on public.b2b_supplier_lookbooks
for each row
execute function public.b2b_touch_updated_at();

create index if not exists b2b_supplier_lookbooks_supplier_idx
  on public.b2b_supplier_lookbooks (supplier_id);

create index if not exists b2b_supplier_lookbooks_curated_customer_idx
  on public.b2b_supplier_lookbooks (curated_for_customer_id);

-- Lookbook items: either linked to a product candidate OR kept as a raw preview.
create table if not exists public.b2b_supplier_lookbook_items (
  id uuid primary key default gen_random_uuid(),
  lookbook_id uuid not null references public.b2b_supplier_lookbooks(id) on delete cascade,
  product_candidate_id uuid references public.b2b_product_candidates(id) on delete set null,
  title text,
  image_url text,
  preview_price_cny numeric,
  preview_weight_kg numeric,
  tags text[] not null default array[]::text[],
  source_url text,
  raw_preview_json jsonb not null default '{}'::jsonb,
  exposed_to_customer boolean not null default false,
  position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists b2b_supplier_lookbook_items_touch_updated_at on public.b2b_supplier_lookbook_items;
create trigger b2b_supplier_lookbook_items_touch_updated_at
before update on public.b2b_supplier_lookbook_items
for each row
execute function public.b2b_touch_updated_at();

create index if not exists b2b_supplier_lookbook_items_lookbook_idx
  on public.b2b_supplier_lookbook_items (lookbook_id, position nulls last, created_at desc);

create index if not exists b2b_supplier_lookbook_items_exposed_idx
  on public.b2b_supplier_lookbook_items (lookbook_id, exposed_to_customer);

-- Tasks
create table if not exists public.b2b_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.b2b_projects(id) on delete cascade,
  product_candidate_id uuid references public.b2b_product_candidates(id) on delete set null,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  due_date date,
  status text not null default 'open' check (
    status in ('open', 'in_progress', 'waiting', 'done', 'cancelled')
  ),
  type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists b2b_tasks_touch_updated_at on public.b2b_tasks;
create trigger b2b_tasks_touch_updated_at
before update on public.b2b_tasks
for each row
execute function public.b2b_touch_updated_at();

create index if not exists b2b_tasks_assignee_idx
  on public.b2b_tasks (assigned_to_user_id, due_date nulls last);

create index if not exists b2b_tasks_project_idx
  on public.b2b_tasks (project_id, status);

-- Conversation / negotiation entries
create table if not exists public.b2b_conversation_entries (
  id uuid primary key default gen_random_uuid(),
  product_candidate_id uuid not null references public.b2b_product_candidates(id) on delete cascade,
  channel text not null default 'wechat' check (
    channel in ('wechat', 'whatsapp', 'email', 'call', 'other')
  ),
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists b2b_conversation_entries_candidate_idx
  on public.b2b_conversation_entries (product_candidate_id, created_at desc);

-- Notes (generic)
create table if not exists public.b2b_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (
    entity_type in ('customer', 'project', 'candidate', 'supplier', 'lookbook', 'lookbook_item', 'task', 'share_link')
  ),
  entity_id uuid not null,
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists b2b_notes_entity_idx
  on public.b2b_notes (entity_type, entity_id, created_at desc);

-- Activity log (generic)
create table if not exists public.b2b_activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (
    entity_type in ('customer', 'project', 'candidate', 'supplier', 'lookbook', 'lookbook_item', 'task', 'share_link')
  ),
  entity_id uuid not null,
  action text not null,
  diff jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists b2b_activity_log_entity_idx
  on public.b2b_activity_log (entity_type, entity_id, created_at desc);

-- Share links (public access via token; RLS is internal-only, public reads happen server-side)
create table if not exists public.b2b_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  type text not null check (type in ('lookbook', 'project', 'product')),
  entity_id uuid not null,
  expires_at timestamptz,
  permissions text[] not null default array['view']::text[] check (
    permissions <@ array['view', 'select', 'comment']::text[]
    and array_length(permissions, 1) is not null
    and 'view' = any(permissions)
  ),
  sanitized_view_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_accessed_at timestamptz
);

create index if not exists b2b_share_links_entity_idx
  on public.b2b_share_links (type, entity_id, created_at desc);

-- Customer selections on share pages (written server-side with service role)
create table if not exists public.b2b_customer_selections (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.b2b_share_links(id) on delete cascade,
  external_user_session_id text not null,
  lookbook_item_id uuid references public.b2b_supplier_lookbook_items(id) on delete cascade,
  product_candidate_id uuid references public.b2b_product_candidates(id) on delete cascade,
  selection_state text not null default 'selected' check (
    selection_state in ('selected', 'favorited', 'unselected', 'rejected')
  ),
  comment text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (lookbook_item_id is not null and product_candidate_id is null)
    or (lookbook_item_id is null and product_candidate_id is not null)
  )
);

drop trigger if exists b2b_customer_selections_touch_updated_at on public.b2b_customer_selections;
create trigger b2b_customer_selections_touch_updated_at
before update on public.b2b_customer_selections
for each row
execute function public.b2b_touch_updated_at();

create index if not exists b2b_customer_selections_share_idx
  on public.b2b_customer_selections (share_link_id, created_at desc);

create index if not exists b2b_customer_selections_session_idx
  on public.b2b_customer_selections (external_user_session_id);

create unique index if not exists b2b_customer_selections_unique_candidate
  on public.b2b_customer_selections (share_link_id, external_user_session_id, product_candidate_id)
  where product_candidate_id is not null;

create unique index if not exists b2b_customer_selections_unique_lookbook_item
  on public.b2b_customer_selections (share_link_id, external_user_session_id, lookbook_item_id)
  where lookbook_item_id is not null;

-- RLS
alter table public.b2b_user_roles enable row level security;
alter table public.b2b_customers enable row level security;
alter table public.b2b_projects enable row level security;
alter table public.b2b_suppliers enable row level security;
alter table public.b2b_product_candidates enable row level security;
alter table public.b2b_supplier_lookbooks enable row level security;
alter table public.b2b_supplier_lookbook_items enable row level security;
alter table public.b2b_tasks enable row level security;
alter table public.b2b_conversation_entries enable row level security;
alter table public.b2b_notes enable row level security;
alter table public.b2b_activity_log enable row level security;
alter table public.b2b_share_links enable row level security;
alter table public.b2b_customer_selections enable row level security;

-- FORCE RLS to avoid accidental bypass via views owned by postgres.
alter table public.b2b_user_roles force row level security;
alter table public.b2b_customers force row level security;
alter table public.b2b_projects force row level security;
alter table public.b2b_suppliers force row level security;
alter table public.b2b_product_candidates force row level security;
alter table public.b2b_supplier_lookbooks force row level security;
alter table public.b2b_supplier_lookbook_items force row level security;
alter table public.b2b_tasks force row level security;
alter table public.b2b_conversation_entries force row level security;
alter table public.b2b_notes force row level security;
alter table public.b2b_activity_log force row level security;
alter table public.b2b_share_links force row level security;
alter table public.b2b_customer_selections force row level security;

-- Drop policies first to keep migration re-runnable.
drop policy if exists b2b_user_roles_select on public.b2b_user_roles;
drop policy if exists b2b_user_roles_admin_write on public.b2b_user_roles;

create policy "b2b_user_roles_select"
  on public.b2b_user_roles
  for select
  using (auth.uid() = user_id or public.is_admin());

create policy "b2b_user_roles_admin_write"
  on public.b2b_user_roles
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Internal-only: all B2B portal tables are internal for MVP.
drop policy if exists b2b_customers_internal on public.b2b_customers;
drop policy if exists b2b_projects_internal on public.b2b_projects;
drop policy if exists b2b_suppliers_internal on public.b2b_suppliers;
drop policy if exists b2b_product_candidates_internal on public.b2b_product_candidates;
drop policy if exists b2b_supplier_lookbooks_internal on public.b2b_supplier_lookbooks;
drop policy if exists b2b_supplier_lookbook_items_internal on public.b2b_supplier_lookbook_items;
drop policy if exists b2b_tasks_internal on public.b2b_tasks;
drop policy if exists b2b_conversation_entries_internal on public.b2b_conversation_entries;
drop policy if exists b2b_notes_internal on public.b2b_notes;
drop policy if exists b2b_activity_log_internal on public.b2b_activity_log;
drop policy if exists b2b_share_links_internal on public.b2b_share_links;
drop policy if exists b2b_customer_selections_internal on public.b2b_customer_selections;

create policy "b2b_customers_internal"
  on public.b2b_customers
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_projects_internal"
  on public.b2b_projects
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_suppliers_internal"
  on public.b2b_suppliers
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_product_candidates_internal"
  on public.b2b_product_candidates
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_supplier_lookbooks_internal"
  on public.b2b_supplier_lookbooks
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_supplier_lookbook_items_internal"
  on public.b2b_supplier_lookbook_items
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_tasks_internal"
  on public.b2b_tasks
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_conversation_entries_internal"
  on public.b2b_conversation_entries
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_notes_internal"
  on public.b2b_notes
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_activity_log_internal"
  on public.b2b_activity_log
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_share_links_internal"
  on public.b2b_share_links
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

create policy "b2b_customer_selections_internal"
  on public.b2b_customer_selections
  for all
  using (public.b2b_is_internal())
  with check (public.b2b_is_internal());

grant select, insert, update, delete on public.b2b_user_roles to authenticated;
grant select, insert, update, delete on public.b2b_customers to authenticated;
grant select, insert, update, delete on public.b2b_projects to authenticated;
grant select, insert, update, delete on public.b2b_suppliers to authenticated;
grant select, insert, update, delete on public.b2b_product_candidates to authenticated;
grant select, insert, update, delete on public.b2b_supplier_lookbooks to authenticated;
grant select, insert, update, delete on public.b2b_supplier_lookbook_items to authenticated;
grant select, insert, update, delete on public.b2b_tasks to authenticated;
grant select, insert, update, delete on public.b2b_conversation_entries to authenticated;
grant select, insert, update, delete on public.b2b_notes to authenticated;
grant select, insert, update, delete on public.b2b_activity_log to authenticated;
grant select, insert, update, delete on public.b2b_share_links to authenticated;
grant select, insert, update, delete on public.b2b_customer_selections to authenticated;
