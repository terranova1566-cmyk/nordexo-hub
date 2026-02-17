create table if not exists public.partner_email_templates (
  id uuid primary key default gen_random_uuid(),
  template_id text not null unique,
  name text not null,
  description text,
  subject_template text not null default '',
  body_template text not null default '',
  macros text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint partner_email_templates_template_id_format
    check (template_id ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{1,63}$')
);

create table if not exists public.partner_email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references public.partner_email_templates(template_id) on delete cascade,
  subject_template text not null default '',
  body_template text not null default '',
  macros text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists partner_email_templates_updated_idx
  on public.partner_email_templates (updated_at desc);

create index if not exists partner_email_template_versions_template_idx
  on public.partner_email_template_versions (template_id, created_at desc);

create table if not exists public.partner_public_file_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  file_path text not null,
  original_name text,
  content_type text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  retain_until timestamptz not null,
  created_by uuid references auth.users(id),
  download_count integer not null default 0,
  last_download_at timestamptz,
  disabled boolean not null default false
);

create index if not exists partner_public_file_links_token_idx
  on public.partner_public_file_links (token);

create index if not exists partner_public_file_links_expiry_idx
  on public.partner_public_file_links (expires_at, retain_until);

create table if not exists public.partner_email_send_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id),
  sender_email text,
  sender_name text,
  template_id text,
  subject text,
  to_emails text[] not null default '{}',
  variables jsonb,
  rendered_subject text,
  rendered_body text,
  status text not null,
  response jsonb,
  error text
);

alter table public.partner_email_templates enable row level security;
alter table public.partner_email_template_versions enable row level security;
alter table public.partner_public_file_links enable row level security;
alter table public.partner_email_send_logs enable row level security;

create policy "partner_email_templates_admin_select"
  on public.partner_email_templates
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_templates_admin_insert"
  on public.partner_email_templates
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_templates_admin_update"
  on public.partner_email_templates
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

create policy "partner_email_templates_admin_delete"
  on public.partner_email_templates
  for delete
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_template_versions_admin_select"
  on public.partner_email_template_versions
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_template_versions_admin_insert"
  on public.partner_email_template_versions
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_template_versions_admin_delete"
  on public.partner_email_template_versions
  for delete
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_public_file_links_admin_select"
  on public.partner_public_file_links
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_public_file_links_admin_insert"
  on public.partner_public_file_links
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_public_file_links_admin_update"
  on public.partner_public_file_links
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

create policy "partner_public_file_links_admin_delete"
  on public.partner_public_file_links
  for delete
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_send_logs_admin_select"
  on public.partner_email_send_logs
  for select
  using (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

create policy "partner_email_send_logs_admin_insert"
  on public.partner_email_send_logs
  for insert
  with check (
    exists (
      select 1
      from public.partner_user_settings
      where partner_user_settings.user_id = auth.uid()
        and partner_user_settings.is_admin = true
    )
  );

grant select, insert, update, delete on public.partner_email_templates to authenticated;
grant select, insert, delete on public.partner_email_template_versions to authenticated;
grant select, insert, update, delete on public.partner_public_file_links to authenticated;
grant select, insert on public.partner_email_send_logs to authenticated;

insert into public.partner_email_templates (
  template_id,
  name,
  description,
  subject_template,
  body_template,
  macros
)
values
  (
    'new_products',
    'New products',
    'Partner update for new products and downloadable file links.',
    'New products for {{partner_name}} ({{date_range}})',
    '<p>Hi {{PARTNER_CONTACT_NAME}},</p><p>Here are the latest products for {{date_range}}.</p><p><a href="{{products_csv_url}}">Download products file</a></p><p><a href="{{top_sellers_url}}">View top sellers</a></p>',
    array['partner_name', 'products_csv_url', 'top_sellers_url', 'date_range', 'PARTNER_CONTACT_NAME']
  ),
  (
    'rerun_suggestions',
    'Rerun suggestions',
    'Template for sending rerun and retry product suggestions.',
    'Rerun suggestions for {{partner_name}} ({{date_range}})',
    '<p>Hi {{PARTNER_CONTACT_NAME}},</p><p>We prepared rerun suggestions for {{date_range}}.</p><p><a href="{{products_csv_url}}">Download suggestions</a></p><p><a href="{{top_sellers_url}}">Recent best sellers</a></p>',
    array['partner_name', 'products_csv_url', 'top_sellers_url', 'date_range', 'PARTNER_CONTACT_NAME']
  ),
  (
    'weekly_partner_update',
    'Weekly partner update',
    'Weekly summary email with export links.',
    'Weekly update for {{partner_name}} ({{date_range}})',
    '<p>Hi {{PARTNER_CONTACT_NAME}},</p><p>Here is your weekly partner update for {{date_range}}.</p><p><a href="{{products_csv_url}}">Products update file</a></p><p><a href="{{top_sellers_url}}">Best sellers</a></p>',
    array['partner_name', 'products_csv_url', 'top_sellers_url', 'date_range', 'PARTNER_CONTACT_NAME']
  )
on conflict (template_id) do nothing;

insert into public.partner_email_template_versions (
  template_id,
  subject_template,
  body_template,
  macros
)
select
  template_id,
  subject_template,
  body_template,
  macros
from public.partner_email_templates
where template_id in ('new_products', 'rerun_suggestions', 'weekly_partner_update');
