create extension if not exists pgcrypto;
create extension if not exists unaccent with schema public;
create extension if not exists pg_trgm with schema public;

create table if not exists public.campaign_search_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  input_text text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  fingerprint_version text not null,
  fingerprint_model text,
  fingerprint_json jsonb,
  debug_json jsonb not null default '{}'::jsonb,
  error_message text
);

create index if not exists campaign_search_runs_status_created_idx
  on public.campaign_search_runs (status, created_at desc);

create table if not exists public.campaign_search_segments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.campaign_search_runs(id) on delete cascade,
  segment_key text not null,
  label text not null,
  order_index integer not null default 0,
  confidence numeric(6, 5) not null default 0,
  taxonomy_mode text not null default 'boost'
    check (taxonomy_mode in ('boost', 'prefer', 'require')),
  taxonomy_hints text[] not null default '{}'::text[],
  segment_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, segment_key)
);

create index if not exists campaign_search_segments_run_order_idx
  on public.campaign_search_segments (run_id, order_index asc, created_at asc);

create table if not exists public.campaign_search_results (
  id bigserial primary key,
  run_id uuid not null references public.campaign_search_runs(id) on delete cascade,
  segment_id uuid not null references public.campaign_search_segments(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  rank integer not null,
  final_score double precision not null,
  score_breakdown_json jsonb not null default '{}'::jsonb,
  matched_terms text[] not null default '{}'::text[],
  matched_taxonomies text[] not null default '{}'::text[],
  retrieval_sources text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique (segment_id, product_id)
);

create index if not exists campaign_search_results_segment_rank_idx
  on public.campaign_search_results (segment_id, rank asc, final_score desc);

create index if not exists campaign_search_results_run_segment_rank_idx
  on public.campaign_search_results (run_id, segment_id, rank asc);

create index if not exists campaign_search_results_product_idx
  on public.campaign_search_results (product_id);

create table if not exists public.search_synonyms (
  id bigserial primary key,
  locale text not null default 'sv',
  canonical text not null,
  alias text not null,
  strength double precision not null default 1,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (locale, canonical, alias)
);

create index if not exists search_synonyms_locale_canonical_idx
  on public.search_synonyms (locale, canonical);

create index if not exists search_synonyms_locale_alias_idx
  on public.search_synonyms (locale, alias);

create index if not exists search_synonyms_active_idx
  on public.search_synonyms (active);

create table if not exists public.search_lexicon (
  term text primary key,
  normalized_term text not null,
  frequency integer not null default 0,
  source text not null default 'catalog',
  updated_at timestamptz not null default now()
);

create index if not exists search_lexicon_normalized_idx
  on public.search_lexicon (normalized_term);

create table if not exists public.product_search_documents (
  product_id uuid primary key references public.catalog_products(id) on delete cascade,
  language text not null default 'sv',
  title_raw text,
  description_raw text,
  keyword_raw text,
  taxonomy_l1 text,
  taxonomy_l2 text,
  taxonomy_path text,
  title_norm text not null default '',
  description_norm text not null default '',
  keyword_norm text not null default '',
  taxonomy_norm text not null default '',
  search_shadow_norm text not null default '',
  search_tsv tsvector not null default ''::tsvector,
  embedding_placeholder jsonb,
  last_indexed_at timestamptz not null default now()
);

create index if not exists product_search_documents_taxonomy_l1_idx
  on public.product_search_documents (taxonomy_l1);

create index if not exists product_search_documents_taxonomy_l2_idx
  on public.product_search_documents (taxonomy_l2);

create index if not exists product_search_documents_last_indexed_idx
  on public.product_search_documents (last_indexed_at desc);

create index if not exists product_search_documents_search_tsv_idx
  on public.product_search_documents using gin (search_tsv);

create index if not exists product_search_documents_title_trgm_idx
  on public.product_search_documents using gin (title_norm gin_trgm_ops);

create index if not exists product_search_documents_keyword_trgm_idx
  on public.product_search_documents using gin (keyword_norm gin_trgm_ops);

create index if not exists product_search_documents_shadow_trgm_idx
  on public.product_search_documents using gin (search_shadow_norm gin_trgm_ops);

create or replace function public.search_strip_html(input_text text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(input_text, ''), '<br\\s*/?>', ' ', 'gi'),
        '</p>',
        ' ',
        'gi'
      ),
      '<[^>]+>',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.search_normalize_text(input_text text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(public.unaccent(coalesce(public.search_strip_html(input_text), ''))),
          '[/_\\-]+',
          ' ',
          'g'
        ),
        '[^a-z0-9\\s]+',
        ' ',
        'g'
      ),
      '\\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.search_text_contains_term(haystack text, needle text)
