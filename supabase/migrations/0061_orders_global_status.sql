do $$
begin
  if to_regclass('public.orders_global') is null then
    return;
  end if;

  alter table public.orders_global
    add column if not exists status text;

  -- Normalize any existing/legacy values and backfill empty rows to shipped.
  update public.orders_global
  set status = case
    when lower(regexp_replace(replace(coalesce(status, ''), '&', 'and'), '[^a-z]+', '', 'g')) = 'pending'
      then 'pending'
    when lower(regexp_replace(replace(coalesce(status, ''), '&', 'and'), '[^a-z]+', '', 'g')) = 'purchased'
      then 'purchased'
    when lower(regexp_replace(replace(coalesce(status, ''), '&', 'and'), '[^a-z]+', '', 'g')) in ('beingpackedandshipped', 'packingandshipping')
      then 'being_packed_and_shipped'
    when lower(regexp_replace(replace(coalesce(status, ''), '&', 'and'), '[^a-z]+', '', 'g')) = 'shipped'
      then 'shipped'
    else 'shipped'
  end;

  alter table public.orders_global
    alter column status set default 'shipped';

  update public.orders_global
  set status = 'shipped'
  where status is null or btrim(status) = '';

  alter table public.orders_global
    alter column status set not null;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders_global'::regclass
      and conname = 'orders_global_status_check'
  ) then
    alter table public.orders_global
      add constraint orders_global_status_check
      check (status in ('pending', 'purchased', 'being_packed_and_shipped', 'shipped'));
  end if;

  create index if not exists orders_global_status_idx
    on public.orders_global (status);
end $$;
