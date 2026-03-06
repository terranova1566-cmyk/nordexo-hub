-- Product-level sales rollups (legacy sales), keyed by catalog product id.
-- This is used by the Products page for sales sorting and compact D/W/Y badges.
create or replace function public.legacy_sales_product_rollups(product_ids uuid[])
returns table (
  product_id uuid,
  sales_1d numeric,
  sales_1w numeric,
  sales_1m numeric,
  sales_3m numeric,
  sales_1y numeric,
  sales_all_time numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with selected_products as (
    select distinct pid as product_id
    from unnest(coalesce(product_ids, array[]::uuid[])) as pid
  ),
  variant_map as (
    select distinct sp.product_id, v.sku, v.sku_norm
    from selected_products sp
    join public.catalog_variants v
      on v.product_id = sp.product_id
  ),
  sales_by_product as (
    select
      vm.product_id,
      sum(
        case
          when l.sold_date >= current_date - interval '1 day' then l.amount_sold
          else 0::numeric
        end
      ) as sales_1d,
      sum(
        case
          when l.sold_date >= current_date - interval '7 day' then l.amount_sold
          else 0::numeric
        end
      ) as sales_1w,
      sum(
        case
          when l.sold_date >= current_date - interval '1 month' then l.amount_sold
          else 0::numeric
        end
      ) as sales_1m,
      sum(
        case
          when l.sold_date >= current_date - interval '3 month' then l.amount_sold
          else 0::numeric
        end
      ) as sales_3m,
      sum(
        case
          when l.sold_date >= current_date - interval '1 year' then l.amount_sold
          else 0::numeric
        end
      ) as sales_1y,
      sum(l.amount_sold) as sales_all_time
    from variant_map vm
    join public.legacy_sales_data l
      on l.sku = vm.sku
      or (
        vm.sku_norm is not null
        and l.sku_norm is not null
        and l.sku_norm = vm.sku_norm
      )
    group by vm.product_id
  )
  select
    sp.product_id,
    coalesce(sb.sales_1d, 0::numeric) as sales_1d,
    coalesce(sb.sales_1w, 0::numeric) as sales_1w,
    coalesce(sb.sales_1m, 0::numeric) as sales_1m,
    coalesce(sb.sales_3m, 0::numeric) as sales_3m,
    coalesce(sb.sales_1y, 0::numeric) as sales_1y,
    coalesce(sb.sales_all_time, 0::numeric) as sales_all_time
  from selected_products sp
  left join sales_by_product sb
    on sb.product_id = sp.product_id;
$$;

revoke all on function public.legacy_sales_product_rollups(uuid[]) from public;
grant execute on function public.legacy_sales_product_rollups(uuid[]) to authenticated;

comment on function public.legacy_sales_product_rollups(uuid[]) is
  'Returns legacy sales quantity rollups for the provided catalog product ids.';
