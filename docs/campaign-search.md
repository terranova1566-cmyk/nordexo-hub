# Campaign Search

Campaign Search is an internal/admin retrieval workflow for matching partner campaign text against the existing product catalog without running an LLM across every product. Phase 1 established the lexical foundation. Phase 2 adds optional semantic recall, hybrid rank fusion, fixture-based evaluation, and explicit tuning surfaces for synonyms and taxonomy aliases.

## Goal

- Paste campaign text into an internal tool.
- Extract 1..N product-family segments with one server-side LLM call.
- Run deterministic lexical retrieval per segment.
- Optionally run semantic recall per segment using precomputed product embeddings.
- Persist the run, segment plans, score breakdowns, and ranked results.
- Open a segment directly inside the existing Product Manager with stored rank order.

## Architecture

- UI: [app/app/products/campaign-search/page.tsx](/srv/nordexo-hub/app/app/products/campaign-search/page.tsx)
- Engine service: [lib/campaign-search/service.ts](/srv/nordexo-hub/lib/campaign-search/service.ts)
- Prompt + schemas: [lib/campaign-search/prompt.ts](/srv/nordexo-hub/lib/campaign-search/prompt.ts), [lib/campaign-search/schema.ts](/srv/nordexo-hub/lib/campaign-search/schema.ts)
- Query planning: [lib/campaign-search/query-builder.ts](/srv/nordexo-hub/lib/campaign-search/query-builder.ts)
- Taxonomy mapping: [lib/campaign-search/taxonomy.ts](/srv/nordexo-hub/lib/campaign-search/taxonomy.ts)
- Semantic helpers: [lib/campaign-search/semantic.ts](/srv/nordexo-hub/lib/campaign-search/semantic.ts)
- Ranking + hybrid fusion: [lib/campaign-search/scoring.ts](/srv/nordexo-hub/lib/campaign-search/scoring.ts)
- Evaluation + tuning heuristics: [lib/campaign-search/evaluation.ts](/srv/nordexo-hub/lib/campaign-search/evaluation.ts), [lib/campaign-search/tuning-analyst.ts](/srv/nordexo-hub/lib/campaign-search/tuning-analyst.ts)
- API routes: [app/api/campaign-search/route.ts](/srv/nordexo-hub/app/api/campaign-search/route.ts), [app/api/campaign-search/[runId]/route.ts](/srv/nordexo-hub/app/api/campaign-search/[runId]/route.ts), [app/api/campaign-search/reindex/route.ts](/srv/nordexo-hub/app/api/campaign-search/reindex/route.ts)
- SQL foundation: [0084_campaign_search_foundation.sql](/srv/nordexo-hub/supabase/migrations/0084_campaign_search_foundation.sql), [0085_campaign_search_semantic_recall.sql](/srv/nordexo-hub/supabase/migrations/0085_campaign_search_semantic_recall.sql)

## DB Objects

- `campaign_search_runs`: stores raw input, run lifecycle, fingerprint JSON, debug JSON, and error state.
- `campaign_search_segments`: stores the persisted segment plans per run.
- `campaign_search_results`: stores ranked product results per segment with explicit score breakdowns and retrieval sources.
- `search_synonyms`: curated canonical/alias pairs for deterministic synonym expansion.
- `search_taxonomy_aliases`: curated alias-to-taxonomy mappings used to stabilize taxonomy hint resolution.
- `search_lexicon`: bounded catalog lexicon used by compound helpers.
- `product_search_documents`: normalized search representation of each product with weighted `tsvector`, compound-aware shadow text, and optional embedding metadata.
- `product_search_taxonomy_options` view: exposes distinct L1/L2 taxonomy choices and counts.

## LLM Extraction

- Exactly one OpenAI chat-completions call runs per campaign execution.
- The request uses a strict JSON schema when supported, with a JSON-object fallback for compatibility.
- The prompt is versioned by `campaign-search-fingerprint/v1`.
- The raw structured response and whether structured schema mode was used are stored in `debug_json`.
- If extraction fails or validates badly, the engine falls back to one deterministic segment built from token extraction.

