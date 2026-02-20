create table if not exists public.partner_email_macro_registry (
  id uuid primary key default gen_random_uuid(),
  macro_key text not null unique,
  label text not null,
  description text,
  data_source text not null default 'variables',
  formatter text,
  fallback_value text,
  is_required boolean not null default false,
  is_deprecated boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint partner_email_macro_registry_key_format
    check (macro_key ~ '^[A-Za-z0-9_]{2,64}$')
);

create index if not exists partner_email_macro_registry_lookup_idx
  on public.partner_email_macro_registry (is_active, is_deprecated, macro_key);

create or replace function public.partner_email_macro_registry_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists partner_email_macro_registry_touch_updated_at
  on public.partner_email_macro_registry;
create trigger partner_email_macro_registry_touch_updated_at
before update on public.partner_email_macro_registry
for each row
execute function public.partner_email_macro_registry_touch_updated_at();

insert into public.partner_email_macro_registry (
  macro_key,
  label,
  description,
  data_source,
  formatter,
  fallback_value,
  is_required,
  is_deprecated,
  is_active
)
values
  (
    'partner_name',
    'Partner name',
    'Display name for the partner receiving the email.',
    'variables.partner_name',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'products_csv_url',
    'Products CSV URL',
    'Public URL to the generated product spreadsheet.',
    'variables.products_csv_url',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'top_sellers_url',
    'Top sellers URL',
    'Public URL to the top-sellers report.',
    'variables.top_sellers_url',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'date_range',
    'Date range',
    'Date span rendered in partner update emails.',
    'variables.date_range',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'PARTNER_CONTACT_NAME',
    'Partner contact name',
    'Named contact for the recipient partner account.',
    'variables.PARTNER_CONTACT_NAME',
    'trim',
    null,
    false,
    false,
    true
  )
on conflict (macro_key) do nothing;

alter table public.partner_email_macro_registry enable row level security;

drop policy if exists partner_email_macro_registry_admin_select
  on public.partner_email_macro_registry;
drop policy if exists partner_email_macro_registry_admin_insert
  on public.partner_email_macro_registry;
drop policy if exists partner_email_macro_registry_admin_update
  on public.partner_email_macro_registry;
drop policy if exists partner_email_macro_registry_admin_delete
  on public.partner_email_macro_registry;

create policy "partner_email_macro_registry_admin_select"
  on public.partner_email_macro_registry
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_macro_registry_admin_insert"
  on public.partner_email_macro_registry
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_macro_registry_admin_update"
  on public.partner_email_macro_registry
  for update
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_macro_registry_admin_delete"
  on public.partner_email_macro_registry
  for delete
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );
