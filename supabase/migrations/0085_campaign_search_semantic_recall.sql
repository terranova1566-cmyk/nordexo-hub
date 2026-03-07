create extension if not exists vector with schema public;

create table if not exists public.search_taxonomy_aliases (
  id bigserial primary key,
  locale text not null default 'sv',
  alias text not null,
  taxonomy_l1 text,
  taxonomy_l2 text,
  confidence double precision not null default 0.9,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (locale, alias, taxonomy_l1, taxonomy_l2)
);

create index if not exists search_taxonomy_aliases_alias_idx
  on public.search_taxonomy_aliases (locale, alias);

create index if not exists search_taxonomy_aliases_active_idx
  on public.search_taxonomy_aliases (active);

alter table public.product_search_documents
  add column if not exists embedding public.vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_version text,
  add column if not exists embedding_source_text text not null default '',
  add column if not exists embedding_source_hash text not null default '',
  add column if not exists embedding_updated_at timestamptz;

alter table public.product_search_documents
  drop column if exists embedding_placeholder;

create index if not exists product_search_documents_embedding_model_idx
  on public.product_search_documents (embedding_model, embedding_updated_at desc);

create index if not exists product_search_documents_embedding_source_hash_idx
  on public.product_search_documents (embedding_source_hash);

create index if not exists product_search_documents_embedding_ivfflat_idx
  on public.product_search_documents
  using ivfflat (embedding public.vector_cosine_ops)
  with (lists = 100);

create or replace function public.search_hash_text(input_text text)
returns text
language sql
immutable
as $$
  select encode(digest(coalesce(input_text, ''), 'sha256'), 'hex');
$$;

