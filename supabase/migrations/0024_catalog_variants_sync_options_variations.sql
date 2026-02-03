create or replace function public.sync_catalog_variants_options_variations()
returns trigger
language plpgsql
as $$
declare
  opt1 text := nullif(btrim(coalesce(new.option1, '')), '');
  opt2 text := nullif(btrim(coalesce(new.option2, '')), '');
  opt3 text := nullif(btrim(coalesce(new.option3, '')), '');
  opt4 text := nullif(btrim(coalesce(new.option4, '')), '');
  var_amount text := nullif(btrim(coalesce(new.variation_amount_se, '')), '');
  var_color text := nullif(btrim(coalesce(new.variation_color_se, '')), '');
  var_size text := nullif(btrim(coalesce(new.variation_size_se, '')), '');
  var_other text := nullif(btrim(coalesce(new.variation_other_se, '')), '');
begin
  if opt1 is null and var_amount is not null then
    new.option1 := var_amount;
  elsif opt1 is not null and var_amount is null then
    new.variation_amount_se := opt1;
  end if;

  if opt2 is null and var_color is not null then
    new.option2 := var_color;
  elsif opt2 is not null and var_color is null then
    new.variation_color_se := opt2;
  end if;

  if opt3 is null and var_size is not null then
    new.option3 := var_size;
  elsif opt3 is not null and var_size is null then
    new.variation_size_se := opt3;
  end if;

  if opt4 is null and var_other is not null then
    new.option4 := var_other;
  elsif opt4 is not null and var_other is null then
    new.variation_other_se := opt4;
  end if;

  return new;
end;
$$;

drop trigger if exists catalog_variants_sync_options_variations on public.catalog_variants;
create trigger catalog_variants_sync_options_variations
before insert or update on public.catalog_variants
for each row
execute function public.sync_catalog_variants_options_variations();
