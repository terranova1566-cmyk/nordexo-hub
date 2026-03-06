-- Keep legacy_sales_data continuously in sync with order_items_global.
-- This merges legacy file imports with new/ongoing order-based sales.
-- Scope starts on 2026-03-01 (requested backfill window + forward-going sync).

create or replace function public.legacy_sales_parse_date(p_value text)
returns date
language plpgsql
immutable
as $$
declare
  v_raw text := btrim(coalesce(p_value, ''));
  v_date_text text;
begin
  if v_raw = '' then
    return null;
  end if;

  if v_raw ~ '^\d{4}-\d{2}-\d{2}([T\s].*)?$' then
    v_date_text := substring(v_raw from 1 for 10);
  elsif v_raw ~ '^\d{4}/\d{2}/\d{2}([T\s].*)?$' then
    v_date_text := replace(substring(v_raw from 1 for 10), '/', '-');
  else
    return null;
  end if;

  begin
    return v_date_text::date;
  exception
    when others then
      return null;
  end;
end;
$$;

create or replace function public.legacy_sales_parse_numeric(p_value text)
returns numeric
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(coalesce(p_value, ''), '\s+', '', 'g') as raw
  )
  select
    case
      when raw = '' then null
      when raw ~ '^[-+]?\d+(?:[.,]\d+)?$'
        then replace(raw, ',', '.')::numeric
      when raw ~ '^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$'
        then replace(raw, ',', '')::numeric
      when raw ~ '^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$'
        then replace(replace(raw, '.', ''), ',', '.')::numeric
      else null
    end
  from cleaned
$$;

create or replace function public.legacy_sales_sync_order_item(
  p_order_item_id text,
  p_start_date date default date '2026-03-01'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_label constant text := 'orders_continuous_sync';
  v_min_date date := coalesce(p_start_date, date '2026-03-01');
  v_source_file text;
  v_order_item_id text;
  v_order_id text;
  v_order_number text;
  v_sales_channel_id text;
  v_sales_channel_name text;
  v_seller_platform text;
  v_sku text;
  v_sku_norm text;
  v_sold_date date;
  v_quantity_raw text;
  v_price_raw text;
  v_amount_sold numeric;
  v_price_numeric numeric;
  v_total_price numeric;
  v_currency text;
begin
  if p_order_item_id is null or btrim(p_order_item_id) = '' then
    return false;
  end if;

  v_source_file := 'order_item:' || btrim(p_order_item_id);

  select
    oi.id::text,
    oi.order_id::text,
    nullif(btrim(o.order_number::text), ''),
    nullif(btrim(oi.sku::text), ''),
    nullif(upper(regexp_replace(coalesce(nullif(btrim(oi.sku::text), ''), ''), '\s+', '', 'g')), ''),
    coalesce(
      public.legacy_sales_parse_date(oi.transaction_date::text),
      public.legacy_sales_parse_date(o.transaction_date::text)
    ) as sold_date,
    oi.quantity::text,
    oi.sales_value_eur::text,
    coalesce(
      nullif(btrim(oi.sales_channel_id::text), ''),
      nullif(btrim(o.sales_channel_id::text), '')
    ) as sales_channel_id,
    nullif(btrim(o.sales_channel_name::text), '') as sales_channel_name,
    coalesce(
      nullif(btrim((oi.raw_row::jsonb ->> 'Currency')), ''),
      nullif(btrim((oi.raw_row::jsonb ->> 'Valuta')), ''),
      'EUR'
    ) as currency
  into
    v_order_item_id,
    v_order_id,
    v_order_number,
    v_sku,
    v_sku_norm,
    v_sold_date,
    v_quantity_raw,
    v_price_raw,
    v_sales_channel_id,
    v_sales_channel_name,
    v_currency
  from public.order_items_global oi
  left join public.orders_global o
    on o.id = oi.order_id
  where oi.id::text = btrim(p_order_item_id)
  limit 1;

  if not found then
    delete from public.legacy_sales_data l
    where l.batch_label = v_batch_label
      and l.source_file = v_source_file
      and l.source_row_number = 1;
    return false;
  end if;

  if v_sku is null or v_sold_date is null or v_sold_date < v_min_date then
    delete from public.legacy_sales_data l
    where l.batch_label = v_batch_label
      and l.source_file = v_source_file
      and l.source_row_number = 1;
    return false;
  end if;

  v_amount_sold := greatest(
    coalesce(public.legacy_sales_parse_numeric(v_quantity_raw), 1::numeric),
    0::numeric
  );
  v_price_numeric := public.legacy_sales_parse_numeric(v_price_raw);
  v_total_price := case
    when v_price_numeric is null then null
    else greatest(v_price_numeric, 0::numeric)
  end;
  v_seller_platform := coalesce(v_sales_channel_id, v_sales_channel_name);
  v_currency := coalesce(nullif(btrim(v_currency), ''), 'EUR');

  insert into public.legacy_sales_data (
    batch_label,
    source_file,
    source_row_number,
    seller_platform,
    sku,
    sku_norm,
    sold_date,
    amount_sold,
    total_price,
    currency,
    meta
  )
  values (
    v_batch_label,
    v_source_file,
    1,
    v_seller_platform,
    v_sku,
    v_sku_norm,
    v_sold_date,
    v_amount_sold,
    v_total_price,
    v_currency,
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'orders_global',
        'order_item_id', v_order_item_id,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'sales_channel_id', v_sales_channel_id,
        'sales_channel_name', v_sales_channel_name
      )
    )
  )
  on conflict (batch_label, source_file, source_row_number)
  do update set
    seller_platform = excluded.seller_platform,
    sku = excluded.sku,
    sku_norm = excluded.sku_norm,
    sold_date = excluded.sold_date,
    amount_sold = excluded.amount_sold,
    total_price = excluded.total_price,
    currency = excluded.currency,
    meta = excluded.meta,
    imported_at = now();

  return true;