create or replace function public.search_build_embedding_source(
  title_text text,
  keyword_text text,
  taxonomy_text text,
  description_text text
)
returns text
language sql
immutable
as $$
  select left(
    trim(
      regexp_replace(
        concat_ws(
          E'\n',
          case when nullif(btrim(coalesce(title_text, '')), '') is not null then 'title: ' || btrim(title_text) end,
          case when nullif(btrim(coalesce(keyword_text, '')), '') is not null then 'keywords: ' || btrim(keyword_text) end,
          case when nullif(btrim(coalesce(taxonomy_text, '')), '') is not null then 'taxonomy: ' || btrim(taxonomy_text) end,
          case when nullif(btrim(coalesce(description_text, '')), '') is not null then 'description: ' || btrim(description_text) end
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    6000
  );
$$;

create or replace function public.search_parse_embedding_vector(input_text text)
returns public.vector(1536)
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(input_text, '')), '') is null then null
    else btrim(input_text)::public.vector(1536)
  end;
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
  embedding_source_text_value text;
  embedding_source_hash_value text;
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

  embedding_source_text_value := public.search_build_embedding_source(
    title_raw_value,
    keyword_raw_value,
    taxonomy_path_value,
    description_raw_value
  );
  embedding_source_hash_value := public.search_hash_text(embedding_source_text_value);

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
    embedding_source_text,
    embedding_source_hash,
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
    coalesce(embedding_source_text_value, ''),
    coalesce(embedding_source_hash_value, ''),
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
    embedding_source_text = excluded.embedding_source_text,
    embedding_source_hash = excluded.embedding_source_hash,
    embedding = case
      when public.product_search_documents.embedding_source_hash = excluded.embedding_source_hash
      then public.product_search_documents.embedding
      else null
    end,
    embedding_model = case
      when public.product_search_documents.embedding_source_hash = excluded.embedding_source_hash
      then public.product_search_documents.embedding_model
      else null
    end,
    embedding_version = case
      when public.product_search_documents.embedding_source_hash = excluded.embedding_source_hash
      then public.product_search_documents.embedding_version
      else null
    end,
    embedding_updated_at = case
      when public.product_search_documents.embedding_source_hash = excluded.embedding_source_hash
      then public.product_search_documents.embedding_updated_at
      else null
    end,
    last_indexed_at = excluded.last_indexed_at;
end;
$$;

create or replace function public.rebuild_product_search_documents(product_ids uuid[] default null)
returns integer
language plpgsql
as $$
declare
  indexed_count integer := 0;
  target_product_id uuid;
begin
  for target_product_id in
    select p.id
    from public.catalog_products p
    where coalesce(p.is_blocked, false) = false
      and (product_ids is null or p.id = any(product_ids))
    order by p.id
  loop
    perform public.search_upsert_product_search_document(target_product_id);
    indexed_count := indexed_count + 1;
  end loop;

  if product_ids is null then
    delete from public.product_search_documents d
    where not exists (
      select 1
      from public.catalog_products p
      where p.id = d.product_id
        and coalesce(p.is_blocked, false) = false
    );
  else
    delete from public.product_search_documents d
    where d.product_id = any(product_ids)
      and not exists (
        select 1
        from public.catalog_products p
        where p.id = d.product_id
          and coalesce(p.is_blocked, false) = false
      );
  end if;

  return indexed_count;
end;
$$;

create or replace function public.campaign_search_semantic_candidates(input jsonb)
returns table (
  product_id uuid,
  strict_rank double precision,
  balanced_rank double precision,
  broad_rank double precision,
  trigram_rescue_score double precision,
  semantic_similarity double precision,
  semantic_rank integer,
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
      public.search_parse_embedding_vector(input->>'query_embedding') as query_embedding,
      coalesce(input->>'taxonomy_mode', 'boost') as taxonomy_mode,
      least(greatest(coalesce((input->>'taxonomy_confidence')::double precision, 0), 0), 1) as taxonomy_confidence,
      greatest(25, least(coalesce((input->>'semantic_limit')::integer, 180), 600)) as semantic_limit,
      least(greatest(coalesce((input->>'min_similarity')::double precision, 0.35), 0), 1) as min_similarity
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
      p.*,
      a.*
    from params p
    cross join arrays a
    where p.query_embedding is not null
  ),
  semantic_pool as (
    select
      d.product_id,
      (1 - (d.embedding <=> q.query_embedding))::double precision as semantic_similarity,
      case
        when d.taxonomy_l2 = any(q.taxonomy_l2) then 2
        when d.taxonomy_l1 = any(q.taxonomy_l1) then 1
        else 0
      end as taxonomy_rank
    from public.product_search_documents d
    cross join q
    where d.embedding is not null
      and (1 - (d.embedding <=> q.query_embedding)) >= q.min_similarity
      and (
        q.taxonomy_mode <> 'require'
        or q.taxonomy_confidence < 0.85
        or cardinality(q.taxonomy_l1) = 0 and cardinality(q.taxonomy_l2) = 0
        or d.taxonomy_l2 = any(q.taxonomy_l2)
        or d.taxonomy_l1 = any(q.taxonomy_l1)
      )
    order by
      taxonomy_rank desc,
      semantic_similarity desc,
      d.product_id asc
    limit (select semantic_limit from params)
  ),
  candidate_pool as (
    select
      product_id,
      semantic_similarity,
      row_number() over (
        order by taxonomy_rank desc, semantic_similarity desc, product_id asc
      ) as semantic_rank
    from semantic_pool
  ),
  enriched as (
    select
      c.product_id,
      c.semantic_similarity,
      c.semantic_rank,
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
  )
  select
    product_id,
    null::double precision as strict_rank,
    null::double precision as balanced_rank,
    null::double precision as broad_rank,
    null::double precision as trigram_rescue_score,
    semantic_similarity,
    semantic_rank,
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
    array['semantic']::text[] as retrieval_sources,
    jsonb_build_object(
      'semantic_similarity', semantic_similarity,
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
  order by
    semantic_similarity desc,
    title_term_hits desc,
    coverage_count desc,
    product_id asc;
$$;

create or replace function public.campaign_search_apply_embeddings(
  in_model text,
  in_version text,
  in_rows jsonb
)
returns integer
language plpgsql
as $$
declare
  updated_count integer := 0;
begin
  if jsonb_typeof(coalesce(in_rows, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(in_rows, '[]'::jsonb)) = 0 then
    return 0;
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(in_rows) as entry(
      product_id uuid,
      embedding_text text,
      source_hash text
    )
  )
  update public.product_search_documents d
  set
    embedding = public.search_parse_embedding_vector(rows.embedding_text),
    embedding_model = nullif(btrim(coalesce(in_model, '')), ''),
    embedding_version = nullif(btrim(coalesce(in_version, '')), ''),
    embedding_updated_at = now()
  from rows
  where d.product_id = rows.product_id
    and nullif(btrim(coalesce(rows.embedding_text, '')), '') is not null
    and (
      nullif(btrim(coalesce(rows.source_hash, '')), '') is null
      or d.embedding_source_hash = rows.source_hash
    );

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

alter table public.search_taxonomy_aliases enable row level security;

notify pgrst, 'reload schema';
