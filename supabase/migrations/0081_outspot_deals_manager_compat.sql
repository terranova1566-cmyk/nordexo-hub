-- Outspot: add DigiDeal-compatible workflow fields and manager support objects.

alter table if exists public.outspot_products
  add column if not exists seller_name text,
  add column if not exists digideal_rerun_added timestamptz,
  add column if not exists digideal_rerun_partner_comment text,
  add column if not exists digideal_rerun_status text,
  add column if not exists digideal_add_rerun boolean,
  add column if not exists digideal_add_rerun_at timestamptz,
  add column if not exists digideal_add_rerun_comment text,
  add column if not exists purchase_price numeric,
  add column if not exists "1688_URL" text,
  add column if not exists "1688_url" text,
  add column if not exists weight_grams integer,
  add column if not exists weight_kg numeric,
  add column if not exists identical_spu text,
  add column if not exists digideal_group_id text,
  add column if not exists shipping_class text,
  add column if not exists shipping_class_confidence double precision,
  add column if not exists shipping_class_reason text,
  add column if not exists shipping_class_source text,
  add column if not exists shipping_class_model text,
  add column if not exists shipping_class_classified_at timestamptz;

create or replace view public.outspot_products_search_manager as
select
  p.product_id,
  coalesce(
    nullif(btrim(p.short_name), ''),
    nullif(btrim(p.title), ''),
    nullif(btrim(p.product_slug), ''),
    p.product_id
  ) as listing_title,
  coalesce(
    nullif(btrim(p.title), ''),
    nullif(btrim(p.short_name), ''),
    nullif(btrim(p.product_slug), ''),
    p.product_id
  ) as title_h1,
  p.deal_url as product_url,
  p.product_slug,
  p.product_id as prodno,
  coalesce(nullif(btrim(p.seller_name), ''), 'Outspot') as seller_name,
  null::text as seller_orgnr,
  coalesce(nullif(btrim(p.status), ''), 'online') as status,
  coalesce(p.last_price_sek, latest_daily.price_sek) as last_price,
  coalesce(p.last_previous_price_sek, latest_daily.previous_price_sek) as last_original_price,
  coalesce(p.last_discount_percent, latest_daily.discount_percent) as last_discount_percent,
  case
    when coalesce(p.last_previous_price_sek, latest_daily.previous_price_sek) is not null
      and coalesce(p.last_price_sek, latest_daily.price_sek) is not null
      and coalesce(p.last_previous_price_sek, latest_daily.previous_price_sek) >
          coalesce(p.last_price_sek, latest_daily.price_sek)
    then coalesce(p.last_previous_price_sek, latest_daily.previous_price_sek) -
      coalesce(p.last_price_sek, latest_daily.price_sek)
    else null::numeric
  end as last_you_save_kr,
  coalesce(p.last_sold_count, latest_daily.sold_count) as last_purchased_count,
  null::integer as last_instock_qty,
  null::integer as last_available_qty,
  null::integer as last_reserved_qty,
  nullif(btrim(p.main_image_url), '') as primary_image_url,
  case
    when p.gallery_image_urls is not null then p.gallery_image_urls
    when p.main_image_url is not null and btrim(p.main_image_url) <> ''
      then to_jsonb(array[p.main_image_url])
    else null::jsonb
  end as image_urls,
  p.first_seen_at,
  p.last_seen_at,
  p.description_html,
  coalesce(
    nullif(
      array_to_string(
        array(
          select jsonb_array_elements_text(coalesce(p.highlights_bullets, '[]'::jsonb))
        ),
        E'\n'
      ),
      ''
    ),
    nullif(btrim(p.specifications_text), ''),
    nullif(btrim(p.description_text), '')
  ) as bullet_points_text,
  null::bigint as google_taxonomy_id,
  coalesce(
    nullif(btrim(p.taxonomy_path), ''),
    concat_ws(
      ' > ',
      nullif(btrim(p.taxonomy_l1), ''),
      nullif(btrim(p.taxonomy_l2), ''),
      nullif(btrim(p.taxonomy_l3), '')
    )
  ) as google_taxonomy_path,
  coalesce(s.sold_today, 0)::bigint as sold_today,
  coalesce(s.sold_7d, 0)::bigint as sold_7d,
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
from public.outspot_products p
left join lateral (
  select
    d.sold_count,
    d.price_sek,
    d.previous_price_sek,
    d.discount_percent
  from public.outspot_product_daily d
  where d.product_id = p.product_id
    and d.period_type = 'day'
  order by d.scrape_date desc, d.scraped_at desc
  limit 1
) latest_daily on true
left join public.outspot_products_search s
  on s.product_id = p.product_id;

grant select on public.outspot_products_search_manager to anon, authenticated;

create or replace view public.outspot_seller_counts as
select
  seller_name,
  count(*)::int as product_count
from public.outspot_products_search_manager
where seller_name is not null
  and btrim(seller_name) <> ''
group by seller_name;

grant select on public.outspot_seller_counts to anon, authenticated;

create table if not exists public.outspot_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.outspot_view_items (
  id uuid primary key default gen_random_uuid(),
  view_id uuid not null references public.outspot_views(id) on delete cascade,
  product_id text not null references public.outspot_products(product_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (view_id, product_id)
);

create index if not exists outspot_view_items_view_id_idx
  on public.outspot_view_items(view_id);

create index if not exists outspot_view_items_product_id_idx
  on public.outspot_view_items(product_id);

alter table public.outspot_views enable row level security;
alter table public.outspot_view_items enable row level security;

drop policy if exists "outspot_views_select" on public.outspot_views;
create policy "outspot_views_select"
  on public.outspot_views
  for select
  using (auth.uid() = user_id);

drop policy if exists "outspot_views_insert" on public.outspot_views;
create policy "outspot_views_insert"
  on public.outspot_views
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "outspot_views_update" on public.outspot_views;
create policy "outspot_views_update"
  on public.outspot_views
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "outspot_views_delete" on public.outspot_views;
create policy "outspot_views_delete"
  on public.outspot_views
  for delete
  using (auth.uid() = user_id);

drop policy if exists "outspot_view_items_select" on public.outspot_view_items;
create policy "outspot_view_items_select"
  on public.outspot_view_items
  for select
  using (
    exists (
      select 1
      from public.outspot_views
      where outspot_views.id = view_id
        and outspot_views.user_id = auth.uid()
    )
  );

drop policy if exists "outspot_view_items_insert" on public.outspot_view_items;
create policy "outspot_view_items_insert"
  on public.outspot_view_items
  for insert
  with check (
    exists (
      select 1
      from public.outspot_views
      where outspot_views.id = view_id
        and outspot_views.user_id = auth.uid()
    )
  );

drop policy if exists "outspot_view_items_delete" on public.outspot_view_items;
create policy "outspot_view_items_delete"
  on public.outspot_view_items
  for delete
  using (
    exists (
      select 1
      from public.outspot_views
      where outspot_views.id = view_id
        and outspot_views.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.outspot_views to authenticated;
grant select, insert, update, delete on public.outspot_view_items to authenticated;

notify pgrst, 'reload schema';