returns boolean
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(needle, '')), '') is null then false
    else position(
      ' ' || btrim(public.search_normalize_text(needle)) || ' '
      in
      ' ' || coalesce(public.search_normalize_text(haystack), '') || ' '
    ) > 0
  end;
$$;

create or replace function public.search_match_count(haystack text, needles text[])
returns integer
language sql
immutable
as $$
  select count(*)
  from unnest(coalesce(needles, '{}'::text[])) as term
  where public.search_text_contains_term(haystack, term);
$$;

create or replace function public.search_collect_matches(haystack text, needles text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct term order by term), '{}'::text[])
  from unnest(coalesce(needles, '{}'::text[])) as term
  where public.search_text_contains_term(haystack, term);
$$;

create or replace function public.search_make_weighted_tsv(
  title_text text,
  keyword_text text,
  taxonomy_text text,
  description_text text
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('simple', coalesce(title_text, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(keyword_text, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(taxonomy_text, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description_text, '')), 'C');
$$;

create or replace function public.search_build_shadow(input_text text, max_tokens integer default 48)
returns text
language sql
immutable
as $$
  with normalized as (
    select public.search_normalize_text(input_text) as value
  ),
  tokens as (
    select row_number() over () as ord, token
    from normalized,
    regexp_split_to_table(value, '\\s+') as token
    where token <> ''
    limit greatest(1, least(coalesce(max_tokens, 48), 96))
  ),
  joined as (
    select string_agg(token, ' ' order by ord) as base_text
    from tokens
  ),
  joined_bigrams as (
    select string_agg(t1.token || t2.token, ' ' order by t1.ord) as shadow_terms
    from tokens t1
    join tokens t2 on t2.ord = t1.ord + 1
    where length(t1.token) >= 2
      and length(t2.token) >= 2
      and length(t1.token || t2.token) between 5 and 48
  )
  select trim(
    regexp_replace(
      concat_ws(
        ' ',
        coalesce((select base_text from joined), ''),
        coalesce((select shadow_terms from joined_bigrams), '')
      ),
      '\\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.search_upsert_product_search_document(target_product_id uuid)
returns void
language plpgsql
as $$
declare
  product_row public.catalog_products%rowtype;
  title_raw_value text;
  description_raw_value text;
  keyword_raw_value text;
  taxonomy_path_value text;
  title_norm_value text;
  description_norm_value text;
  keyword_norm_value text;
  taxonomy_norm_value text;
  shadow_value text;
begin
  select *
  into product_row
  from public.catalog_products
  where id = target_product_id;

  if not found or coalesce(product_row.is_blocked, false) then
    delete from public.product_search_documents
    where product_id = target_product_id;
    return;
  end if;

  title_raw_value := concat_ws(
    ' ',
    nullif(btrim(product_row.legacy_title_sv), ''),
    case
      when nullif(btrim(product_row.legacy_title_sv), '') is not null then null
      else nullif(btrim(product_row.title), '')
    end,
    nullif(btrim(product_row.subtitle), '')
  );

  description_raw_value := concat_ws(
    ' ',
    nullif(btrim(product_row.legacy_description_sv), ''),
    nullif(btrim(product_row.legacy_bullets_sv), ''),
    nullif(btrim(public.search_strip_html(product_row.description_html)), '')
  );

  keyword_raw_value := concat_ws(
    ' ',
    nullif(btrim(product_row.product_categorizer_keywords), ''),
    nullif(btrim(product_row.tags), ''),
    nullif(btrim(product_row.brand), ''),
    nullif(btrim(product_row.vendor), ''),
    nullif(btrim(product_row.product_type), ''),
    nullif(btrim(product_row.shopify_category_name), '')
  );

  taxonomy_path_value := concat_ws(
    ' > ',
    nullif(btrim(product_row.google_taxonomy_l1), ''),
    nullif(btrim(product_row.google_taxonomy_l2), ''),
    nullif(btrim(product_row.google_taxonomy_l3), '')
  );

  title_norm_value := public.search_normalize_text(title_raw_value);
  description_norm_value := public.search_normalize_text(description_raw_value);
  keyword_norm_value := public.search_normalize_text(keyword_raw_value);
  taxonomy_norm_value := public.search_normalize_text(
    concat_ws(
      ' ',
      taxonomy_path_value,
      nullif(btrim(product_row.google_taxonomy_l1), ''),
      nullif(btrim(product_row.google_taxonomy_l2), '')
    )
  );

  shadow_value := public.search_build_shadow(
    concat_ws(
      ' ',
      title_raw_value,
      keyword_raw_value,
      taxonomy_path_value,
      nullif(btrim(product_row.google_taxonomy_l1), ''),
      nullif(btrim(product_row.google_taxonomy_l2), '')
    )
  );

  insert into public.product_search_documents (
    product_id,
    language,
    title_raw,
    description_raw,
    keyword_raw,
    taxonomy_l1,
    taxonomy_l2,
    taxonomy_path,
    title_norm,
    description_norm,
    keyword_norm,
    taxonomy_norm,
    search_shadow_norm,
    search_tsv,
    last_indexed_at
  )
  values (
    product_row.id,
    case
      when nullif(btrim(product_row.legacy_title_sv), '') is not null
        or nullif(btrim(product_row.legacy_description_sv), '') is not null
      then 'sv'
      else 'mixed'
    end,
    nullif(title_raw_value, ''),
    nullif(description_raw_value, ''),
    nullif(keyword_raw_value, ''),
    nullif(btrim(product_row.google_taxonomy_l1), ''),
    nullif(btrim(product_row.google_taxonomy_l2), ''),
    nullif(taxonomy_path_value, ''),
    coalesce(title_norm_value, ''),
    coalesce(description_norm_value, ''),
    coalesce(keyword_norm_value, ''),
    coalesce(taxonomy_norm_value, ''),
    coalesce(shadow_value, ''),
    public.search_make_weighted_tsv(
      title_norm_value,
      keyword_norm_value,
      taxonomy_norm_value,
      description_norm_value
    ),
    now()
  )
  on conflict (product_id) do update
  set
    language = excluded.language,
    title_raw = excluded.title_raw,
    description_raw = excluded.description_raw,
    keyword_raw = excluded.keyword_raw,
    taxonomy_l1 = excluded.taxonomy_l1,
    taxonomy_l2 = excluded.taxonomy_l2,
    taxonomy_path = excluded.taxonomy_path,
    title_norm = excluded.title_norm,
    description_norm = excluded.description_norm,
    keyword_norm = excluded.keyword_norm,
    taxonomy_norm = excluded.taxonomy_norm,
    search_shadow_norm = excluded.search_shadow_norm,
    search_tsv = excluded.search_tsv,
    last_indexed_at = excluded.last_indexed_at;
end;
$$;

create or replace function public.rebuild_product_search_documents(product_ids uuid[] default null)
returns integer
language plpgsql
as $$
declare
  indexed_count integer := 0;
begin
  if product_ids is null then
    delete from public.product_search_documents;
  else
    delete from public.product_search_documents
    where product_id = any(product_ids);
  end if;

  insert into public.product_search_documents (
    product_id,
    language,
    title_raw,
    description_raw,
    keyword_raw,
    taxonomy_l1,
    taxonomy_l2,
    taxonomy_path,
    title_norm,
    description_norm,
    keyword_norm,
    taxonomy_norm,
    search_shadow_norm,
    search_tsv,
    last_indexed_at
  )
  select
    p.id,
    case
      when nullif(btrim(p.legacy_title_sv), '') is not null
        or nullif(btrim(p.legacy_description_sv), '') is not null
      then 'sv'
      else 'mixed'
    end as language,
    nullif(
      concat_ws(
        ' ',
        nullif(btrim(p.legacy_title_sv), ''),
        case
          when nullif(btrim(p.legacy_title_sv), '') is not null then null
          else nullif(btrim(p.title), '')
        end,
        nullif(btrim(p.subtitle), '')
      ),
      ''
    ) as title_raw,
    nullif(
      concat_ws(
        ' ',
        nullif(btrim(p.legacy_description_sv), ''),
        nullif(btrim(p.legacy_bullets_sv), ''),
        nullif(btrim(public.search_strip_html(p.description_html)), '')
      ),
      ''
    ) as description_raw,
    nullif(
      concat_ws(
        ' ',
        nullif(btrim(p.product_categorizer_keywords), ''),
        nullif(btrim(p.tags), ''),
        nullif(btrim(p.brand), ''),
        nullif(btrim(p.vendor), ''),
        nullif(btrim(p.product_type), ''),
        nullif(btrim(p.shopify_category_name), '')
      ),
      ''
    ) as keyword_raw,
    nullif(btrim(p.google_taxonomy_l1), '') as taxonomy_l1,
    nullif(btrim(p.google_taxonomy_l2), '') as taxonomy_l2,
    nullif(
      concat_ws(
        ' > ',
        nullif(btrim(p.google_taxonomy_l1), ''),
        nullif(btrim(p.google_taxonomy_l2), ''),
        nullif(btrim(p.google_taxonomy_l3), '')
      ),
      ''
    ) as taxonomy_path,
    public.search_normalize_text(
      concat_ws(
        ' ',
        nullif(btrim(p.legacy_title_sv), ''),
        case
          when nullif(btrim(p.legacy_title_sv), '') is not null then null
          else nullif(btrim(p.title), '')
        end,
        nullif(btrim(p.subtitle), '')
      )
    ) as title_norm,
    public.search_normalize_text(
      concat_ws(
        ' ',
        nullif(btrim(p.legacy_description_sv), ''),
        nullif(btrim(p.legacy_bullets_sv), ''),
        nullif(btrim(public.search_strip_html(p.description_html)), '')
      )
    ) as description_norm,
    public.search_normalize_text(
      concat_ws(
        ' ',
        nullif(btrim(p.product_categorizer_keywords), ''),
        nullif(btrim(p.tags), ''),
        nullif(btrim(p.brand), ''),
        nullif(btrim(p.vendor), ''),
        nullif(btrim(p.product_type), ''),
        nullif(btrim(p.shopify_category_name), '')
      )
    ) as keyword_norm,
    public.search_normalize_text(
      concat_ws(
        ' ',
        concat_ws(
          ' > ',
          nullif(btrim(p.google_taxonomy_l1), ''),
          nullif(btrim(p.google_taxonomy_l2), ''),
          nullif(btrim(p.google_taxonomy_l3), '')
        ),
        nullif(btrim(p.google_taxonomy_l1), ''),
        nullif(btrim(p.google_taxonomy_l2), '')
      )
    ) as taxonomy_norm,
    public.search_build_shadow(
      concat_ws(
        ' ',
        nullif(btrim(p.legacy_title_sv), ''),
        case
          when nullif(btrim(p.legacy_title_sv), '') is not null then null
          else nullif(btrim(p.title), '')
        end,
        nullif(btrim(p.subtitle), ''),
        nullif(btrim(p.product_categorizer_keywords), ''),
        nullif(btrim(p.tags), ''),
        concat_ws(
          ' > ',
          nullif(btrim(p.google_taxonomy_l1), ''),
          nullif(btrim(p.google_taxonomy_l2), ''),
          nullif(btrim(p.google_taxonomy_l3), '')
        ),
        nullif(btrim(p.google_taxonomy_l1), ''),
        nullif(btrim(p.google_taxonomy_l2), '')
      )
    ) as search_shadow_norm,
    public.search_make_weighted_tsv(
      public.search_normalize_text(
        concat_ws(
          ' ',
          nullif(btrim(p.legacy_title_sv), ''),
          case
            when nullif(btrim(p.legacy_title_sv), '') is not null then null
            else nullif(btrim(p.title), '')
          end,
          nullif(btrim(p.subtitle), '')
        )
      ),
      public.search_normalize_text(
        concat_ws(
          ' ',
          nullif(btrim(p.product_categorizer_keywords), ''),
          nullif(btrim(p.tags), ''),
          nullif(btrim(p.brand), ''),
          nullif(btrim(p.vendor), ''),
          nullif(btrim(p.product_type), ''),
          nullif(btrim(p.shopify_category_name), '')
        )
      ),
      public.search_normalize_text(
        concat_ws(
          ' ',
          concat_ws(
            ' > ',
            nullif(btrim(p.google_taxonomy_l1), ''),
            nullif(btrim(p.google_taxonomy_l2), ''),
            nullif(btrim(p.google_taxonomy_l3), '')
          ),
          nullif(btrim(p.google_taxonomy_l1), ''),
          nullif(btrim(p.google_taxonomy_l2), '')
        )
      ),
      public.search_normalize_text(
        concat_ws(
          ' ',
          nullif(btrim(p.legacy_description_sv), ''),
          nullif(btrim(p.legacy_bullets_sv), ''),
          nullif(btrim(public.search_strip_html(p.description_html)), '')
        )
      )
    ) as search_tsv,
    now() as last_indexed_at
  from public.catalog_products p
  where coalesce(p.is_blocked, false) = false
    and (product_ids is null or p.id = any(product_ids));

  get diagnostics indexed_count = row_count;
  return indexed_count;
end;
$$;

create or replace function public.search_refresh_product_document_trigger()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.product_search_documents
    where product_id = old.id;
    return old;
  end if;

  perform public.search_upsert_product_search_document(new.id);
  return new;
end;
$$;

drop trigger if exists trg_catalog_products_refresh_product_search_document
  on public.catalog_products;

create trigger trg_catalog_products_refresh_product_search_document
after insert or update of
  title,
  subtitle,
  description_html,
  legacy_title_sv,
  legacy_description_sv,
  legacy_bullets_sv,
  product_categorizer_keywords,
  tags,
  brand,
  vendor,
  product_type,
  shopify_category_name,
  google_taxonomy_l1,
  google_taxonomy_l2,
  google_taxonomy_l3,
  is_blocked
on public.catalog_products
for each row
execute function public.search_refresh_product_document_trigger();

drop trigger if exists trg_catalog_products_delete_product_search_document
  on public.catalog_products;

create trigger trg_catalog_products_delete_product_search_document
after delete
on public.catalog_products
for each row
execute function public.search_refresh_product_document_trigger();

create or replace function public.search_rebuild_lexicon()
returns integer
language plpgsql
as $$
declare
  lexicon_count integer := 0;
begin
  truncate table public.search_lexicon;

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
    count(*)::integer as frequency,
    'product_search_documents' as source,
    now() as updated_at
  from (
    select regexp_split_to_table(
      concat_ws(
        ' ',
        coalesce(title_norm, ''),
        coalesce(keyword_norm, ''),
        coalesce(taxonomy_norm, ''),
        coalesce(search_shadow_norm, '')
      ),
      '\\s+'
    ) as token
    from public.product_search_documents
  ) terms
  where token <> ''
    and length(token) between 2 and 64
  group by token;

  get diagnostics lexicon_count = row_count;
  return lexicon_count;
end;
$$;

create or replace view public.product_search_taxonomy_options as
select
  taxonomy_l1,
  taxonomy_l2,
  count(*)::integer as product_count
from public.product_search_documents
where coalesce(taxonomy_l1, '') <> ''
  or coalesce(taxonomy_l2, '') <> ''
group by taxonomy_l1, taxonomy_l2;

create or replace function public.campaign_search_segment_candidates(input jsonb)
returns table (
  product_id uuid,
  strict_rank double precision,
  balanced_rank double precision,
  broad_rank double precision,
  trigram_rescue_score double precision,
  title_term_hits integer,
  description_term_hits integer,
  keyword_term_hits integer,
  title_phrase_hits integer,
  title_has_core boolean,
  description_has_core boolean,
  keyword_has_core boolean,
  taxonomy_l1_match boolean,
  taxonomy_l2_match boolean,
  must_have_hits integer,
  negative_hits integer,
  synonym_hits integer,
  coverage_count integer,
  matched_terms text[],
  matched_taxonomies text[],
  retrieval_sources text[],
  evidence_json jsonb
)
language sql
stable
as $$
  with params as (
    select
      coalesce(input->>'strict_tsquery', '') as strict_tsquery,
      coalesce(input->>'balanced_tsquery', '') as balanced_tsquery,
      coalesce(input->>'broad_tsquery', '') as broad_tsquery,
      coalesce(input->>'taxonomy_mode', 'boost') as taxonomy_mode,
      least(greatest(coalesce((input->>'taxonomy_confidence')::double precision, 0), 0), 1) as taxonomy_confidence,
      greatest(25, least(coalesce((input->>'strict_limit')::integer, 160), 400)) as strict_limit,
      greatest(50, least(coalesce((input->>'balanced_limit')::integer, 220), 500)) as balanced_limit,
      greatest(100, least(coalesce((input->>'broad_limit')::integer, 320), 700)) as broad_limit,
      greatest(75, least(coalesce((input->>'rescue_limit')::integer, 220), 500)) as rescue_limit,
      greatest(50, least(coalesce((input->>'final_limit')::integer, 500), 1000)) as final_limit
  ),
  arrays as (
    select
      coalesce((
        select array_agg(distinct term order by term)
        from (
          select nullif(public.search_normalize_text(value), '') as term
          from jsonb_array_elements_text(coalesce(input->'core_terms', '[]'::jsonb)) entries(value)
        ) normalized
        where term is not null
      ), '{}'::text[]) as core_terms,
      coalesce((
        select array_agg(distinct term order by term)
        from (
          select nullif(public.search_normalize_text(value), '') as term
          from jsonb_array_elements_text(coalesce(input->'synonyms', '[]'::jsonb)) entries(value)
        ) normalized
        where term is not null
      ), '{}'::text[]) as synonyms,
      coalesce((
        select array_agg(distinct term order by term)
        from (
          select nullif(public.search_normalize_text(value), '') as term
          from jsonb_array_elements_text(coalesce(input->'must_have', '[]'::jsonb)) entries(value)
        ) normalized
        where term is not null
      ), '{}'::text[]) as must_have,
      coalesce((
        select array_agg(distinct term order by term)
        from (
          select nullif(public.search_normalize_text(value), '') as term
          from jsonb_array_elements_text(coalesce(input->'negative_terms', '[]'::jsonb)) entries(value)
        ) normalized
        where term is not null
      ), '{}'::text[]) as negative_terms,
      coalesce((
        select array_agg(distinct term order by term)
        from (
          select nullif(public.search_normalize_text(value), '') as term
          from jsonb_array_elements_text(coalesce(input->'rescue_terms', '[]'::jsonb)) entries(value)
        ) normalized
        where term is not null
      ), '{}'::text[]) as rescue_terms,
      coalesce((
        select array_agg(distinct term order by term)
        from (
          select nullif(btrim(value), '') as term
          from jsonb_array_elements_text(coalesce(input->'taxonomy_l1', '[]'::jsonb)) entries(value)
        ) normalized
        where term is not null
      ), '{}'::text[]) as taxonomy_l1,
      coalesce((
        select array_agg(distinct term order by term)
        from (
          select nullif(btrim(value), '') as term
          from jsonb_array_elements_text(coalesce(input->'taxonomy_l2', '[]'::jsonb)) entries(value)
        ) normalized
        where term is not null
      ), '{}'::text[]) as taxonomy_l2,
      coalesce((
        select array_agg(distinct term order by term)
        from (
          select nullif(public.search_normalize_text(value), '') as term
          from jsonb_array_elements_text(coalesce(input->'strict_phrases', '[]'::jsonb)) entries(value)
        ) normalized
        where term is not null
      ), '{}'::text[]) as strict_phrases,
      coalesce((
        select array_agg(distinct term order by term)
        from (
          select nullif(public.search_normalize_text(value), '') as term
          from jsonb_array_elements_text(coalesce(input->'balanced_phrases', '[]'::jsonb)) entries(value)
        ) normalized
        where term is not null
      ), '{}'::text[]) as balanced_phrases
  ),
  q as (
    select
      case when p.strict_tsquery <> '' then to_tsquery('simple', p.strict_tsquery) end as strict_query,
      case when p.balanced_tsquery <> '' then to_tsquery('simple', p.balanced_tsquery) end as balanced_query,
      case when p.broad_tsquery <> '' then to_tsquery('simple', p.broad_tsquery) end as broad_query,
      p.*,
      a.*
    from params p
    cross join arrays a
  ),
  strict_candidates as (
    select
      d.product_id,
      ts_rank_cd(d.search_tsv, q.strict_query, 32) as score,
      'strict'::text as source
    from public.product_search_documents d
    cross join q
    where q.strict_query is not null
      and d.search_tsv @@ q.strict_query
      and (
        q.taxonomy_mode <> 'require'
        or cardinality(q.taxonomy_l1) = 0 and cardinality(q.taxonomy_l2) = 0
        or d.taxonomy_l2 = any(q.taxonomy_l2)
        or d.taxonomy_l1 = any(q.taxonomy_l1)
      )
    order by
      case
        when d.taxonomy_l2 = any(q.taxonomy_l2) then 2
        when d.taxonomy_l1 = any(q.taxonomy_l1) then 1
        else 0
      end desc,
      score desc
    limit (select strict_limit from params)
  ),
  balanced_candidates as (
    select
      d.product_id,
      ts_rank_cd(d.search_tsv, q.balanced_query, 32) as score,
      'balanced'::text as source
    from public.product_search_documents d
    cross join q
    where q.balanced_query is not null
      and d.search_tsv @@ q.balanced_query
      and (
        q.taxonomy_mode not in ('require')
        or q.taxonomy_confidence < 0.85
        or cardinality(q.taxonomy_l1) = 0 and cardinality(q.taxonomy_l2) = 0
        or d.taxonomy_l2 = any(q.taxonomy_l2)
        or d.taxonomy_l1 = any(q.taxonomy_l1)
      )
    order by
      case
        when d.taxonomy_l2 = any(q.taxonomy_l2) then 2
        when d.taxonomy_l1 = any(q.taxonomy_l1) then 1
        else 0
      end desc,
      score desc
    limit (select balanced_limit from params)
  ),
  broad_candidates as (
    select
      d.product_id,
      ts_rank_cd(d.search_tsv, q.broad_query, 32) as score,
      'broad'::text as source
    from public.product_search_documents d
    cross join q
    where q.broad_query is not null
      and d.search_tsv @@ q.broad_query
    order by score desc
    limit (select broad_limit from params)
  ),
  rescue_candidates as (
    select
      d.product_id,
      greatest(
        coalesce((
          select max(
            greatest(
              similarity(d.search_shadow_norm, term),
              similarity(d.title_norm, term),
              similarity(d.keyword_norm, term),
              word_similarity(d.search_shadow_norm, term)
            )
          )
          from unnest(q.rescue_terms) as term
        ), 0),
        coalesce((
          select max(
            greatest(
              similarity(d.search_shadow_norm, term),
              similarity(d.title_norm, term),
              similarity(d.keyword_norm, term),
              word_similarity(d.search_shadow_norm, term)
            )
          )
          from unnest(q.core_terms) as term
        ), 0)
      ) as score,
      'rescue'::text as source
    from public.product_search_documents d
    cross join q
    where exists (
      select 1
      from unnest(q.rescue_terms || q.core_terms) as term
      where (d.search_shadow_norm % term)
         or (d.title_norm % term)
         or (d.keyword_norm % term)
    )
    order by score desc
    limit (select rescue_limit from params)
  ),
  candidate_sources as (
    select * from strict_candidates
    union all
    select * from balanced_candidates
    union all
    select * from broad_candidates
    union all
    select * from rescue_candidates
  ),
  candidate_pool as (
    select
      product_id,
      max(case when source = 'strict' then score else 0 end) as strict_rank,
      max(case when source = 'balanced' then score else 0 end) as balanced_rank,
      max(case when source = 'broad' then score else 0 end) as broad_rank,
      max(case when source = 'rescue' then score else 0 end) as trigram_rescue_score,
      array_agg(distinct source order by source) as retrieval_sources
    from candidate_sources
    group by product_id
    order by
      max(case when source = 'strict' then score else 0 end) desc,
      max(case when source = 'balanced' then score else 0 end) desc,
      max(case when source = 'broad' then score else 0 end) desc,
      max(case when source = 'rescue' then score else 0 end) desc
    limit (select final_limit from params)
  ),
  enriched as (
    select
      c.product_id,
      c.strict_rank,
      c.balanced_rank,
      c.broad_rank,
      c.trigram_rescue_score,
      c.retrieval_sources,
      d.title_norm,
      d.description_norm,
      d.keyword_norm,
      d.taxonomy_l1,
      d.taxonomy_l2,
      q.core_terms,
      q.synonyms,
      q.must_have,
      q.negative_terms,
      q.strict_phrases,
      q.balanced_phrases,
      q.taxonomy_l1 as mapped_taxonomy_l1,
      q.taxonomy_l2 as mapped_taxonomy_l2
    from candidate_pool c
    join public.product_search_documents d on d.product_id = c.product_id
    cross join q
  ),
  scored as (
    select
      product_id,
      strict_rank,
      balanced_rank,
      broad_rank,
      trigram_rescue_score,
      public.search_match_count(title_norm, core_terms) as title_term_hits,
      public.search_match_count(description_norm, core_terms) as description_term_hits,
      public.search_match_count(keyword_norm, core_terms) as keyword_term_hits,
      public.search_match_count(
        title_norm,
        strict_phrases || balanced_phrases
      ) as title_phrase_hits,
      public.search_match_count(title_norm, core_terms) > 0 as title_has_core,
      public.search_match_count(description_norm, core_terms) > 0 as description_has_core,
      public.search_match_count(keyword_norm, core_terms) > 0 as keyword_has_core,
      coalesce(taxonomy_l1, '') <> '' and taxonomy_l1 = any(mapped_taxonomy_l1) as taxonomy_l1_match,
      coalesce(taxonomy_l2, '') <> '' and taxonomy_l2 = any(mapped_taxonomy_l2) as taxonomy_l2_match,
      public.search_match_count(
        concat_ws(' ', title_norm, keyword_norm, description_norm),
        must_have
      ) as must_have_hits,
      public.search_match_count(
        concat_ws(' ', title_norm, keyword_norm, description_norm),
        negative_terms
      ) as negative_hits,
      public.search_match_count(
        concat_ws(' ', title_norm, keyword_norm, description_norm),
        synonyms
      ) as synonym_hits,
      cardinality(
        (
          select coalesce(array_agg(distinct term order by term), '{}'::text[])
          from unnest(
            public.search_collect_matches(title_norm, core_terms) ||
            public.search_collect_matches(description_norm, core_terms) ||
            public.search_collect_matches(keyword_norm, core_terms)
          ) as term
        )
      ) as coverage_count,
      (
        select coalesce(array_agg(distinct term order by term), '{}'::text[])
        from unnest(
          public.search_collect_matches(title_norm, core_terms) ||
          public.search_collect_matches(title_norm, synonyms) ||
          public.search_collect_matches(description_norm, core_terms) ||
          public.search_collect_matches(description_norm, synonyms) ||
          public.search_collect_matches(keyword_norm, core_terms) ||
          public.search_collect_matches(keyword_norm, synonyms) ||
          public.search_collect_matches(
            concat_ws(' ', title_norm, keyword_norm, description_norm),
            must_have
          )
        ) as term
      ) as matched_terms,
      array_remove(
        array[
          case
            when coalesce(taxonomy_l2, '') <> '' and taxonomy_l2 = any(mapped_taxonomy_l2)
            then concat_ws(' > ', taxonomy_l1, taxonomy_l2)
          end,
          case
            when coalesce(taxonomy_l1, '') <> '' and taxonomy_l1 = any(mapped_taxonomy_l1)
            then taxonomy_l1
          end
        ],
        null
      ) as matched_taxonomies,
      retrieval_sources,
      jsonb_build_object(
        'title_core_matches', public.search_collect_matches(title_norm, core_terms),
        'description_core_matches', public.search_collect_matches(description_norm, core_terms),
        'keyword_core_matches', public.search_collect_matches(keyword_norm, core_terms),
        'synonym_matches', public.search_collect_matches(
          concat_ws(' ', title_norm, keyword_norm, description_norm),
          synonyms
        ),
        'must_have_matches', public.search_collect_matches(
          concat_ws(' ', title_norm, keyword_norm, description_norm),
          must_have
        ),
        'negative_matches', public.search_collect_matches(
          concat_ws(' ', title_norm, keyword_norm, description_norm),
          negative_terms
        )
      ) as evidence_json
    from enriched
  )
  select
    product_id,
    strict_rank,
    balanced_rank,
    broad_rank,
    trigram_rescue_score,
    title_term_hits,
    description_term_hits,
    keyword_term_hits,
    title_phrase_hits,
    title_has_core,
    description_has_core,
    keyword_has_core,
    taxonomy_l1_match,
    taxonomy_l2_match,
    must_have_hits,
    negative_hits,
    synonym_hits,
    coverage_count,
    matched_terms,
    matched_taxonomies,
    retrieval_sources,
    evidence_json
  from scored
  order by
    strict_rank desc,
    balanced_rank desc,
    broad_rank desc,
    trigram_rescue_score desc,
    title_term_hits desc,
    coverage_count desc,
    product_id asc;
$$;

create or replace function public.campaign_search_replace_segment_results(
  in_run_id uuid,
  in_segment_id uuid,
  in_rows jsonb
)
returns integer
language plpgsql
as $$
declare
  inserted_count integer := 0;
begin
  delete from public.campaign_search_results
  where segment_id = in_segment_id;

  if jsonb_typeof(coalesce(in_rows, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(in_rows, '[]'::jsonb)) = 0 then
    return 0;
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(in_rows) as entry(
      product_id uuid,
      final_score double precision,
      score_breakdown_json jsonb,
      matched_terms text[],
      matched_taxonomies text[],
      retrieval_sources text[]
    )
  ),
  ranked as (
    select
      product_id,
      final_score,
      coalesce(score_breakdown_json, '{}'::jsonb) as score_breakdown_json,
      coalesce(matched_terms, '{}'::text[]) as matched_terms,
      coalesce(matched_taxonomies, '{}'::text[]) as matched_taxonomies,
      coalesce(retrieval_sources, '{}'::text[]) as retrieval_sources,
      row_number() over (order by final_score desc, product_id asc) as rank
    from rows
    where product_id is not null
  )
  insert into public.campaign_search_results (
    run_id,
    segment_id,
    product_id,
    rank,
    final_score,
    score_breakdown_json,
    matched_terms,
    matched_taxonomies,
    retrieval_sources
  )
  select
    in_run_id,
    in_segment_id,
    product_id,
    rank,
    final_score,
    score_breakdown_json,
    matched_terms,
    matched_taxonomies,
    retrieval_sources
  from ranked;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

alter table public.campaign_search_runs enable row level security;
alter table public.campaign_search_segments enable row level security;
alter table public.campaign_search_results enable row level security;
alter table public.search_synonyms enable row level security;
alter table public.search_lexicon enable row level security;
alter table public.product_search_documents enable row level security;

notify pgrst, 'reload schema';
