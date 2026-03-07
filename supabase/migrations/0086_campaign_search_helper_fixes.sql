create or replace function public.search_build_shadow(input_text text, max_tokens integer default 48)
returns text
language plpgsql
immutable
as $$
declare
  normalized_value text;
  tokens text[];
  token_limit integer;
  token_count integer;
  joined_bigrams text[] := '{}'::text[];
  index_value integer;
begin
  normalized_value := public.search_normalize_text(input_text);

  if normalized_value = '' then
    return '';
  end if;

  token_limit := greatest(1, least(coalesce(max_tokens, 48), 96));
  tokens := regexp_split_to_array(normalized_value, '\s+');
  token_count := coalesce(array_length(tokens, 1), 0);

  if token_count = 0 then
    return '';
  end if;

  if token_count > token_limit then
    tokens := tokens[1:token_limit];
    token_count := token_limit;
  end if;

  if token_count > 1 then
    for index_value in 1..(token_count - 1) loop
      if length(tokens[index_value]) >= 2
        and length(tokens[index_value + 1]) >= 2
        and length(tokens[index_value] || tokens[index_value + 1]) between 5 and 48
      then
        joined_bigrams := array_append(joined_bigrams, tokens[index_value] || tokens[index_value + 1]);
      end if;
    end loop;
  end if;

  return trim(
    regexp_replace(
      concat_ws(
        ' ',
        array_to_string(tokens, ' '),
        array_to_string(joined_bigrams, ' ')
      ),
      '\s+',
      ' ',
      'g'
    )
  );
end;
$$;

create or replace function public.search_rebuild_lexicon()
returns integer
language plpgsql
as $$
declare
  lexicon_count integer := 0;
begin
  truncate table public.search_lexicon;

  with aggregated_terms as (
    select
      token,
      count(*)::integer as frequency
    from (
      select unnest(
        regexp_split_to_array(
          concat_ws(
            ' ',
            coalesce(title_norm, ''),
            coalesce(keyword_norm, ''),
            coalesce(taxonomy_norm, ''),
            coalesce(search_shadow_norm, '')
          ),
          '\s+'
        )
      ) as token
      from public.product_search_documents
    ) terms
    where token <> ''
      and length(token) between 2 and 64
    group by token
  )
  insert into public.search_lexicon (
    term,
    normalized_term,
    frequency,
    source,
    updated_at
  )
  select
    token as term,
    token as normalized_term,
    frequency,
    'product_search_documents' as source,
    now() as updated_at
  from aggregated_terms;

  get diagnostics lexicon_count = row_count;
  return lexicon_count;
end;
$$;
