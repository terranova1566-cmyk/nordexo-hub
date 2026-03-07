import { test } from "node:test";
import assert from "node:assert/strict";

import { composeCandidateScore, mergeSegmentCandidateSets } from "@/lib/campaign-search/scoring";
import type { CampaignSearchCandidateRow, CampaignSearchSegmentPlan } from "@/lib/campaign-search/types";

const plan: CampaignSearchSegmentPlan = {
  key: "reading-glasses",
  label: "Läsglasögon",
  confidence: 0.9,
  taxonomyMode: "prefer",
  taxonomyHints: [],
  mappedTaxonomy: {
    taxonomyL1: ["Apparel & Accessories"],
    taxonomyL2: ["Clothing Accessories"],
    confidence: 0.92,
    reasoning: [],
  },
  coreTerms: ["lasglasogon"],
  synonyms: ["las glasogon"],
  joinedVariants: ["lasglasogon"],
  splitVariants: ["las glasogon"],
  mustHave: ["styrka"],
  niceToHave: ["fodral"],
  negativeTerms: ["barn"],
  brandTerms: [],
  strictTerms: ["lasglasogon", "styrka"],
  balancedTerms: ["lasglasogon", "las glasogon", "styrka"],
  broadTerms: ["lasglasogon", "las glasogon", "glasogon"],
  rescueTerms: ["lasglasogon", "las glasogon"],
  strictTsQuery: "lasglasogon & styrka",
  balancedTsQuery: "lasglasogon | (las <-> glasogon) | styrka",
  broadTsQuery: "lasglasogon | (las <-> glasogon) | glasogon",
  strictPhrases: ["las glasogon"],
  balancedPhrases: ["las glasogon"],
  semanticQueryText: "segment: Läsglasögon\nterms: läsglasögon, läs glasögon",
  debug: {},
  sourceSegment: {
    key: "reading-glasses",
    label: "Läsglasögon",
    confidence: 0.9,
    taxonomyHints: [],
    taxonomyMode: "prefer",
    coreTermsSv: ["läsglasögon"],
    synonymsSv: ["läs glasögon"],
    joinedVariants: [],
    splitVariants: [],
    mustHave: ["styrka"],
    niceToHave: ["fodral"],
    negativeTerms: ["barn"],
    brandTerms: [],
    strictQueries: ["läsglasögon styrka"],
    balancedQueries: ["läsglasögon läs glasögon styrka"],
    broadQueries: ["läsglasögon läs glasögon glasögon"],
    notes: "",
  },
};

test("composeCandidateScore favors title and taxonomy evidence over synonym-only hits", () => {
  const exactCandidate: CampaignSearchCandidateRow = {
    product_id: "a",
    strict_rank: 0.72,
    balanced_rank: 0.64,
    broad_rank: 0.32,
    trigram_rescue_score: 0.12,
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
  };

  const synonymOnlyCandidate: CampaignSearchCandidateRow = {
    ...exactCandidate,
    product_id: "b",
    strict_rank: 0,
    balanced_rank: 0.28,
    broad_rank: 0.21,
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
    synonym_hits: 2,
    coverage_count: 0,
    matched_terms: ["las glasogon"],
    matched_taxonomies: [],
    retrieval_sources: ["balanced", "broad"],
  };

  assert.ok(composeCandidateScore(exactCandidate, plan).finalScore > composeCandidateScore(synonymOnlyCandidate, plan).finalScore);
});

test("hybrid merge keeps lexical winner above semantic-only rescue", () => {
  const lexicalCandidate: CampaignSearchCandidateRow = {
    product_id: "lexical-top",
    strict_rank: 0.62,
    balanced_rank: 0.58,
    broad_rank: 0.21,
    trigram_rescue_score: 0.04,
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
  };

  const semanticOnlyCandidate: CampaignSearchCandidateRow = {
    product_id: "semantic-only",
    strict_rank: null,
    balanced_rank: null,
    broad_rank: null,
    trigram_rescue_score: null,
    semantic_similarity: 0.88,
    semantic_rank: 1,
    title_term_hits: 0,
    description_term_hits: 0,
    keyword_term_hits: 0,
    title_phrase_hits: 0,
    title_has_core: false,
    description_has_core: false,
    keyword_has_core: false,
    taxonomy_l1_match: true,
    taxonomy_l2_match: false,
    must_have_hits: 0,
    negative_hits: 0,
    synonym_hits: 0,
    coverage_count: 0,
    matched_terms: [],
    matched_taxonomies: ["Apparel & Accessories"],
    retrieval_sources: ["semantic"],
    evidence_json: {},
  };

  const merged = mergeSegmentCandidateSets({
    lexicalCandidates: [lexicalCandidate],
    semanticCandidates: [semanticOnlyCandidate],
  });

  const scored = merged.map((candidate) => composeCandidateScore(candidate, plan));
  const lexical = scored.find((entry) => entry.productId === "lexical-top");
  const semantic = scored.find((entry) => entry.productId === "semantic-only");

  assert.ok(lexical && semantic);
  assert.ok(lexical.finalScore > semantic.finalScore);
});
