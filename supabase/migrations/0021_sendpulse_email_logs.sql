create table if not exists public.sendpulse_email_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id),
  sender_email text,
  sender_name text,
  template_id text,
  subject text,
  to_emails text[] not null default '{}',
  variables jsonb,
  status text not null,
  response jsonb,
  error text
);

alter table public.sendpulse_email_logs enable row level security;

create policy "sendpulse_email_logs_admin_select"
  on public.sendpulse_email_logs
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "sendpulse_email_logs_admin_insert"
  on public.sendpulse_email_logs
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

grant select, insert on public.sendpulse_email_logs to authenticated;
