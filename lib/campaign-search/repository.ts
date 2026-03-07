import { createAdminSupabase } from "@/lib/supabase/admin";
import { CAMPAIGN_SEARCH_QUERY_LIMITS } from "@/lib/campaign-search/constants";
import { getThumbnailUrl } from "@/lib/product-media";
import { loadImageUrls } from "@/lib/server-images";
import type {
  CampaignSearchCandidateRow,
  CampaignSearchResultRow,
  CampaignSearchRunRecord,
  CampaignSearchRunView,
  CampaignSearchSegmentPlan,
  CampaignSearchSegmentRecord,
  CampaignSearchProductPreview,
  CatalogTaxonomyOption,
  SearchSynonymRow,
  SearchTaxonomyAliasRow,
} from "@/lib/campaign-search/types";

type AdminClient = ReturnType<typeof createAdminSupabase>;

const PAGE_SIZE = 1000;
const ID_FILTER_PAGE_SIZE = 100;

type RunRow = {
  id: string;
  input_text: string;
  status: CampaignSearchRunRecord["status"];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  fingerprint_version: string;
  fingerprint_model: string | null;
  fingerprint_json: CampaignSearchRunRecord["fingerprintJson"];
  debug_json: CampaignSearchRunRecord["debugJson"];
  error_message: string | null;
};

type SegmentRow = {
  id: string;
  run_id: string;
  segment_key: string;
  label: string;
  order_index: number;
  confidence: number;
  taxonomy_mode: CampaignSearchSegmentRecord["taxonomyMode"];
  taxonomy_hints: string[] | null;
  segment_json: Record<string, unknown> | null;
  created_at: string;
};

type ResultRow = {
  product_id: string;
  rank: number;
  final_score: number;
  score_breakdown_json: Record<string, unknown> | null;
  matched_terms: string[] | null;
  matched_taxonomies: string[] | null;
  retrieval_sources: string[] | null;
  segment_id: string;
};

type ProductRow = {
  id: string;
  spu: string | null;
  title: string | null;
  legacy_title_sv?: string | null;
  google_taxonomy_l1: string | null;
  google_taxonomy_l2: string | null;
  google_taxonomy_l3: string | null;
  images?: unknown;
  image_folder: string | null;
};

type TaxonomyAliasRow = {
  alias: string | null;
  taxonomy_l1: string | null;
  taxonomy_l2: string | null;
  confidence: number | null;
};

type EmbeddingQueueRow = {
  product_id: string;
  embedding_source_text: string | null;
  embedding_source_hash: string | null;
};

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => Promise<T[]>
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const page = await loadPage(offset, offset + PAGE_SIZE - 1);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function mapRunRow(row: RunRow): CampaignSearchRunRecord {
  return {
    id: row.id,
    inputText: row.input_text,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    fingerprintVersion: row.fingerprint_version,
    fingerprintModel: row.fingerprint_model,
    fingerprintJson: row.fingerprint_json ?? null,
    debugJson: row.debug_json ?? {},
    errorMessage: row.error_message,
  };
}

function mapSegmentRow(row: SegmentRow): CampaignSearchSegmentRecord {
  return {
    id: row.id,
    runId: row.run_id,
    segmentKey: row.segment_key,
    label: row.label,
    orderIndex: Number(row.order_index ?? 0),
    confidence: Number(row.confidence ?? 0),
    taxonomyMode: row.taxonomy_mode,
    taxonomyHints: Array.isArray(row.taxonomy_hints) ? row.taxonomy_hints : [],
    segmentJson: row.segment_json ?? {},
    createdAt: row.created_at,
  };
}

function mapProductRow(row: ProductRow, thumbnailUrl: string | null): CampaignSearchProductPreview {
  return {
    id: row.id,
    spu: row.spu ?? null,
    title: row.title ?? row.legacy_title_sv ?? null,
    googleTaxonomyL1: row.google_taxonomy_l1 ?? null,
    googleTaxonomyL2: row.google_taxonomy_l2 ?? null,
    googleTaxonomyL3: row.google_taxonomy_l3 ?? null,
    thumbnailUrl,
  };
}

