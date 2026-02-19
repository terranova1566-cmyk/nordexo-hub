-- Persist AI shipping classification for DigiDeal pricing.

alter table public.digideal_products
  add column if not exists shipping_class text,
  add column if not exists shipping_class_confidence double precision,
  add column if not exists shipping_class_reason text,
  add column if not exists shipping_class_source text,
  add column if not exists shipping_class_model text,
  add column if not exists shipping_class_classified_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'digideal_products_shipping_class_check'
  ) then
    alter table public.digideal_products
      add constraint digideal_products_shipping_class_check
      check (shipping_class is null or shipping_class in ('NOR', 'BAT', 'PBA', 'LIQ'));
  end if;
end $$;

create index if not exists digideal_products_shipping_class_idx
  on public.digideal_products (shipping_class);

create index if not exists digideal_products_shipping_classified_at_idx
  on public.digideal_products (shipping_class_classified_at desc nulls last);
