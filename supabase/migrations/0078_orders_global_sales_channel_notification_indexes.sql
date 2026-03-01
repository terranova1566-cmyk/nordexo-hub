do $$
begin
  if to_regclass('public.orders_global') is null then
    return;
  end if;

  create index if not exists orders_global_status_notification_channel_txn_idx
    on public.orders_global (
      status,
      latest_notification_sent_at,
      sales_channel_id,
      transaction_date desc,
      id desc
    );

  create index if not exists orders_global_sales_channel_name_trgm_idx
    on public.orders_global using gin (sales_channel_name gin_trgm_ops);
end
$$;
