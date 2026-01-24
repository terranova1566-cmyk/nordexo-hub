alter table public.partner_user_settings
  add column if not exists preferred_locale text not null default 'en';

update public.partner_user_settings
  set preferred_locale = 'en'
  where preferred_locale is null;

create table if not exists public.portal_ui_translations (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  locale text not null,
  value text not null,
  context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists portal_ui_translations_key_locale_idx
  on public.portal_ui_translations (key, locale);

alter table public.portal_ui_translations enable row level security;

create policy "portal_ui_translations_select_anon"
  on public.portal_ui_translations
  for select
  to anon
  using (true);

create policy "portal_ui_translations_select_auth"
  on public.portal_ui_translations
  for select
  to authenticated
  using (true);

grant select on public.portal_ui_translations to anon, authenticated;
