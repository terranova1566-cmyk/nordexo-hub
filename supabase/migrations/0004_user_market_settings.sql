create table if not exists public.partner_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_markets text[] not null default array['SE']
);

alter table public.partner_user_settings enable row level security;

create policy "partner_user_settings_select"
  on public.partner_user_settings
  for select
  using (auth.uid() = user_id);

create policy "partner_user_settings_insert"
  on public.partner_user_settings
  for insert
  with check (auth.uid() = user_id);

create policy "partner_user_settings_update"
  on public.partner_user_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.partner_user_settings to authenticated;
