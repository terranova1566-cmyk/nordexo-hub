import { CAMPAIGN_SEARCH_SCORE_WEIGHTS as W } from "@/lib/campaign-search/constants";
import type {
  CampaignSearchCandidateRow,
  CampaignSearchScoreBreakdown,
  CampaignSearchSegmentPlan,
  RankedCampaignSearchResult,
} from "@/lib/campaign-search/types";

const toNumber = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toNullableNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const roundScore = (value: number) => Math.round(value * 1000) / 1000;

const mergeArrays = (...values: Array<string[] | null | undefined>) =>
  [...new Set(values.flatMap((value) => (Array.isArray(value) ? value : [])).filter(Boolean))];

function mergeEvidence(left: Record<string, unknown> | null | undefined, right: Record<string, unknown> | null | undefined) {
  return {
    ...(left ?? {}),
    ...(right ?? {}),
  };
}

function mergeCandidateMetrics(
  left: CampaignSearchCandidateRow | undefined,
  right: CampaignSearchCandidateRow | undefined
): CampaignSearchCandidateRow {
  const preferred = left ?? right;
  if (!preferred) {
    throw new Error("Cannot merge empty candidate rows.");
  }

  return {
    product_id: preferred.product_id,
    strict_rank: toNullableNumber(left?.strict_rank) ?? toNullableNumber(right?.strict_rank),
    balanced_rank: toNullableNumber(left?.balanced_rank) ?? toNullableNumber(right?.balanced_rank),
    broad_rank: toNullableNumber(left?.broad_rank) ?? toNullableNumber(right?.broad_rank),
    trigram_rescue_score:
      toNullableNumber(left?.trigram_rescue_score) ?? toNullableNumber(right?.trigram_rescue_score),
    semantic_similarity:
      Math.max(toNumber(left?.semantic_similarity), toNumber(right?.semantic_similarity)) || null,
    semantic_rank: toNullableNumber(left?.semantic_rank) ?? toNullableNumber(right?.semantic_rank),
    lexical_rank_position:
      toNullableNumber(left?.lexical_rank_position) ?? toNullableNumber(right?.lexical_rank_position),
    semantic_rank_position:
      toNullableNumber(left?.semantic_rank_position) ?? toNullableNumber(right?.semantic_rank_position),
    title_term_hits: Math.max(toNumber(left?.title_term_hits), toNumber(right?.title_term_hits)),
    description_term_hits: Math.max(
      toNumber(left?.description_term_hits),
      toNumber(right?.description_term_hits)
    ),
    keyword_term_hits: Math.max(toNumber(left?.keyword_term_hits), toNumber(right?.keyword_term_hits)),
    title_phrase_hits: Math.max(toNumber(left?.title_phrase_hits), toNumber(right?.title_phrase_hits)),
    title_has_core: Boolean(left?.title_has_core || right?.title_has_core),
    description_has_core: Boolean(left?.description_has_core || right?.description_has_core),
    keyword_has_core: Boolean(left?.keyword_has_core || right?.keyword_has_core),
    taxonomy_l1_match: Boolean(left?.taxonomy_l1_match || right?.taxonomy_l1_match),
    taxonomy_l2_match: Boolean(left?.taxonomy_l2_match || right?.taxonomy_l2_match),
    must_have_hits: Math.max(toNumber(left?.must_have_hits), toNumber(right?.must_have_hits)),
    negative_hits: Math.max(toNumber(left?.negative_hits), toNumber(right?.negative_hits)),
    synonym_hits: Math.max(toNumber(left?.synonym_hits), toNumber(right?.synonym_hits)),
    coverage_count: Math.max(toNumber(left?.coverage_count), toNumber(right?.coverage_count)),
    matched_terms: mergeArrays(left?.matched_terms, right?.matched_terms),
    matched_taxonomies: mergeArrays(left?.matched_taxonomies, right?.matched_taxonomies),
    retrieval_sources: mergeArrays(left?.retrieval_sources, right?.retrieval_sources),
    evidence_json: mergeEvidence(left?.evidence_json, right?.evidence_json),
  };
}

export function mergeSegmentCandidateSets(input: {
  lexicalCandidates: CampaignSearchCandidateRow[];
  semanticCandidates?: CampaignSearchCandidateRow[];
}) {
  const candidatesById = new Map<string, CampaignSearchCandidateRow>();

  input.lexicalCandidates.forEach((candidate, index) => {
    const withRank: CampaignSearchCandidateRow = {
      ...candidate,
      lexical_rank_position: index + 1,
      semantic_rank_position: candidate.semantic_rank_position ?? null,
    };
    const existing = candidatesById.get(candidate.product_id);
    candidatesById.set(candidate.product_id, existing ? mergeCandidateMetrics(existing, withRank) : withRank);
  });

  (input.semanticCandidates ?? []).forEach((candidate, index) => {
    const withRank: CampaignSearchCandidateRow = {
      ...candidate,
      lexical_rank_position: candidate.lexical_rank_position ?? null,
      semantic_rank_position: toNullableNumber(candidate.semantic_rank) ?? index + 1,
    };
    const existing = candidatesById.get(candidate.product_id);
    candidatesById.set(candidate.product_id, existing ? mergeCandidateMetrics(existing, withRank) : withRank);
  });

  return [...candidatesById.values()];
}

