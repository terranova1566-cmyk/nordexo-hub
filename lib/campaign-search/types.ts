export type CampaignFingerprintSourceLanguage = "sv" | "en" | "mixed" | "unknown";

export type CampaignFingerprintSegment = {
  key: string;
  label: string;
  confidence: number;
  taxonomyHints: string[];
  taxonomyMode: "boost" | "prefer" | "require";
  coreTermsSv: string[];
  synonymsSv: string[];
  joinedVariants: string[];
  splitVariants: string[];
  mustHave: string[];
  niceToHave: string[];
  negativeTerms: string[];
  brandTerms: string[];
  strictQueries: string[];
  balancedQueries: string[];
  broadQueries: string[];
  notes: string;
};

export type CampaignFingerprint = {
  sourceLanguage: CampaignFingerprintSourceLanguage;
  campaignSummarySv: string;
  globalNegativeTerms: string[];
  segments: CampaignFingerprintSegment[];
};

export type CatalogTaxonomyOption = {
  taxonomyL1: string | null;
  taxonomyL2: string | null;
  productCount: number;
};

export type TaxonomyMatch = {
  taxonomyL1: string[];
  taxonomyL2: string[];
  confidence: number;
  reasoning: string[];
};

export type SearchSynonymRow = {
  canonical: string;
  alias: string;
  strength: number;
};

export type SearchTaxonomyAliasRow = {
  alias: string;
  taxonomyL1: string | null;
  taxonomyL2: string | null;
  confidence: number;
};

export type CampaignSearchSegmentPlan = {
  key: string;
  label: string;
  confidence: number;
  taxonomyMode: "boost" | "prefer" | "require";
  taxonomyHints: string[];
  mappedTaxonomy: TaxonomyMatch;
  coreTerms: string[];
  synonyms: string[];
  joinedVariants: string[];
  splitVariants: string[];
  mustHave: string[];
  niceToHave: string[];
  negativeTerms: string[];
  brandTerms: string[];
  strictTerms: string[];
  balancedTerms: string[];
  broadTerms: string[];
  rescueTerms: string[];
  strictTsQuery: string;
  balancedTsQuery: string;
  broadTsQuery: string;
  strictPhrases: string[];
  balancedPhrases: string[];
  semanticQueryText: string;
  debug: Record<string, unknown>;
  sourceSegment: CampaignFingerprintSegment;
};

export type CampaignSearchCandidateRow = {
  product_id: string;
  strict_rank: number | null;
  balanced_rank: number | null;
  broad_rank: number | null;
  trigram_rescue_score: number | null;
  semantic_similarity?: number | null;
  semantic_rank?: number | null;
  lexical_rank_position?: number | null;
  semantic_rank_position?: number | null;
  title_term_hits: number | null;
  description_term_hits: number | null;
  keyword_term_hits: number | null;
  title_phrase_hits: number | null;
  title_has_core: boolean | null;
  description_has_core: boolean | null;
  keyword_has_core: boolean | null;
  taxonomy_l1_match: boolean | null;
  taxonomy_l2_match: boolean | null;
  must_have_hits: number | null;
  negative_hits: number | null;
  synonym_hits: number | null;
  coverage_count: number | null;
  matched_terms: string[] | null;
  matched_taxonomies: string[] | null;
  retrieval_sources: string[] | null;
  evidence_json: Record<string, unknown> | null;
};

export type CampaignSearchScoreBreakdown = {
  lexical_rank_strict: number;
  lexical_rank_balanced: number;
  lexical_rank_broad: number;
  trigram_rescue_score: number;
  semantic_similarity_score: number;
  hybrid_rrf_lexical: number;
  hybrid_rrf_semantic: number;
  semantic_overlap_bonus: number;
  title_exact_boost: number;
  title_phrase_boost: number;
  title_description_both_bonus: number;
  keyword_field_boost: number;
  taxonomy_boost: number;
  coverage_boost: number;
  must_have_boost: number;
  synonym_soft_boost: number;
  negative_penalty: number;
  final_score: number;
  evidence: Record<string, unknown>;
};

export type RankedCampaignSearchResult = {
  productId: string;
  finalScore: number;
  matchedTerms: string[];
  matchedTaxonomies: string[];
  retrievalSources: string[];
  scoreBreakdown: CampaignSearchScoreBreakdown;
};

export type CampaignSearchResultRow = RankedCampaignSearchResult & {
  rank: number;
};

export type CampaignSearchRunRecord = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  fingerprintVersion: string;
  fingerprintModel: string | null;
  fingerprintJson: CampaignFingerprint | null;
  debugJson: Record<string, unknown>;
  errorMessage: string | null;
  inputText: string;
};

export type CampaignSearchSegmentRecord = {
  id: string;
  runId: string;
  segmentKey: string;
  label: string;
  orderIndex: number;
  confidence: number;
  taxonomyMode: "boost" | "prefer" | "require";
  taxonomyHints: string[];
  segmentJson: Record<string, unknown>;
  createdAt: string;
};

export type CampaignSearchRunDetail = {
  run: CampaignSearchRunRecord;
  segments: Array<{
    segment: CampaignSearchSegmentRecord;
    results: CampaignSearchResultRow[];
  }>;
};

export type CampaignSearchProductPreview = {
  id: string;
  spu: string | null;
  title: string | null;
  googleTaxonomyL1: string | null;
  googleTaxonomyL2: string | null;
  googleTaxonomyL3: string | null;
  thumbnailUrl: string | null;
};

export type CampaignSearchRunView = {
  run: CampaignSearchRunRecord;
  segments: Array<{
    segment: CampaignSearchSegmentRecord;
    results: Array<
      CampaignSearchResultRow & {
        product: CampaignSearchProductPreview | null;
      }
    >;
  }>;
};

export type CampaignSearchPreview = {
  fingerprint: CampaignFingerprint;
  fingerprintModel: string | null;
  fallbackReason: string | null;
  indexStatus: Record<string, unknown>;
  segmentPlans: CampaignSearchSegmentPlan[];
  segments: Array<{
    plan: CampaignSearchSegmentPlan;
    results: Array<
      CampaignSearchResultRow & {
        product: CampaignSearchProductPreview | null;
      }
    >;
  }>;
  debug: Record<string, unknown>;
};
