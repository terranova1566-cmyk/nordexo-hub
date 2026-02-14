-- Custom AI image-edit prompt templates (admin-only).

create table if not exists public.ai_image_edit_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_id text not null unique,
  name text not null,
  usage text,
  description text,
  template_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.ai_image_edit_prompts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ai_image_edit_prompts_touch_updated_at on public.ai_image_edit_prompts;
create trigger ai_image_edit_prompts_touch_updated_at
before update on public.ai_image_edit_prompts
for each row
execute function public.ai_image_edit_prompts_touch_updated_at();

alter table public.ai_image_edit_prompts enable row level security;
alter table public.ai_image_edit_prompts force row level security;

drop policy if exists ai_image_edit_prompts_admin_select on public.ai_image_edit_prompts;
drop policy if exists ai_image_edit_prompts_admin_insert on public.ai_image_edit_prompts;
drop policy if exists ai_image_edit_prompts_admin_update on public.ai_image_edit_prompts;
drop policy if exists ai_image_edit_prompts_admin_delete on public.ai_image_edit_prompts;

create policy "ai_image_edit_prompts_admin_select"
  on public.ai_image_edit_prompts
  for select
  using (public.is_admin());

create policy "ai_image_edit_prompts_admin_insert"
  on public.ai_image_edit_prompts
  for insert
  with check (public.is_admin());

create policy "ai_image_edit_prompts_admin_update"
  on public.ai_image_edit_prompts
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "ai_image_edit_prompts_admin_delete"
  on public.ai_image_edit_prompts
  for delete
  using (public.is_admin());

grant select, insert, update, delete on public.ai_image_edit_prompts to authenticated;