function mapCandidateRow(row: any): CampaignSearchCandidateRow {
  return {
    product_id: String(row?.product_id || ""),
    strict_rank: row?.strict_rank == null ? null : Number(row.strict_rank),
    balanced_rank: row?.balanced_rank == null ? null : Number(row.balanced_rank),
    broad_rank: row?.broad_rank == null ? null : Number(row.broad_rank),
    trigram_rescue_score: row?.trigram_rescue_score == null ? null : Number(row.trigram_rescue_score),
    semantic_similarity: row?.semantic_similarity == null ? null : Number(row.semantic_similarity),
    semantic_rank: row?.semantic_rank == null ? null : Number(row.semantic_rank),
    title_term_hits: row?.title_term_hits == null ? null : Number(row.title_term_hits),
    description_term_hits: row?.description_term_hits == null ? null : Number(row.description_term_hits),
    keyword_term_hits: row?.keyword_term_hits == null ? null : Number(row.keyword_term_hits),
    title_phrase_hits: row?.title_phrase_hits == null ? null : Number(row.title_phrase_hits),
    title_has_core: row?.title_has_core == null ? null : Boolean(row.title_has_core),
    description_has_core: row?.description_has_core == null ? null : Boolean(row.description_has_core),
    keyword_has_core: row?.keyword_has_core == null ? null : Boolean(row.keyword_has_core),
    taxonomy_l1_match: row?.taxonomy_l1_match == null ? null : Boolean(row.taxonomy_l1_match),
    taxonomy_l2_match: row?.taxonomy_l2_match == null ? null : Boolean(row.taxonomy_l2_match),
    must_have_hits: row?.must_have_hits == null ? null : Number(row.must_have_hits),
    negative_hits: row?.negative_hits == null ? null : Number(row.negative_hits),
    synonym_hits: row?.synonym_hits == null ? null : Number(row.synonym_hits),
    coverage_count: row?.coverage_count == null ? null : Number(row.coverage_count),
    matched_terms: Array.isArray(row?.matched_terms) ? row.matched_terms : [],
    matched_taxonomies: Array.isArray(row?.matched_taxonomies) ? row.matched_taxonomies : [],
    retrieval_sources: Array.isArray(row?.retrieval_sources) ? row.retrieval_sources : [],
    evidence_json: row?.evidence_json ?? {},
  };
}

export async function ensureCampaignSearchIndexReady(adminClient: AdminClient) {
  const [
    { count: productCount, error: productCountError },
    { count: docCount, error: docCountError },
    { count: lexiconCount, error: lexiconCountError },
    { count: embeddingCount, error: embeddingCountError },
  ] =
    await Promise.all([
      adminClient.from("catalog_products").select("id", { count: "exact", head: true }).neq("is_blocked", true),
      adminClient.from("product_search_documents").select("product_id", { count: "exact", head: true }),
      adminClient.from("search_lexicon").select("term", { count: "exact", head: true }),
      adminClient
        .from("product_search_documents")
        .select("product_id", { count: "exact", head: true })
        .not("embedding", "is", null),
    ]);

  if (productCountError) throw new Error(productCountError.message);
  if (docCountError) throw new Error(docCountError.message);
  if (lexiconCountError) throw new Error(lexiconCountError.message);
  if (embeddingCountError) throw new Error(embeddingCountError.message);

  let documentsRebuilt = 0;
  let lexiconRebuilt = 0;
  const activeProductCount = Number(productCount ?? 0);
  const activeDocCount = Number(docCount ?? 0);
  const activeLexiconCount = Number(lexiconCount ?? 0);

  if (activeDocCount === 0 || (activeProductCount > 0 && activeDocCount < activeProductCount * 0.8)) {
    const { data, error } = await adminClient.rpc("rebuild_product_search_documents", {
      product_ids: null,
    });
    if (error) throw new Error(error.message);
    documentsRebuilt = Number(data ?? 0);
  }

  if (activeLexiconCount === 0 || documentsRebuilt > 0) {
    const { data, error } = await adminClient.rpc("search_rebuild_lexicon");
    if (error) throw new Error(error.message);
    lexiconRebuilt = Number(data ?? 0);
  }

  return {
    productCount: activeProductCount,
    documentCount: documentsRebuilt > 0 ? documentsRebuilt : activeDocCount,
    lexiconCount: lexiconRebuilt > 0 ? lexiconRebuilt : activeLexiconCount,
    embeddingCount: Number(embeddingCount ?? 0),
    documentsRebuilt,
    lexiconRebuilt,
  };
}

