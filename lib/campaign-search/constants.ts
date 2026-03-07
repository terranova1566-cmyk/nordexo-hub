export const CAMPAIGN_SEARCH_FINGERPRINT_VERSION = "campaign-search-fingerprint/v1";
export const CAMPAIGN_SEARCH_TUNING_ANALYST_VERSION = "campaign-search-tuning-analyst/v1";

export const CAMPAIGN_SEARCH_MODEL =
  process.env.CAMPAIGN_SEARCH_MODEL ||
  process.env.ADVANCED_SEARCH_MODEL ||
  process.env.OPENAI_EDIT_MODEL ||
  "gpt-5.2";

export const CAMPAIGN_SEARCH_EMBEDDING_MODEL =
  process.env.CAMPAIGN_SEARCH_EMBEDDING_MODEL ||
  process.env.OPENAI_EMBEDDING_MODEL ||
  "text-embedding-3-small";

export const CAMPAIGN_SEARCH_EMBEDDING_DIMENSIONS = Math.max(
  256,
  Math.min(Number(process.env.CAMPAIGN_SEARCH_EMBEDDING_DIMENSIONS || 1536), 1536)
);

export const CAMPAIGN_SEARCH_EMBEDDING_VERSION =
  process.env.CAMPAIGN_SEARCH_EMBEDDING_VERSION ||
  `${CAMPAIGN_SEARCH_EMBEDDING_MODEL}:${CAMPAIGN_SEARCH_EMBEDDING_DIMENSIONS}`;

export const CAMPAIGN_SEARCH_SEMANTIC_ENABLED =
  /^(1|true|yes|on)$/i.test(String(process.env.CAMPAIGN_SEARCH_SEMANTIC_ENABLED || ""));

export const CAMPAIGN_SEARCH_EMBEDDING_BATCH_SIZE = Math.max(
  1,
  Math.min(Number(process.env.CAMPAIGN_SEARCH_EMBEDDING_BATCH_SIZE || 32), 128)
);

export const CAMPAIGN_SEARCH_QUERY_LIMITS = {
  strictLimit: 180,
  balancedLimit: 260,
  broadLimit: 360,
  rescueLimit: 240,
  semanticLimit: 220,
  finalLimit: 500,
} as const;

export const CAMPAIGN_SEARCH_SCORE_WEIGHTS = {
  lexicalRankStrict: 52,
  lexicalRankBalanced: 28,
  lexicalRankBroad: 14,
  trigramRescue: 18,
  semanticSimilarity: 7,
  hybridRrfLexical: 320,
  hybridRrfSemantic: 90,
  hybridOverlapBonus: 2.5,
  hybridRrfK: 50,
  titleExactBoost: 7,
  titlePhraseBoost: 5,
  titleDescriptionBothBonus: 5,
  keywordFieldBoost: 6,
  taxonomyBoostL2: 9,
  taxonomyBoostL1: 5,
  taxonomyOutsidePenalty: 3.5,
  coveragePerHit: 2.25,
  mustHavePerHit: 3.25,
  mustHaveAllBonus: 4.5,
  synonymSoftBoost: 1.25,
  negativePenaltyPerHit: 8.5,
} as const;

export const CAMPAIGN_SEARCH_SEMANTIC_MIN_SIMILARITY = Math.max(
  0,
  Math.min(Number(process.env.CAMPAIGN_SEARCH_SEMANTIC_MIN_SIMILARITY || 0.35), 1)
);

export const CAMPAIGN_SEARCH_STOPWORDS = new Set([
  "and",
  "att",
  "av",
  "de",
  "dem",
  "den",
  "det",
  "eller",
  "en",
  "ett",
  "for",
  "för",
  "fran",
  "från",
  "har",
  "i",
  "med",
  "och",
  "om",
  "pa",
  "på",
  "som",
  "the",
  "till",
  "vi",
  "vår",
  "våra",
]);
