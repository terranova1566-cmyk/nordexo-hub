create table if not exists public.discovery_hidden_categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  level text not null check (level in ('l1', 'l2', 'l3')),
  value text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, level, value)
);

create index if not exists discovery_hidden_categories_user_idx
  on public.discovery_hidden_categories (user_id);

alter table public.discovery_hidden_categories enable row level security;

create policy "discovery_hidden_categories_select"
  on public.discovery_hidden_categories
  for select
  using (auth.uid() = user_id);

create policy "discovery_hidden_categories_insert"
  on public.discovery_hidden_categories
  for insert
  with check (auth.uid() = user_id);

create policy "discovery_hidden_categories_delete"
  on public.discovery_hidden_categories
  for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.discovery_hidden_categories to authenticated;

create table if not exists public.discovery_hidden_keywords (
  user_id uuid not null references auth.users(id) on delete cascade,
  keyword text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, keyword)
);

create index if not exists discovery_hidden_keywords_user_idx
  on public.discovery_hidden_keywords (user_id);

alter table public.discovery_hidden_keywords enable row level security;

create policy "discovery_hidden_keywords_select"
  on public.discovery_hidden_keywords
  for select
  using (auth.uid() = user_id);

create policy "discovery_hidden_keywords_insert"
  on public.discovery_hidden_keywords
  for insert
  with check (auth.uid() = user_id);

create policy "discovery_hidden_keywords_delete"
  on public.discovery_hidden_keywords
  for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.discovery_hidden_keywords to authenticated;
