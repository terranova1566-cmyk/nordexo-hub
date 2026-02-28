do $$
begin
  if to_regclass('public.orders_global') is null then
    return;
  end if;

  if to_regclass('public.order_tracking_numbers_global') is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_tracking_numbers_global'
      and column_name = 'sent_date'
  ) then
    return;
  end if;

  update public.orders_global o
  set date_shipped = src.first_sent_date
  from (
    select
      t.order_id,
      min(t.sent_date)::date as first_sent_date
    from public.order_tracking_numbers_global t
    where t.order_id is not null
      and t.sent_date is not null
    group by t.order_id
  ) src
  where o.id = src.order_id
    and o.date_shipped is null;
end $$;
