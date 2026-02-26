do $$
begin
  if to_regclass('public.orders_global') is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders_global'
      and column_name = 'status'
  ) then
    return;
  end if;

  update public.orders_global
  set status = 'pending'
  where status = 'shipped'
    and coalesce(nullif(btrim(date_shipped), ''), null) is null;
end $$;
