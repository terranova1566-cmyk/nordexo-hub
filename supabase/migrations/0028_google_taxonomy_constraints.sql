-- Keep google taxonomy fields consistent and ensure IDs are real.
-- This migration is designed to be re-runnable and safe with existing data.

-- 1) Foreign keys: ensure assigned IDs exist in google_product_taxonomy.
-- Use NOT VALID so it doesn't fail on existing rows; validate later when backfill is done.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalog_products_google_taxonomy_id_fkey'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_google_taxonomy_id_fkey
        foreign key (google_taxonomy_id)
        references public.google_product_taxonomy (category_id)
        not valid;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalog_products_google_taxonomy_id_secondary_fkey'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_google_taxonomy_id_secondary_fkey
        foreign key (google_taxonomy_id_secondary)
        references public.google_product_taxonomy (category_id)
        not valid;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'digideal_products_google_taxonomy_id_fkey'
  ) then
    alter table public.digideal_products
      add constraint digideal_products_google_taxonomy_id_fkey
        foreign key (google_taxonomy_id)
        references public.google_product_taxonomy (category_id)
        not valid;
  end if;
end$$;

-- 2) Trigger to denormalize readable path + l1/l2/l3 from the taxonomy ID.
-- This makes google_taxonomy_id the canonical value; path and l-levels are derived.
create or replace function public.catalog_products_set_google_taxonomy_fields()
returns trigger
language plpgsql
as $$
declare
  p1 text;
  p2 text;
begin
  if new.google_taxonomy_id is not null then
    select path into p1
    from public.google_product_taxonomy
    where category_id = new.google_taxonomy_id;

    if p1 is not null then
      new.google_taxonomy_path = p1;
      new.google_taxonomy_l1 = nullif(split_part(p1, ' > ', 1), '');
      new.google_taxonomy_l2 = nullif(split_part(p1, ' > ', 2), '');
      new.google_taxonomy_l3 = nullif(split_part(p1, ' > ', 3), '');
    end if;
  end if;

  if new.google_taxonomy_id_secondary is not null then
    select path into p2
    from public.google_product_taxonomy
    where category_id = new.google_taxonomy_id_secondary;

    if p2 is not null then
      new.google_taxonomy_path_secondary = p2;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_catalog_products_set_google_taxonomy_fields on public.catalog_products;
create trigger trg_catalog_products_set_google_taxonomy_fields
before insert or update of google_taxonomy_id, google_taxonomy_id_secondary
on public.catalog_products
for each row
execute procedure public.catalog_products_set_google_taxonomy_fields();

create or replace function public.digideal_products_set_google_taxonomy_fields()
returns trigger
language plpgsql
as $$
declare
  p text;
begin
  if new.google_taxonomy_id is not null then
    select path into p
    from public.google_product_taxonomy
    where category_id = new.google_taxonomy_id;
    if p is not null then
      new.google_taxonomy_path = p;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_digideal_products_set_google_taxonomy_fields on public.digideal_products;
create trigger trg_digideal_products_set_google_taxonomy_fields
before insert or update of google_taxonomy_id
on public.digideal_products
for each row
execute procedure public.digideal_products_set_google_taxonomy_fields();