export async function loadCampaignSearchTaxonomyOptions(adminClient: AdminClient) {
  const rows = await fetchAllRows<CatalogTaxonomyOption>(async (from, to) => {
    const { data, error } = await adminClient
      .from("product_search_taxonomy_options")
      .select("taxonomy_l1, taxonomy_l2, product_count")
      .order("taxonomy_l1", { ascending: true })
      .order("taxonomy_l2", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      taxonomyL1: row.taxonomy_l1 ?? null,
      taxonomyL2: row.taxonomy_l2 ?? null,
      productCount: Number(row.product_count ?? 0),
    }));
  });

  return rows;
}

export async function loadCampaignSearchSynonyms(adminClient: AdminClient) {
  const rows = await fetchAllRows<SearchSynonymRow>(async (from, to) => {
    const { data, error } = await adminClient
      .from("search_synonyms")
      .select("canonical, alias, strength")
      .eq("active", true)
      .order("canonical", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      canonical: String(row.canonical ?? ""),
      alias: String(row.alias ?? ""),
      strength: Number(row.strength ?? 1),
    }));
  });

  return rows;
}

export async function loadCampaignSearchTaxonomyAliases(adminClient: AdminClient) {
  const rows = await fetchAllRows<SearchTaxonomyAliasRow>(async (from, to) => {
    const { data, error } = await adminClient
      .from("search_taxonomy_aliases")
      .select("alias,taxonomy_l1,taxonomy_l2,confidence")
      .eq("active", true)
      .order("alias", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const typed = row as TaxonomyAliasRow;
      return {
        alias: String(typed.alias ?? ""),
        taxonomyL1: typed.taxonomy_l1 ?? null,
        taxonomyL2: typed.taxonomy_l2 ?? null,
        confidence: Number(typed.confidence ?? 0.9),
      };
    });
  });

  return rows.filter((row) => row.alias);
}

export async function loadCampaignSearchLexicon(adminClient: AdminClient) {
  const rows = await fetchAllRows<string>(async (from, to) => {
    const { data, error } = await adminClient
      .from("search_lexicon")
      .select("term")
      .order("frequency", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => String(row.term ?? "")).filter(Boolean);
  });

  return rows;
}

export async function createCampaignSearchRun(adminClient: AdminClient, input: {
  createdBy: string;
  inputText: string;
  fingerprintVersion: string;
  fingerprintModel: string | null;
  debugJson?: Record<string, unknown>;
}) {
  const { data, error } = await adminClient
    .from("campaign_search_runs")
    .insert({
      created_by: input.createdBy,
      input_text: input.inputText,
      status: "running",
      started_at: new Date().toISOString(),
      fingerprint_version: input.fingerprintVersion,
      fingerprint_model: input.fingerprintModel,
      debug_json: input.debugJson ?? {},
    })
    .select(
      "id,input_text,status,created_at,started_at,finished_at,fingerprint_version,fingerprint_model,fingerprint_json,debug_json,error_message"
    )
    .single();

  if (error) throw new Error(error.message);
  return mapRunRow(data as RunRow);
}

