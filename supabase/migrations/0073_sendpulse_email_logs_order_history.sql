do $$
begin
  if to_regclass('public.sendpulse_email_logs') is null then
    return;
  end if;

  alter table public.sendpulse_email_logs
    add column if not exists order_id bigint references public.orders_global(id) on delete set null;

  alter table public.sendpulse_email_logs
    add column if not exists recipient_email text;

  alter table public.sendpulse_email_logs
    add column if not exists provider_message_id text;

  alter table public.sendpulse_email_logs
    add column if not exists send_date timestamptz;

  alter table public.sendpulse_email_logs
    add column if not exists notification_name text;

  create index if not exists sendpulse_email_logs_order_id_created_at_idx
    on public.sendpulse_email_logs (order_id, created_at desc);

  create index if not exists sendpulse_email_logs_send_date_idx
    on public.sendpulse_email_logs (send_date desc nulls last);

  create index if not exists sendpulse_email_logs_provider_message_id_idx
    on public.sendpulse_email_logs (provider_message_id);
end $$;
