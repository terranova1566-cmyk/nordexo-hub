import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSegmentPlan } from "@/lib/campaign-search/query-builder";
import { rankSegmentCandidates } from "@/lib/campaign-search/scoring";
import type { CampaignFingerprint, CampaignSearchCandidateRow } from "@/lib/campaign-search/types";

test("fixture ranking keeps the strongest läsglasögon product at the top", () => {
  const fingerprint: CampaignFingerprint = {
    sourceLanguage: "mixed",
    campaignSummarySv: "Läsglasögon med styrka",
    globalNegativeTerms: ["barn"],
    segments: [
      {
        key: "reading-glasses",
        label: "Läsglasögon",
        confidence: 0.94,
        taxonomyHints: ["Apparel & Accessories > Clothing Accessories > Sunglasses"],
        taxonomyMode: "prefer",
        coreTermsSv: ["läsglasögon"],
        synonymsSv: ["läs glasögon"],
        joinedVariants: [],
        splitVariants: [],
        mustHave: ["styrka"],
        niceToHave: ["blåljus"],
        negativeTerms: [],
        brandTerms: [],
        strictQueries: ["läsglasögon styrka"],
        balancedQueries: ["läsglasögon läs glasögon styrka"],
        broadQueries: ["läsglasögon läs glasögon glasögon"],
        notes: "",
      },
    ],
  };

  const plan = buildSegmentPlan({
    fingerprint,
    segment: fingerprint.segments[0],
    taxonomyOptions: [
      {
        taxonomyL1: "Apparel & Accessories",
        taxonomyL2: "Clothing Accessories",
        productCount: 150,
      },
    ],
    lexiconTerms: ["las", "glasogon", "lasglasogon", "styrka", "blaljus"],
    synonyms: [{ canonical: "läsglasögon", alias: "läs glasögon", strength: 1 }],
  });

  const candidates: CampaignSearchCandidateRow[] = [
    {
      product_id: "product-best",
      strict_rank: 0.75,
      balanced_rank: 0.66,
      broad_rank: 0.2,
      trigram_rescue_score: 0.08,
      title_term_hits: 2,
      description_term_hits: 1,
      keyword_term_hits: 1,
      title_phrase_hits: 1,
      title_has_core: true,
      description_has_core: true,
      keyword_has_core: true,
      taxonomy_l1_match: true,
      taxonomy_l2_match: true,
      must_have_hits: 1,
      negative_hits: 0,
      synonym_hits: 0,
      coverage_count: 2,
      matched_terms: ["lasglasogon", "styrka"],
      matched_taxonomies: ["Apparel & Accessories > Clothing Accessories"],
      retrieval_sources: ["strict", "balanced"],
      evidence_json: {},
    },
    {
      product_id: "product-mid",
      strict_rank: 0.21,
      balanced_rank: 0.44,
      broad_rank: 0.33,
      trigram_rescue_score: 0.31,
      title_term_hits: 1,
      description_term_hits: 0,
      keyword_term_hits: 0,
      title_phrase_hits: 0,
      title_has_core: true,
      description_has_core: false,
      keyword_has_core: false,
      taxonomy_l1_match: true,
      taxonomy_l2_match: false,
      must_have_hits: 0,
      negative_hits: 0,
      synonym_hits: 1,
      coverage_count: 1,
      matched_terms: ["las glasogon"],
      matched_taxonomies: ["Apparel & Accessories"],
      retrieval_sources: ["balanced", "rescue"],
      evidence_json: {},
    },
    {
      product_id: "product-bad",
      strict_rank: 0,
      balanced_rank: 0.18,
      broad_rank: 0.19,
      trigram_rescue_score: 0.02,
      title_term_hits: 0,
      description_term_hits: 0,
      keyword_term_hits: 0,
      title_phrase_hits: 0,
      title_has_core: false,
      description_has_core: false,
      keyword_has_core: false,
      taxonomy_l1_match: false,
      taxonomy_l2_match: false,
      must_have_hits: 0,
      negative_hits: 0,
      synonym_hits: 1,
      coverage_count: 0,
      matched_terms: ["glasogon"],
      matched_taxonomies: [],
      retrieval_sources: ["broad"],
      evidence_json: {},
    },
  ];

  const ranked = rankSegmentCandidates(candidates, plan);
  assert.deepEqual(
    ranked.map((item) => item.productId),
    ["product-best", "product-mid", "product-bad"]
  );
});
