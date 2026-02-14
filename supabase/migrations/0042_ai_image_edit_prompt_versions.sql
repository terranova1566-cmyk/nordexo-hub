-- Version history for AI image-edit prompts (admin-only).

create table if not exists public.ai_image_edit_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id text not null,
  template_text text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists ai_image_edit_prompt_versions_prompt_created_idx
  on public.ai_image_edit_prompt_versions (prompt_id, created_at desc);

alter table public.ai_image_edit_prompt_versions enable row level security;
alter table public.ai_image_edit_prompt_versions force row level security;

drop policy if exists ai_image_edit_prompt_versions_admin_select on public.ai_image_edit_prompt_versions;
drop policy if exists ai_image_edit_prompt_versions_admin_insert on public.ai_image_edit_prompt_versions;
drop policy if exists ai_image_edit_prompt_versions_admin_delete on public.ai_image_edit_prompt_versions;

create policy "ai_image_edit_prompt_versions_admin_select"
  on public.ai_image_edit_prompt_versions
  for select
  using (public.is_admin());

create policy "ai_image_edit_prompt_versions_admin_insert"
  on public.ai_image_edit_prompt_versions
  for insert
  with check (public.is_admin());

create policy "ai_image_edit_prompt_versions_admin_delete"
  on public.ai_image_edit_prompt_versions
  for delete
  using (public.is_admin());

grant select, insert, delete on public.ai_image_edit_prompt_versions to authenticated;