export async function updateCampaignSearchRun(adminClient: AdminClient, runId: string, updates: {
  status?: CampaignSearchRunRecord["status"];
  fingerprintModel?: string | null;
  fingerprintJson?: unknown;
  debugJson?: Record<string, unknown>;
  errorMessage?: string | null;
  finishedAt?: string | null;
}) {
  const payload: Record<string, unknown> = {};
  if (updates.status) payload.status = updates.status;
  if (Object.prototype.hasOwnProperty.call(updates, "fingerprintModel")) {
    payload.fingerprint_model = updates.fingerprintModel ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "fingerprintJson")) {
    payload.fingerprint_json = updates.fingerprintJson ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "debugJson")) {
    payload.debug_json = updates.debugJson ?? {};
  }
  if (Object.prototype.hasOwnProperty.call(updates, "errorMessage")) {
    payload.error_message = updates.errorMessage ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "finishedAt")) {
    payload.finished_at = updates.finishedAt ?? null;
  }

  const { error } = await adminClient.from("campaign_search_runs").update(payload).eq("id", runId);
  if (error) throw new Error(error.message);
}

export async function createCampaignSearchSegment(adminClient: AdminClient, runId: string, plan: CampaignSearchSegmentPlan, orderIndex: number) {
  const { data, error } = await adminClient
    .from("campaign_search_segments")
    .insert({
      run_id: runId,
      segment_key: plan.key,
      label: plan.label,
      order_index: orderIndex,
      confidence: plan.confidence,
      taxonomy_mode: plan.taxonomyMode,
      taxonomy_hints: plan.taxonomyHints,
      segment_json: {
        coreTerms: plan.coreTerms,
        synonyms: plan.synonyms,
        joinedVariants: plan.joinedVariants,
        splitVariants: plan.splitVariants,
        mustHave: plan.mustHave,
        niceToHave: plan.niceToHave,
        negativeTerms: plan.negativeTerms,
        brandTerms: plan.brandTerms,
        strictTerms: plan.strictTerms,
        balancedTerms: plan.balancedTerms,
        broadTerms: plan.broadTerms,
        rescueTerms: plan.rescueTerms,
        strictTsQuery: plan.strictTsQuery,
        balancedTsQuery: plan.balancedTsQuery,
        broadTsQuery: plan.broadTsQuery,
        strictPhrases: plan.strictPhrases,
        balancedPhrases: plan.balancedPhrases,
        semanticQueryText: plan.semanticQueryText,
        mappedTaxonomy: plan.mappedTaxonomy,
        debug: plan.debug,
      },
    })
    .select(
      "id,run_id,segment_key,label,order_index,confidence,taxonomy_mode,taxonomy_hints,segment_json,created_at"
    )
    .single();

  if (error) throw new Error(error.message);
  return mapSegmentRow(data as SegmentRow);
}

export async function fetchCampaignSearchSegmentCandidates(
  adminClient: AdminClient,
  plan: CampaignSearchSegmentPlan
) {
  const { data, error } = await adminClient.rpc("campaign_search_segment_candidates", {
    input: {
      strict_tsquery: plan.strictTsQuery,
      balanced_tsquery: plan.balancedTsQuery,
      broad_tsquery: plan.broadTsQuery,
      strict_phrases: plan.strictPhrases,
      balanced_phrases: plan.balancedPhrases,
      core_terms: plan.coreTerms,
      synonyms: plan.synonyms,
      must_have: plan.mustHave,
      negative_terms: plan.negativeTerms,
      rescue_terms: plan.rescueTerms,
      taxonomy_l1: plan.mappedTaxonomy.taxonomyL1,
      taxonomy_l2: plan.mappedTaxonomy.taxonomyL2,
      taxonomy_mode: plan.taxonomyMode,
      taxonomy_confidence: plan.mappedTaxonomy.confidence,
      strict_limit: CAMPAIGN_SEARCH_QUERY_LIMITS.strictLimit,
      balanced_limit: CAMPAIGN_SEARCH_QUERY_LIMITS.balancedLimit,
      broad_limit: CAMPAIGN_SEARCH_QUERY_LIMITS.broadLimit,
      rescue_limit: CAMPAIGN_SEARCH_QUERY_LIMITS.rescueLimit,
      final_limit: CAMPAIGN_SEARCH_QUERY_LIMITS.finalLimit,
    },
  });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCandidateRow);
}