export function composeCandidateScore(
  candidate: CampaignSearchCandidateRow,
  plan: CampaignSearchSegmentPlan
): RankedCampaignSearchResult {
  const lexicalRankStrict = toNumber(candidate.strict_rank) * W.lexicalRankStrict;
  const lexicalRankBalanced = toNumber(candidate.balanced_rank) * W.lexicalRankBalanced;
  const lexicalRankBroad = toNumber(candidate.broad_rank) * W.lexicalRankBroad;
  const trigramRescueScore = toNumber(candidate.trigram_rescue_score) * W.trigramRescue;
  const semanticSimilarityScore = toNumber(candidate.semantic_similarity) * W.semanticSimilarity;
  const hybridRrfLexical = candidate.lexical_rank_position
    ? W.hybridRrfLexical / (W.hybridRrfK + toNumber(candidate.lexical_rank_position))
    : 0;
  const hybridRrfSemantic = candidate.semantic_rank_position
    ? W.hybridRrfSemantic / (W.hybridRrfK + toNumber(candidate.semantic_rank_position))
    : 0;
  const semanticOverlapBonus =
    candidate.lexical_rank_position && candidate.semantic_rank_position ? W.hybridOverlapBonus : 0;
  const titleExactBoost = toNumber(candidate.title_term_hits) * W.titleExactBoost;
  const titlePhraseBoost = toNumber(candidate.title_phrase_hits) * W.titlePhraseBoost;
  const titleDescriptionBothBonus =
    candidate.title_has_core && candidate.description_has_core
      ? W.titleDescriptionBothBonus
      : 0;
  const keywordFieldBoost = toNumber(candidate.keyword_term_hits) * W.keywordFieldBoost;
  const taxonomyBoost =
    candidate.taxonomy_l2_match
      ? W.taxonomyBoostL2
      : candidate.taxonomy_l1_match
        ? W.taxonomyBoostL1
        : plan.mappedTaxonomy.confidence >= 0.85 &&
            (plan.mappedTaxonomy.taxonomyL1.length > 0 || plan.mappedTaxonomy.taxonomyL2.length > 0)
          ? -W.taxonomyOutsidePenalty
          : 0;
  const coverageBoost = toNumber(candidate.coverage_count) * W.coveragePerHit;
  const mustHaveHits = toNumber(candidate.must_have_hits);
  const mustHaveBoost =
    mustHaveHits * W.mustHavePerHit +
    (plan.mustHave.length > 0 && mustHaveHits >= plan.mustHave.length ? W.mustHaveAllBonus : 0);
  const synonymSoftBoost =
    toNumber(candidate.synonym_hits) * W.synonymSoftBoost *
    (toNumber(candidate.title_term_hits) + toNumber(candidate.keyword_term_hits) > 0 ? 0.5 : 1);
  const negativePenalty = toNumber(candidate.negative_hits) * W.negativePenaltyPerHit;

  const finalScore =
    lexicalRankStrict +
    lexicalRankBalanced +
    lexicalRankBroad +
    trigramRescueScore +
    semanticSimilarityScore +
    hybridRrfLexical +
    hybridRrfSemantic +
    semanticOverlapBonus +
    titleExactBoost +
    titlePhraseBoost +
    titleDescriptionBothBonus +
    keywordFieldBoost +
    taxonomyBoost +
    coverageBoost +
    mustHaveBoost +
    synonymSoftBoost -
    negativePenalty;

  const scoreBreakdown: CampaignSearchScoreBreakdown = {
    lexical_rank_strict: roundScore(lexicalRankStrict),
    lexical_rank_balanced: roundScore(lexicalRankBalanced),
    lexical_rank_broad: roundScore(lexicalRankBroad),
    trigram_rescue_score: roundScore(trigramRescueScore),
    semantic_similarity_score: roundScore(semanticSimilarityScore),
    hybrid_rrf_lexical: roundScore(hybridRrfLexical),
    hybrid_rrf_semantic: roundScore(hybridRrfSemantic),
    semantic_overlap_bonus: roundScore(semanticOverlapBonus),
    title_exact_boost: roundScore(titleExactBoost),
    title_phrase_boost: roundScore(titlePhraseBoost),
    title_description_both_bonus: roundScore(titleDescriptionBothBonus),
    keyword_field_boost: roundScore(keywordFieldBoost),
    taxonomy_boost: roundScore(taxonomyBoost),
    coverage_boost: roundScore(coverageBoost),
    must_have_boost: roundScore(mustHaveBoost),
    synonym_soft_boost: roundScore(synonymSoftBoost),
    negative_penalty: roundScore(negativePenalty),
    final_score: roundScore(finalScore),
    evidence: {
      ...candidate.evidence_json,
      coverage_count: toNumber(candidate.coverage_count),
      taxonomy_mode: plan.taxonomyMode,
      taxonomy_confidence: plan.mappedTaxonomy.confidence,
      lexical_rank_position: candidate.lexical_rank_position ?? null,
      semantic_rank_position: candidate.semantic_rank_position ?? null,
      semantic_similarity: toNumber(candidate.semantic_similarity),
    },
  };

  return {
    productId: candidate.product_id,
    finalScore: scoreBreakdown.final_score,
    matchedTerms: Array.isArray(candidate.matched_terms) ? candidate.matched_terms : [],
    matchedTaxonomies: Array.isArray(candidate.matched_taxonomies) ? candidate.matched_taxonomies : [],
    retrievalSources: Array.isArray(candidate.retrieval_sources) ? candidate.retrieval_sources : [],
    scoreBreakdown,
  };
}

export function rankSegmentCandidates(
  candidates: CampaignSearchCandidateRow[],
  plan: CampaignSearchSegmentPlan
) {
  return candidates
    .map((candidate) => composeCandidateScore(candidate, plan))
    .sort((left, right) => right.finalScore - left.finalScore || left.productId.localeCompare(right.productId))
    .map((result, index) => ({
      ...result,
      rank: index + 1,
    }));
}
