create or replace view public.digideal_products_search as
select
  dp.*,
  case
    when jsonb_typeof(dp.bullet_points) = 'array'
      then (
        select string_agg(value, ' ')
        from jsonb_array_elements_text(dp.bullet_points) as value
      )
    else ''
  end as bullet_points_text
from public.digideal_products dp;

grant select on public.digideal_products_search to anon, authenticated;
