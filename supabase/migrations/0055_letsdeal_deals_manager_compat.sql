-- LetsDeal: add DigiDeal-compatible workflow fields and manager support objects.

alter table public.letsdeal_products
  add column if not exists digideal_rerun_added timestamptz,
  add column if not exists digideal_rerun_partner_comment text,
  add column if not exists digideal_rerun_status text,
  add column if not exists digideal_add_rerun boolean,
  add column if not exists digideal_add_rerun_at timestamptz,
  add column if not exists digideal_add_rerun_comment text,
  add column if not exists digideal_product_keywords text,
  add column if not exists purchase_price numeric,
  add column if not exists "1688_URL" text,
  add column if not exists "1688_url" text,
  add column if not exists weight_grams integer,
  add column if not exists weight_kg numeric,
  add column if not exists identical_spu text,
  add column if not exists digideal_group_id text,
  add column if not exists google_taxonomy_id bigint,
  add column if not exists google_taxonomy_path text,
  add column if not exists google_taxonomy_confidence double precision,
  add column if not exists google_taxonomy_status text,
  add column if not exists google_taxonomy_model_pass1 text,
  add column if not exists google_taxonomy_model_pass2 text,
  add column if not exists google_taxonomy_categorized_at timestamptz,
  add column if not exists shipping_class text,
  add column if not exists shipping_class_confidence double precision,
  add column if not exists shipping_class_reason text,
  add column if not exists shipping_class_source text,
  add column if not exists shipping_class_model text,
  add column if not exists shipping_class_classified_at timestamptz;

create or replace view public.letsdeal_products_search as
select
  p.product_id,
  p.product_slug,
  p.deal_url,
  p.title,
  p.subtitle,
  p.seller_name,
  p.listing_image_url,
  p.product_image_url,
  p.rating_value,
  p.rating_count,
  p.quick_delivery,
  p.new_today,
  p.last_price_kr,
  p.last_previous_price_kr,
  p.last_discount_percent,
  p.last_bought_count,
  p.last_bought_display,
  p.last_page,
  p.last_position,
  p.status,
  p.first_seen_at,
  p.last_seen_at,
  p.consecutive_miss_count,
  p.last_missed_at,
  coalesce(p.last_bought_count, 0) as sold_all_time,
  coalesce(p.last_bought_display, '0') as sold_all_time_display,
  coalesce(p.last_bought_display, '') like '%+%' as sold_all_time_is_lower_bound,
  last.scrape_date as last_scrape_date,
  coalesce(last.bought_delta_estimated, 0) as sold_today,
  coalesce(s7.sold_7d_estimated, 0::bigint) as sold_7d,
  last.bought_delta as sold_today_raw,
  s7.sold_7d_raw,
  last.bought_delta_exact is not null as sold_today_is_exact,
  s7.sold_7d_exact is not null as sold_7d_is_exact,
  last.bought_delta_exact as sold_today_exact,
  s7.sold_7d_exact,
  last.source as sold_today_source,
  last.is_synthetic as sold_today_is_synthetic,
  s7.has_synthetic_in_7d,
  s7.has_scrape_in_7d,

  -- DigiDeal-manager compatibility fields.
  p.title as listing_title,
  p.title as title_h1,
  p.deal_url as product_url,
  null::text as prodno,
  null::text as seller_orgnr,
  p.last_price_kr as last_price,
  p.last_previous_price_kr as last_original_price,
  case
    when p.last_previous_price_kr is not null
      and p.last_price_kr is not null
      and p.last_previous_price_kr > p.last_price_kr
    then p.last_previous_price_kr - p.last_price_kr
    else null::numeric
  end as last_you_save_kr,
  p.last_bought_count as last_purchased_count,
  null::integer as last_instock_qty,
  null::integer as last_available_qty,
  null::integer as last_reserved_qty,
  coalesce(p.listing_image_url, p.product_image_url) as primary_image_url,
  case
    when p.listing_image_url is null and p.product_image_url is null then null::jsonb
    else to_jsonb(array_remove(array[p.listing_image_url, p.product_image_url], null))
  end as image_urls,
  null::text as description_html,
  null::text as bullet_points_text,
  p.google_taxonomy_id,
  p.google_taxonomy_path,
  p.digideal_rerun_added,
  p.digideal_rerun_partner_comment,
  p.digideal_rerun_status,
  p.digideal_add_rerun,
  p.digideal_add_rerun_at,
  p.digideal_add_rerun_comment,
  null::numeric as shipping_cost_kr,
  p.identical_spu,
  p.digideal_group_id,
  null::bigint as digideal_group_count
