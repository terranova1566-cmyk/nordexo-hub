create or replace view public.digideal_seller_counts as
select
  seller_name,
  count(*)::int as product_count
from public.digideal_products
where seller_name is not null
  and btrim(seller_name) <> ''
group by seller_name;

grant select on public.digideal_seller_counts to anon, authenticated;
