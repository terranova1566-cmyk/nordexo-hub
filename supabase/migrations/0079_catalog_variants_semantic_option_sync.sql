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
  p_opt1_name text := null;
  p_opt2_name text := null;
  p_opt3_name text := null;
  p_opt4_name text := null;
  sem1 text := null;
  sem2 text := null;
  sem3 text := null;
  sem4 text := null;
  has_semantic_mapping boolean := false;
begin
  if new.product_id is not null then
    select
      option1_name,
      option2_name,
      option3_name,
      option4_name
    into
      p_opt1_name,
      p_opt2_name,
      p_opt3_name,
      p_opt4_name
    from public.catalog_products
    where id = new.product_id;
  end if;

  sem1 := case regexp_replace(lower(translate(coalesce(p_opt1_name, ''), 'åäöÅÄÖ', 'aaoAAO')), '[^a-z0-9]+', '', 'g')
    when 'antal' then 'amount'
    when 'quantity' then 'amount'
    when 'qty' then 'amount'
    when 'farg' then 'color'
    when 'color' then 'color'
    when 'colour' then 'color'
    when 'storlek' then 'size'
    when 'size' then 'size'
    when 'alternativ' then 'other'
    when 'ovrigt' then 'other'
    when 'other' then 'other'
    when 'option' then 'other'
    else null
  end;

  sem2 := case regexp_replace(lower(translate(coalesce(p_opt2_name, ''), 'åäöÅÄÖ', 'aaoAAO')), '[^a-z0-9]+', '', 'g')
    when 'antal' then 'amount'
    when 'quantity' then 'amount'
    when 'qty' then 'amount'
    when 'farg' then 'color'
    when 'color' then 'color'
    when 'colour' then 'color'
    when 'storlek' then 'size'
    when 'size' then 'size'
    when 'alternativ' then 'other'
    when 'ovrigt' then 'other'
    when 'other' then 'other'
    when 'option' then 'other'
    else null
  end;

  sem3 := case regexp_replace(lower(translate(coalesce(p_opt3_name, ''), 'åäöÅÄÖ', 'aaoAAO')), '[^a-z0-9]+', '', 'g')
    when 'antal' then 'amount'
    when 'quantity' then 'amount'
    when 'qty' then 'amount'
    when 'farg' then 'color'
    when 'color' then 'color'
    when 'colour' then 'color'
    when 'storlek' then 'size'
    when 'size' then 'size'
    when 'alternativ' then 'other'
    when 'ovrigt' then 'other'
    when 'other' then 'other'
    when 'option' then 'other'
    else null
  end;

  sem4 := case regexp_replace(lower(translate(coalesce(p_opt4_name, ''), 'åäöÅÄÖ', 'aaoAAO')), '[^a-z0-9]+', '', 'g')
    when 'antal' then 'amount'
    when 'quantity' then 'amount'
    when 'qty' then 'amount'
    when 'farg' then 'color'
    when 'color' then 'color'
    when 'colour' then 'color'
    when 'storlek' then 'size'
    when 'size' then 'size'
    when 'alternativ' then 'other'
    when 'ovrigt' then 'other'
    when 'other' then 'other'
    when 'option' then 'other'
    else null
  end;

  has_semantic_mapping := sem1 is not null or sem2 is not null or sem3 is not null or sem4 is not null;

  if has_semantic_mapping then
    if sem1 = 'amount' then
      if opt1 is null and var_amount is not null then new.option1 := var_amount;
      elsif opt1 is not null and var_amount is null then new.variation_amount_se := opt1;
      end if;
    elsif sem1 = 'color' then
      if opt1 is null and var_color is not null then new.option1 := var_color;
      elsif opt1 is not null and var_color is null then new.variation_color_se := opt1;
      end if;
    elsif sem1 = 'size' then
      if opt1 is null and var_size is not null then new.option1 := var_size;
      elsif opt1 is not null and var_size is null then new.variation_size_se := opt1;
      end if;
    elsif sem1 = 'other' then
      if opt1 is null and var_other is not null then new.option1 := var_other;
      elsif opt1 is not null and var_other is null then new.variation_other_se := opt1;
      end if;
    end if;

    if sem2 = 'amount' then
      if opt2 is null and var_amount is not null then new.option2 := var_amount;
      elsif opt2 is not null and var_amount is null then new.variation_amount_se := opt2;
      end if;
    elsif sem2 = 'color' then
      if opt2 is null and var_color is not null then new.option2 := var_color;
      elsif opt2 is not null and var_color is null then new.variation_color_se := opt2;
      end if;
    elsif sem2 = 'size' then
      if opt2 is null and var_size is not null then new.option2 := var_size;
      elsif opt2 is not null and var_size is null then new.variation_size_se := opt2;
      end if;
    elsif sem2 = 'other' then
      if opt2 is null and var_other is not null then new.option2 := var_other;
      elsif opt2 is not null and var_other is null then new.variation_other_se := opt2;
      end if;
    end if;

    if sem3 = 'amount' then
      if opt3 is null and var_amount is not null then new.option3 := var_amount;
      elsif opt3 is not null and var_amount is null then new.variation_amount_se := opt3;
      end if;
    elsif sem3 = 'color' then
      if opt3 is null and var_color is not null then new.option3 := var_color;
      elsif opt3 is not null and var_color is null then new.variation_color_se := opt3;
      end if;
    elsif sem3 = 'size' then
      if opt3 is null and var_size is not null then new.option3 := var_size;
      elsif opt3 is not null and var_size is null then new.variation_size_se := opt3;
      end if;
    elsif sem3 = 'other' then
      if opt3 is null and var_other is not null then new.option3 := var_other;
      elsif opt3 is not null and var_other is null then new.variation_other_se := opt3;
      end if;
    end if;

    if sem4 = 'amount' then
      if opt4 is null and var_amount is not null then new.option4 := var_amount;
      elsif opt4 is not null and var_amount is null then new.variation_amount_se := opt4;
      end if;
    elsif sem4 = 'color' then
      if opt4 is null and var_color is not null then new.option4 := var_color;
      elsif opt4 is not null and var_color is null then new.variation_color_se := opt4;
      end if;
    elsif sem4 = 'size' then
      if opt4 is null and var_size is not null then new.option4 := var_size;
      elsif opt4 is not null and var_size is null then new.variation_size_se := opt4;
      end if;
    elsif sem4 = 'other' then
      if opt4 is null and var_other is not null then new.option4 := var_other;
      elsif opt4 is not null and var_other is null then new.variation_other_se := opt4;
      end if;
    end if;

    return new;
  end if;

  -- Legacy fallback when no usable option names are configured on the product.
  -- Do not mirror option1 <-> variation_amount_se automatically.
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
