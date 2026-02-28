do $$
begin
  if to_regclass('public.orders_global') is null then
    return;
  end if;

  alter table public.orders_global
    add column if not exists date_shipped text;
end $$;