end;
$$;

create or replace function public.legacy_sales_sync_orders_backfill(
  p_start_date date default date '2026-03-01',
  p_end_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
  v_min_date date := coalesce(p_start_date, date '2026-03-01');
  v_max_date date := coalesce(p_end_date, current_date);
  v_order_item_id text;
begin
  if v_max_date < v_min_date then
    return 0;
  end if;

  for v_order_item_id in
    select oi.id::text
    from public.order_items_global oi
    left join public.orders_global o
      on o.id = oi.order_id
    where coalesce(
      public.legacy_sales_parse_date(oi.transaction_date::text),
      public.legacy_sales_parse_date(o.transaction_date::text)
    ) between v_min_date and v_max_date
  loop
    perform public.legacy_sales_sync_order_item(v_order_item_id, v_min_date);
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

create or replace function public.legacy_sales_sync_order_items_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.id is not null then
      delete from public.legacy_sales_data l
      where l.batch_label = 'orders_continuous_sync'
        and l.source_file = 'order_item:' || old.id::text
        and l.source_row_number = 1;
    end if;
    return old;
  end if;

  if new.id is not null then
    perform public.legacy_sales_sync_order_item(new.id::text, date '2026-03-01');
  end if;
  return new;
end;
$$;

create or replace function public.legacy_sales_sync_orders_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_item_id text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if
    coalesce(new.transaction_date::text, '') is distinct from coalesce(old.transaction_date::text, '')
    or coalesce(new.sales_channel_id::text, '') is distinct from coalesce(old.sales_channel_id::text, '')
    or coalesce(new.sales_channel_name::text, '') is distinct from coalesce(old.sales_channel_name::text, '')
  then
    for v_order_item_id in
      select oi.id::text
      from public.order_items_global oi
      where oi.order_id = new.id
    loop
      perform public.legacy_sales_sync_order_item(v_order_item_id, date '2026-03-01');
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.legacy_sales_sync_order_item(text, date) from public;
revoke all on function public.legacy_sales_sync_orders_backfill(date, date) from public;
grant execute on function public.legacy_sales_sync_orders_backfill(date, date) to authenticated;

do $$
begin
  if to_regclass('public.order_items_global') is not null then
    execute 'drop trigger if exists legacy_sales_sync_order_items_after_write on public.order_items_global';
    execute $sql$
      create trigger legacy_sales_sync_order_items_after_write
      after insert or update of order_id, sku, quantity, sales_value_eur, transaction_date, sales_channel_id, raw_row
      or delete
      on public.order_items_global
      for each row
      execute function public.legacy_sales_sync_order_items_trigger()
    $sql$;
  end if;

  if to_regclass('public.orders_global') is not null then
    execute 'drop trigger if exists legacy_sales_sync_orders_after_update on public.orders_global';
    execute $sql$
      create trigger legacy_sales_sync_orders_after_update
      after update of transaction_date, sales_channel_id, sales_channel_name
      on public.orders_global
      for each row
      execute function public.legacy_sales_sync_orders_trigger()
    $sql$;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.orders_global') is null
     or to_regclass('public.order_items_global') is null then
    return;
  end if;

  perform public.legacy_sales_sync_orders_backfill(date '2026-03-01', current_date);
end;
$$;
