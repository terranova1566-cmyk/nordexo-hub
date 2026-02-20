alter table public.partner_email_templates
  add column if not exists category text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists owner_team text;

create index if not exists partner_email_templates_category_idx
  on public.partner_email_templates (category);

create index if not exists partner_email_templates_owner_team_idx
  on public.partner_email_templates (owner_team);

create index if not exists partner_email_templates_owner_user_idx
  on public.partner_email_templates (owner_user_id);
