create table if not exists public.partner_email_smtp_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  from_email text not null,
  from_name text,
  smtp_host text not null,
  smtp_port integer not null default 587,
  smtp_secure boolean not null default false,
  smtp_user text not null,
  smtp_pass text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint partner_email_smtp_accounts_port_range
    check (smtp_port >= 1 and smtp_port <= 65535)
);

create index if not exists partner_email_smtp_accounts_active_idx
  on public.partner_email_smtp_accounts (is_active, updated_at desc);

alter table public.partner_email_smtp_accounts enable row level security;

create policy "partner_email_smtp_accounts_admin_select"
  on public.partner_email_smtp_accounts
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_smtp_accounts_admin_insert"
  on public.partner_email_smtp_accounts
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_smtp_accounts_admin_update"
  on public.partner_email_smtp_accounts
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

create policy "partner_email_smtp_accounts_admin_delete"
  on public.partner_email_smtp_accounts
  for delete
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

grant select, insert, update, delete on public.partner_email_smtp_accounts to authenticated;
