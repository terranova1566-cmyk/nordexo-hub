alter table public.partner_user_settings
  add column if not exists is_admin boolean not null default false;