## Retrieval Pipeline

Per segment:

1. Taxonomy hints are mapped against real catalog L1/L2 values, optionally boosted by `search_taxonomy_aliases`.
2. Deterministic query plans are built:
   - `strict`
   - `balanced`
   - `broad`
   - `rescue`
   - `semanticQueryText`
3. PostgreSQL runs lexical retrieval:
   - weighted `tsvector` search
   - taxonomy-aware ordering and optional gating
   - trigram/word-similarity rescue against `search_shadow_norm`
4. If semantic recall is enabled:
   - the segment query text is embedded at runtime
   - vector similarity search runs against precomputed `product_search_documents.embedding`
   - semantic candidates are tagged with `retrieval_sources = ['semantic']`
5. Lexical and semantic candidates are fused in TypeScript and ranked with explicit score components.
6. Ranked results are persisted through `campaign_search_replace_segment_results`.

## Hybrid Ranking

Lexical evidence remains the backbone. Semantic retrieval is a rescue layer.

Current explicit score components:

- `lexical_rank_strict`
- `lexical_rank_balanced`
- `lexical_rank_broad`
- `trigram_rescue_score`
- `semantic_similarity_score`
- `hybrid_rrf_lexical`
- `hybrid_rrf_semantic`
- `semantic_overlap_bonus`
- `title_exact_boost`
- `title_phrase_boost`
- `title_description_both_bonus`
- `keyword_field_boost`
- `taxonomy_boost`
- `coverage_boost`
- `must_have_boost`
- `synonym_soft_boost`
- `negative_penalty`

Fusion behavior:

- lexical score components still dominate strong top hits
- lexical and semantic positions are also fused with weighted reciprocal-rank fusion
- semantic-only matches can enter the ranked set when lexical matching misses them
- overlap between lexical and semantic retrieval gets a small bonus
- semantic recall is intentionally underweighted relative to strong lexical/title/taxonomy evidence

Weights live in [constants.ts](/srv/nordexo-hub/lib/campaign-search/constants.ts).

## Swedish Compound Handling

- Search normalization keeps raw product text unchanged for display but normalizes indexed text for matching.
- `search_shadow_norm` appends bounded joined bigrams from product text so split input like `läs glasögon` can hit `läsglasögon`.
- Query planning generates:
  - joined variants from adjacent tokens
  - split variants from likely long compounds
- Split/join generation is bounded and only emitted when supported by the catalog lexicon or curated synonym support.
- Semantic recall can rescue misses, but compound-aware lexical matching remains the first-line mechanism.

## Embeddings

### Config

- `CAMPAIGN_SEARCH_SEMANTIC_ENABLED=true`
- `OPENAI_API_KEY=...`
- `CAMPAIGN_SEARCH_EMBEDDING_MODEL=text-embedding-3-small`
- `CAMPAIGN_SEARCH_EMBEDDING_DIMENSIONS=1536`
- optional: `CAMPAIGN_SEARCH_EMBEDDING_VERSION=custom-version-string`
- optional: `CAMPAIGN_SEARCH_SEMANTIC_MIN_SIMILARITY=0.35`

Notes:

- semantic recall is off by default unless `CAMPAIGN_SEARCH_SEMANTIC_ENABLED` and `OPENAI_API_KEY` are both present
- the Phase 2 migration stores embeddings in `vector(1536)`, so keep runtime dimensions at `1536` unless you also alter the column

### How Product Embeddings Are Generated

- `product_search_documents.embedding_source_text` is rebuilt from title, keywords, taxonomy, and description
- `embedding_source_hash` tracks whether a product’s semantic source text changed
- if the source hash changes, the stored embedding is cleared so the next backfill re-embeds it
- if the source hash is unchanged, normal lexical index rebuilds preserve the existing embedding

### Backfill / Refresh

1. Apply migrations `0084` and `0085`.
2. Rebuild lexical documents if needed.
3. Backfill embeddings:

```bash
npm run campaign-search:embed -- --all
```

Useful variants:

