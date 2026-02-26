do $$
begin
  if to_regclass('public.orders_global') is null then
    return;
  end if;

  alter table public.orders_global
    add column if not exists latest_notification_name text;

  alter table public.orders_global
    add column if not exists latest_notification_sent_at timestamptz;

  create index if not exists orders_global_latest_notification_sent_at_idx
    on public.orders_global (latest_notification_sent_at desc nulls last);
end $$;
