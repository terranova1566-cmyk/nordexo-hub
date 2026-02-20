create table if not exists public.chatwoot_reply_templates (
  template_id text primary key,
  name text not null,
  description text,
  macros text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint chatwoot_reply_templates_template_id_format
    check (template_id ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{1,63}$')
);

create table if not exists public.chatwoot_reply_template_localizations (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references public.chatwoot_reply_templates(template_id) on delete cascade,
  language_code text not null,
  subject_template text not null default '',
  body_template text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint chatwoot_reply_template_localizations_lang_check
    check (language_code in ('sv', 'no', 'fi', 'en')),
  constraint chatwoot_reply_template_localizations_template_lang_unique
    unique (template_id, language_code)
);

create table if not exists public.chatwoot_reply_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references public.chatwoot_reply_templates(template_id) on delete cascade,
  language_code text not null,
  subject_template text not null default '',
  body_template text not null default '',
  macros text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint chatwoot_reply_template_versions_lang_check
    check (language_code in ('sv', 'no', 'fi', 'en'))
);

create index if not exists chatwoot_reply_templates_updated_idx
  on public.chatwoot_reply_templates (updated_at desc);

create index if not exists chatwoot_reply_template_localizations_lookup_idx
  on public.chatwoot_reply_template_localizations (template_id, language_code, updated_at desc);

create index if not exists chatwoot_reply_template_versions_template_idx
  on public.chatwoot_reply_template_versions (template_id, language_code, created_at desc);

create or replace function public.chatwoot_reply_templates_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chatwoot_reply_templates_touch_updated_at on public.chatwoot_reply_templates;
create trigger chatwoot_reply_templates_touch_updated_at
before update on public.chatwoot_reply_templates
for each row
execute function public.chatwoot_reply_templates_touch_updated_at();

drop trigger if exists chatwoot_reply_template_localizations_touch_updated_at on public.chatwoot_reply_template_localizations;
create trigger chatwoot_reply_template_localizations_touch_updated_at
before update on public.chatwoot_reply_template_localizations
for each row
execute function public.chatwoot_reply_templates_touch_updated_at();

alter table public.chatwoot_reply_templates enable row level security;
alter table public.chatwoot_reply_template_localizations enable row level security;
alter table public.chatwoot_reply_template_versions enable row level security;

drop policy if exists chatwoot_reply_templates_admin_select on public.chatwoot_reply_templates;
drop policy if exists chatwoot_reply_templates_admin_insert on public.chatwoot_reply_templates;
drop policy if exists chatwoot_reply_templates_admin_update on public.chatwoot_reply_templates;
drop policy if exists chatwoot_reply_templates_admin_delete on public.chatwoot_reply_templates;

drop policy if exists chatwoot_reply_template_localizations_admin_select on public.chatwoot_reply_template_localizations;
drop policy if exists chatwoot_reply_template_localizations_admin_insert on public.chatwoot_reply_template_localizations;
drop policy if exists chatwoot_reply_template_localizations_admin_update on public.chatwoot_reply_template_localizations;
drop policy if exists chatwoot_reply_template_localizations_admin_delete on public.chatwoot_reply_template_localizations;

drop policy if exists chatwoot_reply_template_versions_admin_select on public.chatwoot_reply_template_versions;
drop policy if exists chatwoot_reply_template_versions_admin_insert on public.chatwoot_reply_template_versions;
drop policy if exists chatwoot_reply_template_versions_admin_delete on public.chatwoot_reply_template_versions;

create policy "chatwoot_reply_templates_admin_select"
  on public.chatwoot_reply_templates
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "chatwoot_reply_templates_admin_insert"
  on public.chatwoot_reply_templates
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "chatwoot_reply_templates_admin_update"
  on public.chatwoot_reply_templates
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

create policy "chatwoot_reply_templates_admin_delete"
  on public.chatwoot_reply_templates
  for delete
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "chatwoot_reply_template_localizations_admin_select"
  on public.chatwoot_reply_template_localizations
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "chatwoot_reply_template_localizations_admin_insert"
  on public.chatwoot_reply_template_localizations
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "chatwoot_reply_template_localizations_admin_update"
  on public.chatwoot_reply_template_localizations
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

create policy "chatwoot_reply_template_localizations_admin_delete"
  on public.chatwoot_reply_template_localizations
  for delete
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "chatwoot_reply_template_versions_admin_select"
  on public.chatwoot_reply_template_versions
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "chatwoot_reply_template_versions_admin_insert"
  on public.chatwoot_reply_template_versions
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "chatwoot_reply_template_versions_admin_delete"
  on public.chatwoot_reply_template_versions
  for delete
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

grant select, insert, update, delete on public.chatwoot_reply_templates to authenticated;
grant select, insert, update, delete on public.chatwoot_reply_template_localizations to authenticated;
grant select, insert, delete on public.chatwoot_reply_template_versions to authenticated;