```bash
npm run campaign-search:embed -- --limit 200
npm run campaign-search:embed -- --batch-size 32
npm run campaign-search:embed -- --product-ids <uuid1>,<uuid2>
```

## Rebuild the Index

- UI button: Campaign Search -> `Rebuild index`
- API: `POST /api/campaign-search/reindex`
- SQL functions:
  - `rebuild_product_search_documents()`
  - `search_rebuild_lexicon()`

Run a rebuild after a large catalog import or after materially changing `search_synonyms`.

## Synonym And Taxonomy Tuning

### DB-backed runtime tables

- `search_synonyms`
- `search_taxonomy_aliases`

### Seed manifests

- [synonyms.seed.json](/srv/nordexo-hub/data/campaign-search/synonyms.seed.json)
- [taxonomy-aliases.seed.json](/srv/nordexo-hub/data/campaign-search/taxonomy-aliases.seed.json)

Sync the seed files into Supabase with:

```bash
npm run campaign-search:sync-tuning
```

Use this for repeatable, reviewable tuning instead of ad hoc one-off SQL.

## Offline Evaluation

Saved fixtures live in [data/campaign-search/fixtures](/srv/nordexo-hub/data/campaign-search/fixtures).

Each fixture can define:

- `inputText`
- `expectedSegmentCount`
- `expectedRelevant`
- `knownIrrelevant`
- optional `fingerprintOverride`

Matchers support:

- `productIds`
- `spus`
- `titleContains`
- `taxonomyIncludes`

Run the evaluator:

```bash
npm run campaign-search:evaluate
```

Single fixture:

```bash
npm run campaign-search:evaluate -- --fixture running-belt-compound
```

The evaluator prints:

- top 10 hits
- top 50 hits
- expected-item hit checks
- irrelevant-item checks
- segment counts
- score breakdown samples

## Tuning Reports

Heuristic tuning report:

```bash
npm run campaign-search:tune
```

Single fixture:

```bash
npm run campaign-search:tune -- --fixture phone-protection-multi-segment
```

Optional AI tuning analyst:

```bash
npm run campaign-search:tune -- --fixture running-belt-compound --ai
```

The runtime prompt is not used here. The offline-only analyst prompt lives in [prompt.ts](/srv/nordexo-hub/lib/campaign-search/prompt.ts), and the structured output schema lives in [schema.ts](/srv/nordexo-hub/lib/campaign-search/schema.ts).

The tuning report focuses on:

- missing synonym suggestions
- missing compound split/join variants
- missing taxonomy hints
- negative terms for obvious noise
- score components that may be over- or under-weighted
- segmentation mistakes

## Debugging Bad Results

- Load the latest run in the Campaign Search page and enable `Debug`.
- Inspect:
  - stored fingerprint JSON
  - mapped taxonomy
  - strict/balanced/broad/rescue term lists
  - semantic query text
  - per-result score breakdown JSON
- Open the segment in Product Manager using the built-in button to inspect ranked products with the normal catalog view.
- If semantic recall looks stale, backfill embeddings again.
- If compounds are missing, rebuild the lexicon and review [synonyms.seed.json](/srv/nordexo-hub/data/campaign-search/synonyms.seed.json).
- If taxonomy is drifting, review [taxonomy-aliases.seed.json](/srv/nordexo-hub/data/campaign-search/taxonomy-aliases.seed.json) and the segment’s mapped taxonomy reasoning.

## Run And Test

- Typecheck: `npx tsc --noEmit`
- Test suite: `npm test`
- Pure lexical smoke: `npm run campaign-search:fixture`
- Live fixture evaluator: `npm run campaign-search:evaluate`
- Heuristic tuning report: `npm run campaign-search:tune`
- Embedding backfill: `npm run campaign-search:embed`

## Phase 2 TODO

- Add a proper background job runner for long-running campaign executions and embedding backfills.
- Add richer internal CRUD UI for synonyms and taxonomy aliases.
- Add analytics around fixture history, segment drift, false positives, and semantic rescue hit rates.
- Add optional embedding reranking experiments and future semantic/embedding A/B comparisons without changing the lexical backbone.