from public.letsdeal_products p
left join lateral (
  select
    d.scrape_date,
    d.bought_delta,
    d.bought_delta_estimated,
    d.bought_delta_exact,
    d.source,
    d.is_synthetic
  from public.letsdeal_product_daily_with_delta d
  where d.product_id = p.product_id
  order by d.scrape_date desc
  limit 1
) last on true
left join lateral (
  select
    sum(d.bought_delta_estimated) as sold_7d_estimated,
    sum(d.bought_delta_exact) as sold_7d_exact,
    sum(d.bought_delta) as sold_7d_raw,
    bool_or(d.source = 'synthetic') as has_synthetic_in_7d,
    bool_or(d.source = 'scrape') as has_scrape_in_7d
  from public.letsdeal_product_daily_with_delta d
  where d.product_id = p.product_id
    and last.scrape_date is not null
    and d.scrape_date >= (last.scrape_date - interval '6 days')::date
) s7 on true;

grant select on public.letsdeal_products_search to anon, authenticated;

create or replace view public.letsdeal_seller_counts as
select
  seller_name,
  count(*)::int as product_count
from public.letsdeal_products
where seller_name is not null
  and btrim(seller_name) <> ''
group by seller_name;

grant select on public.letsdeal_seller_counts to anon, authenticated;

create table if not exists public.letsdeal_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.letsdeal_view_items (
  id uuid primary key default gen_random_uuid(),
  view_id uuid not null references public.letsdeal_views(id) on delete cascade,
  product_id text not null references public.letsdeal_products(product_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (view_id, product_id)
);

create index if not exists letsdeal_view_items_view_id_idx
  on public.letsdeal_view_items(view_id);

create index if not exists letsdeal_view_items_product_id_idx
  on public.letsdeal_view_items(product_id);

alter table public.letsdeal_views enable row level security;
alter table public.letsdeal_view_items enable row level security;

drop policy if exists "letsdeal_views_select" on public.letsdeal_views;
create policy "letsdeal_views_select"
  on public.letsdeal_views
  for select
  using (auth.uid() = user_id);

drop policy if exists "letsdeal_views_insert" on public.letsdeal_views;
create policy "letsdeal_views_insert"
  on public.letsdeal_views
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "letsdeal_views_update" on public.letsdeal_views;
create policy "letsdeal_views_update"
  on public.letsdeal_views
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "letsdeal_views_delete" on public.letsdeal_views;
create policy "letsdeal_views_delete"
  on public.letsdeal_views
  for delete
  using (auth.uid() = user_id);

drop policy if exists "letsdeal_view_items_select" on public.letsdeal_view_items;
create policy "letsdeal_view_items_select"
  on public.letsdeal_view_items
  for select
  using (
    exists (
      select 1
      from public.letsdeal_views
      where letsdeal_views.id = view_id
        and letsdeal_views.user_id = auth.uid()
    )
  );

drop policy if exists "letsdeal_view_items_insert" on public.letsdeal_view_items;
create policy "letsdeal_view_items_insert"
  on public.letsdeal_view_items
  for insert
  with check (
    exists (
      select 1
      from public.letsdeal_views
      where letsdeal_views.id = view_id
        and letsdeal_views.user_id = auth.uid()
    )
  );

drop policy if exists "letsdeal_view_items_delete" on public.letsdeal_view_items;
create policy "letsdeal_view_items_delete"
  on public.letsdeal_view_items
  for delete
  using (
    exists (
      select 1
      from public.letsdeal_views
      where letsdeal_views.id = view_id
        and letsdeal_views.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.letsdeal_views to authenticated;
grant select, insert, update, delete on public.letsdeal_view_items to authenticated;

notify pgrst, 'reload schema';
