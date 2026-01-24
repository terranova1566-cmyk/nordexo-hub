alter table public.partner_user_settings
  add column if not exists full_name text,
  add column if not exists company_name text,
  add column if not exists job_title text,
  add column if not exists avatar_url text;
