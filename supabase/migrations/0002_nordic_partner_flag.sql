alter table public.catalog_products
  add column if not exists nordic_partner_enabled boolean not null default false;

update public.catalog_products
  set nordic_partner_enabled = true
  where image_folder like '/srv/resources/media/images/new-nd-catalog/%';
