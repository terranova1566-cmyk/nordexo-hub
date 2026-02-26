create table if not exists public.partner_email_sender_signatures (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null unique,
  signature_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index if not exists partner_email_sender_signatures_lookup_idx
  on public.partner_email_sender_signatures (sender_email);

create or replace function public.partner_email_sender_signatures_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists partner_email_sender_signatures_touch_updated_at
  on public.partner_email_sender_signatures;
create trigger partner_email_sender_signatures_touch_updated_at
before update on public.partner_email_sender_signatures
for each row
execute function public.partner_email_sender_signatures_touch_updated_at();

alter table public.partner_email_sender_signatures enable row level security;

drop policy if exists partner_email_sender_signatures_admin_select
  on public.partner_email_sender_signatures;
drop policy if exists partner_email_sender_signatures_admin_insert
  on public.partner_email_sender_signatures;
drop policy if exists partner_email_sender_signatures_admin_update
  on public.partner_email_sender_signatures;
drop policy if exists partner_email_sender_signatures_admin_delete
  on public.partner_email_sender_signatures;

create policy "partner_email_sender_signatures_admin_select"
  on public.partner_email_sender_signatures
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_sender_signatures_admin_insert"
  on public.partner_email_sender_signatures
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_sender_signatures_admin_update"
  on public.partner_email_sender_signatures
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

create policy "partner_email_sender_signatures_admin_delete"
  on public.partner_email_sender_signatures
  for delete
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );
