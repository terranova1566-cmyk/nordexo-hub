create or replace function public.sync_catalog_variants_options_variations()
returns trigger
language plpgsql
as $$
declare
  opt2 text := nullif(btrim(coalesce(new.option2, '')), '');
  opt3 text := nullif(btrim(coalesce(new.option3, '')), '');
  opt4 text := nullif(btrim(coalesce(new.option4, '')), '');
  var_color text := nullif(btrim(coalesce(new.variation_color_se, '')), '');
  var_size text := nullif(btrim(coalesce(new.variation_size_se, '')), '');
  var_other text := nullif(btrim(coalesce(new.variation_other_se, '')), '');
begin
  -- Do not mirror option1 <-> variation_amount_se automatically.
  -- option1 often stores CN/source text while variation_amount_se stores localized amount text.

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
