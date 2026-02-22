-- Offerilla: add DigiDeal-compatible workflow fields and manager support objects.

alter table if exists public.offerilla_products
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

create or replace view public.offerilla_products_search as
select
  p.product_id,
  coalesce(
    nullif(btrim(p.title), ''),
    nullif(btrim(p.product_slug), ''),
    p.product_id
  ) as listing_title,
  coalesce(
    nullif(btrim(p.title), ''),
    nullif(btrim(p.product_slug), ''),
    p.product_id
  ) as title_h1,
  coalesce(
    nullif(btrim(p.product_url), ''),
    nullif(btrim(p.last_source_url), '')
  ) as product_url,
  p.product_slug,
  coalesce(nullif(btrim(p.page_product_id), ''), p.product_id) as prodno,
  coalesce(nullif(btrim(p.seller_name), ''), 'Offerilla') as seller_name,
  null::text as seller_orgnr,
  case
    when coalesce(nullif(btrim(p.last_stock_status), ''), '') = '' then 'online'
    when lower(p.last_stock_status) like '%sold out%'
      or lower(p.last_stock_status) like '%out of stock%'
      or lower(p.last_stock_status) like '%loppu%'
      or lower(p.last_stock_status) like '%ei saatavilla%'
    then 'offline'
    else 'online'
  end as status,
  coalesce(p.last_price_eur, latest_daily.price_eur) as last_price,
  coalesce(p.last_previous_price_eur, latest_daily.previous_price_eur) as last_original_price,
  coalesce(p.last_discount_percent, latest_daily.discount_percent) as last_discount_percent,
  case
    when coalesce(p.last_previous_price_eur, latest_daily.previous_price_eur) is not null
      and coalesce(p.last_price_eur, latest_daily.price_eur) is not null
      and coalesce(p.last_previous_price_eur, latest_daily.previous_price_eur) >
          coalesce(p.last_price_eur, latest_daily.price_eur)
    then coalesce(p.last_previous_price_eur, latest_daily.previous_price_eur) -
      coalesce(p.last_price_eur, latest_daily.price_eur)
    else null::numeric
  end as last_you_save_kr,
  coalesce(p.last_purchased_count, latest_daily.purchased_count) as last_purchased_count,
  null::integer as last_instock_qty,
  null::integer as last_available_qty,
  null::integer as last_reserved_qty,
  coalesce(nullif(btrim(p.main_image_url), ''), nullif(btrim(p.listing_image_url), '')) as primary_image_url,
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
    nullif(btrim(p.description_text), ''),
    nullif(btrim(p.description_html), '')
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
  coalesce(sales.sold_today, 0)::bigint as sold_today,
  coalesce(sales.sold_7d, 0)::bigint as sold_7d,
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
from public.offerilla_products p
left join lateral (
  select
    d.scrape_date,
    d.purchased_count,
    d.price_eur,
    d.previous_price_eur,
    d.discount_percent,
    d.stock_status,
    d.scraped_at
  from public.offerilla_product_daily d
  where d.product_id = p.product_id
    and d.period_type = 'day'
  order by d.scrape_date desc, d.scraped_at desc
  limit 1
) latest_daily on true
left join lateral (
  with daily as (
    select
      d.scrape_date,
      d.purchased_count,
      lag(d.purchased_count) over (order by d.scrape_date) as prev_purchased_count
    from public.offerilla_product_daily d
    where d.product_id = p.product_id
      and d.period_type = 'day'
  ),
  latest as (
    select max(scrape_date) as last_scrape_date
    from daily
  ),
  deltas as (
    select
      d.scrape_date,
      case
        when d.purchased_count is null or d.prev_purchased_count is null then 0
        else greatest(d.purchased_count - d.prev_purchased_count, 0)
      end as purchased_delta
    from daily d
  )
  select
    coalesce(
      sum(
        case
          when deltas.scrape_date = latest.last_scrape_date then deltas.purchased_delta
          else 0
        end
      ),
      0
    )::integer as sold_today,
    coalesce(
      sum(
        case
          when deltas.scrape_date >= (latest.last_scrape_date - interval '6 days')::date
          then deltas.purchased_delta
          else 0
        end
      ),
      0
    )::integer as sold_7d
  from latest
  left join deltas on latest.last_scrape_date is not null
) sales on true;

grant select on public.offerilla_products_search to anon, authenticated;

create or replace view public.offerilla_seller_counts as
select
  seller_name,
  count(*)::int as product_count
from public.offerilla_products_search
where seller_name is not null
  and btrim(seller_name) <> ''
group by seller_name;

grant select on public.offerilla_seller_counts to anon, authenticated;

create table if not exists public.offerilla_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.offerilla_view_items (
  id uuid primary key default gen_random_uuid(),
  view_id uuid not null references public.offerilla_views(id) on delete cascade,
  product_id text not null references public.offerilla_products(product_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (view_id, product_id)
);

create index if not exists offerilla_view_items_view_id_idx
  on public.offerilla_view_items(view_id);

create index if not exists offerilla_view_items_product_id_idx
  on public.offerilla_view_items(product_id);

alter table public.offerilla_views enable row level security;
alter table public.offerilla_view_items enable row level security;

drop policy if exists "offerilla_views_select" on public.offerilla_views;
create policy "offerilla_views_select"
  on public.offerilla_views
  for select
  using (auth.uid() = user_id);

drop policy if exists "offerilla_views_insert" on public.offerilla_views;
create policy "offerilla_views_insert"
  on public.offerilla_views
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "offerilla_views_update" on public.offerilla_views;
create policy "offerilla_views_update"
  on public.offerilla_views
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "offerilla_views_delete" on public.offerilla_views;
create policy "offerilla_views_delete"
  on public.offerilla_views
  for delete
  using (auth.uid() = user_id);

drop policy if exists "offerilla_view_items_select" on public.offerilla_view_items;
create policy "offerilla_view_items_select"
  on public.offerilla_view_items
  for select
  using (
    exists (
      select 1
      from public.offerilla_views
      where offerilla_views.id = view_id
        and offerilla_views.user_id = auth.uid()
    )
  );

drop policy if exists "offerilla_view_items_insert" on public.offerilla_view_items;
create policy "offerilla_view_items_insert"
  on public.offerilla_view_items
  for insert
  with check (
    exists (
      select 1
      from public.offerilla_views
      where offerilla_views.id = view_id
        and offerilla_views.user_id = auth.uid()
    )
  );

drop policy if exists "offerilla_view_items_delete" on public.offerilla_view_items;
create policy "offerilla_view_items_delete"
  on public.offerilla_view_items
  for delete
  using (
    exists (
      select 1
      from public.offerilla_views
      where offerilla_views.id = view_id
        and offerilla_views.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.offerilla_views to authenticated;
grant select, insert, update, delete on public.offerilla_view_items to authenticated;

notify pgrst, 'reload schema';