export async function fetchCampaignSearchSemanticCandidates(
  adminClient: AdminClient,
  input: {
    plan: CampaignSearchSegmentPlan;
    queryEmbedding: string;
    semanticLimit?: number;
    minSimilarity?: number;
  }
) {
  const { data, error } = await adminClient.rpc("campaign_search_semantic_candidates", {
    input: {
      query_embedding: input.queryEmbedding,
      strict_phrases: input.plan.strictPhrases,
      balanced_phrases: input.plan.balancedPhrases,
      core_terms: input.plan.coreTerms,
      synonyms: input.plan.synonyms,
      must_have: input.plan.mustHave,
      negative_terms: input.plan.negativeTerms,
      taxonomy_l1: input.plan.mappedTaxonomy.taxonomyL1,
      taxonomy_l2: input.plan.mappedTaxonomy.taxonomyL2,
      taxonomy_mode: input.plan.taxonomyMode,
      taxonomy_confidence: input.plan.mappedTaxonomy.confidence,
      semantic_limit: input.semanticLimit ?? CAMPAIGN_SEARCH_QUERY_LIMITS.semanticLimit,
      min_similarity: input.minSimilarity ?? null,
    },
  });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCandidateRow);
}

export async function applyCampaignSearchEmbeddings(adminClient: AdminClient, input: {
  model: string;
  version: string;
  rows: Array<{
    productId: string;
    embeddingText: string;
    sourceHash: string;
  }>;
}) {
  const { data, error } = await adminClient.rpc("campaign_search_apply_embeddings", {
    in_model: input.model,
    in_version: input.version,
    in_rows: input.rows.map((row) => ({
      product_id: row.productId,
      embedding_text: row.embeddingText,
      source_hash: row.sourceHash,
    })),
  });

  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function loadCampaignSearchEmbeddingQueue(adminClient: AdminClient, input: {
  model: string;
  version: string;
  limit: number;
  productIds?: string[];
}) {
  const limit = Math.max(1, Math.min(input.limit, 500));
  const rows = await fetchAllRows<any>(async (from, to) => {
    let query = adminClient
      .from("product_search_documents")
      .select("product_id,embedding_source_text,embedding_source_hash,embedding_model,embedding_version")
      .neq("embedding_source_text", "")
      .order("embedding_updated_at", { ascending: true, nullsFirst: true })
      .range(from, to);

    if (input.productIds && input.productIds.length > 0) {
      query = query.in("product_id", input.productIds);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

  return rows
    .filter((row) => {
      const model = String(row?.embedding_model ?? "");
      const version = String(row?.embedding_version ?? "");
      return model !== input.model || version !== input.version;
    })
    .slice(0, limit)
    .map((row) => {
      const typed = row as EmbeddingQueueRow;
      return {
        productId: typed.product_id,
        sourceText: String(typed.embedding_source_text ?? ""),
        sourceHash: String(typed.embedding_source_hash ?? ""),
      };
    });
}

export async function replaceCampaignSearchSegmentResults(
  adminClient: AdminClient,
  runId: string,
  segmentId: string,
  results: CampaignSearchResultRow[]
) {
  const { data, error } = await adminClient.rpc("campaign_search_replace_segment_results", {
    in_run_id: runId,
    in_segment_id: segmentId,
    in_rows: results.map((result) => ({
      product_id: result.productId,
      final_score: result.finalScore,
      score_breakdown_json: result.scoreBreakdown,
      matched_terms: result.matchedTerms,
      matched_taxonomies: result.matchedTaxonomies,
      retrieval_sources: result.retrievalSources,
    })),
  });

  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function loadCampaignSearchProductPreviews(
  adminClient: AdminClient,
  productIds: string[]
) {
  const dedupedIds = dedupeProductIds(productIds);
  const productsById = new Map<string, CampaignSearchProductPreview>();
  if (dedupedIds.length === 0) {
    return productsById;
  }

  for (let offset = 0; offset < dedupedIds.length; offset += ID_FILTER_PAGE_SIZE) {
    const chunk = dedupedIds.slice(offset, offset + ID_FILTER_PAGE_SIZE);
    const { data, error } = await adminClient
      .from("catalog_products")
      .select("id,spu,title,legacy_title_sv,google_taxonomy_l1,google_taxonomy_l2,google_taxonomy_l3,images,image_folder")
      .in("id", chunk);

    if (error) throw new Error(error.message);
    const products = (data ?? []) as ProductRow[];
    const previews = await Promise.all(
      products.map(async (product) => {
        const thumbUrls = await loadImageUrls(product.image_folder, { size: "thumb" });
        const thumbnailUrl = thumbUrls[0] ?? getThumbnailUrl({ images: product.images }, null);
        return mapProductRow(product, thumbnailUrl);
      })
    );

    previews.forEach((product) => {
      productsById.set(product.id, product);
    });
  }

  return productsById;
}

export async function loadCampaignSearchRunView(adminClient: AdminClient, runId: string): Promise<CampaignSearchRunView | null> {
  const { data: runData, error: runError } = await adminClient
    .from("campaign_search_runs")
    .select(
      "id,input_text,status,created_at,started_at,finished_at,fingerprint_version,fingerprint_model,fingerprint_json,debug_json,error_message"
    )
    .eq("id", runId)
    .maybeSingle();

  if (runError) throw new Error(runError.message);
  if (!runData) return null;

  const { data: segmentsData, error: segmentsError } = await adminClient
    .from("campaign_search_segments")
    .select(
      "id,run_id,segment_key,label,order_index,confidence,taxonomy_mode,taxonomy_hints,segment_json,created_at"
    )
    .eq("run_id", runId)
    .order("order_index", { ascending: true });

  if (segmentsError) throw new Error(segmentsError.message);
  const segments = (segmentsData ?? []).map((row) => mapSegmentRow(row as SegmentRow));
  if (segments.length === 0) {
    return { run: mapRunRow(runData as RunRow), segments: [] };
  }

  const segmentIds = segments.map((segment) => segment.id);
  const { data: resultsData, error: resultsError } = await adminClient
    .from("campaign_search_results")
    .select(
      "segment_id,product_id,rank,final_score,score_breakdown_json,matched_terms,matched_taxonomies,retrieval_sources"
    )
    .in("segment_id", segmentIds)
    .order("rank", { ascending: true });

  if (resultsError) throw new Error(resultsError.message);
  const results = (resultsData ?? []) as ResultRow[];
  const productIds = dedupeProductIds(results.map((row) => row.product_id));

  const productsById = await loadCampaignSearchProductPreviews(adminClient, productIds);

  const resultsBySegmentId = new Map<
    string,
    Array<
      CampaignSearchResultRow & {
        product: CampaignSearchProductPreview | null;
      }
    >
  >();

  results.forEach((row) => {
    const items = resultsBySegmentId.get(row.segment_id) ?? [];
    items.push({
      productId: row.product_id,
      rank: Number(row.rank ?? 0),
      finalScore: Number(row.final_score ?? 0),
      matchedTerms: Array.isArray(row.matched_terms) ? row.matched_terms : [],
      matchedTaxonomies: Array.isArray(row.matched_taxonomies) ? row.matched_taxonomies : [],
      retrievalSources: Array.isArray(row.retrieval_sources) ? row.retrieval_sources : [],
      scoreBreakdown: (row.score_breakdown_json as any) ?? {
        final_score: Number(row.final_score ?? 0),
      },
      product: productsById.get(row.product_id) ?? null,
    });
    resultsBySegmentId.set(row.segment_id, items);
  });

  return {
    run: mapRunRow(runData as RunRow),
    segments: segments.map((segment) => ({
      segment,
      results: resultsBySegmentId.get(segment.id) ?? [],
    })),
  };
}

function dedupeProductIds(productIds: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  productIds.forEach((productId) => {
    const trimmed = String(productId || "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    output.push(trimmed);
  });
  return output;
}
