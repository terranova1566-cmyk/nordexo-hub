import { CAMPAIGN_SEARCH_QUERY_LIMITS } from "@/lib/campaign-search/constants";
import { buildCompoundSupportSet, generateJoinedCompoundVariants, generateSplitCompoundVariants } from "@/lib/campaign-search/compound";
import { buildAndTsQuery, buildOrTsQuery, dedupeStrings, normalizeSearchText, normalizeTermList, splitLooseQueryText } from "@/lib/campaign-search/normalization";
import { buildSegmentSemanticQueryText } from "@/lib/campaign-search/semantic";
import { mapTaxonomyHints } from "@/lib/campaign-search/taxonomy";
import type {
  CampaignFingerprint,
  CampaignFingerprintSegment,
  CampaignSearchSegmentPlan,
  CatalogTaxonomyOption,
  SearchSynonymRow,
  SearchTaxonomyAliasRow,
} from "@/lib/campaign-search/types";

function expandCatalogSynonyms(inputTerms: string[], synonyms: SearchSynonymRow[]) {
  const related: string[] = [];
  const normalizedInput = new Set(inputTerms.map((term) => normalizeSearchText(term)));
  synonyms.forEach((row) => {
    const canonical = normalizeSearchText(row.canonical);
    const alias = normalizeSearchText(row.alias);
    if (!canonical || !alias) return;
    if (normalizedInput.has(canonical)) related.push(alias);
    if (normalizedInput.has(alias)) related.push(canonical);
  });
  return dedupeStrings(related, 12);
}

function buildSegmentStrictTerms(segment: CampaignFingerprintSegment, coreTerms: string[], mustHave: string[]) {
  const strictSeed = dedupeStrings(
    [
      ...coreTerms,
      ...mustHave.slice(0, 2),
      ...segment.strictQueries.map((query) => normalizeSearchText(query)),
      ...segment.brandTerms.map((term) => normalizeSearchText(term)),
    ].filter(Boolean)
  );

  return strictSeed.slice(0, 8);
}

function collectLooseTerms(segment: CampaignFingerprintSegment) {
  return dedupeStrings(
    [
      ...segment.strictQueries.flatMap(splitLooseQueryText),
      ...segment.balancedQueries.flatMap(splitLooseQueryText),
      ...segment.broadQueries.flatMap(splitLooseQueryText),
    ],
    16
  );
}

export function buildSegmentPlan(args: {
  fingerprint: CampaignFingerprint;
  segment: CampaignFingerprintSegment;
  taxonomyOptions: CatalogTaxonomyOption[];
  taxonomyAliases?: SearchTaxonomyAliasRow[];
  lexiconTerms: string[];
  synonyms: SearchSynonymRow[];
}): CampaignSearchSegmentPlan {
  const lexicon = new Set(args.lexiconTerms.map((term) => normalizeSearchText(term)).filter(Boolean));
  const baseSupport = buildCompoundSupportSet([
    ...args.lexiconTerms,
    ...args.synonyms.flatMap((row) => [row.alias, row.canonical]),
    ...args.segment.joinedVariants,
    ...args.segment.splitVariants,
  ]);

  const coreTerms = normalizeTermList(args.segment.coreTermsSv, 10);
  const mustHave = normalizeTermList(args.segment.mustHave, 8);
  const niceToHave = normalizeTermList(args.segment.niceToHave, 10);
  const negativeTerms = normalizeTermList(
    [...args.fingerprint.globalNegativeTerms, ...args.segment.negativeTerms],
    12
  );
  const brandTerms = normalizeTermList(args.segment.brandTerms, 8);
  const catalogSynonyms = expandCatalogSynonyms(
    [...coreTerms, ...args.segment.synonymsSv],
    args.synonyms
  );
  const synonyms = dedupeStrings(
    normalizeTermList([...args.segment.synonymsSv, ...catalogSynonyms], 12),
    12
  );
  const looseTerms = collectLooseTerms(args.segment);
  const joinedVariants = dedupeStrings(
    [
      ...normalizeTermList(args.segment.joinedVariants, 8),
      ...generateJoinedCompoundVariants(
        [
          ...args.segment.coreTermsSv,
          ...args.segment.synonymsSv,
          ...args.segment.strictQueries,
          ...args.segment.balancedQueries,
        ],
        lexicon,
        baseSupport,
        8
      ),
    ],
    8
  );
  const splitVariants = dedupeStrings(
    [
      ...normalizeTermList(args.segment.splitVariants, 8),
      ...generateSplitCompoundVariants(
        [
          ...args.segment.coreTermsSv,
          ...args.segment.synonymsSv,
          ...args.segment.joinedVariants,
          ...joinedVariants,
        ],
        lexicon,
        baseSupport,
        8
      ),
    ],
    8
  );

  const strictTerms = buildSegmentStrictTerms(args.segment, coreTerms, mustHave);
  const balancedTerms = dedupeStrings(
    [...coreTerms, ...synonyms, ...mustHave, ...niceToHave, ...brandTerms, ...joinedVariants, ...splitVariants],
    14
  );
  const broadTerms = dedupeStrings(
    [...balancedTerms, ...looseTerms],
    18
  );
  const rescueTerms = dedupeStrings(
    [...joinedVariants, ...splitVariants, ...coreTerms, ...synonyms],
    16
  );
  const strictPhrases = dedupeStrings(
    [...args.segment.strictQueries, ...splitVariants].map((value) => normalizeSearchText(value)).filter((value) => value.includes(" ")),
    10
  );
  const balancedPhrases = dedupeStrings(
    [...args.segment.balancedQueries, ...args.segment.broadQueries]
      .map((value) => normalizeSearchText(value))
      .filter((value) => value.includes(" ")),
    12
  );

  const mappedTaxonomy = mapTaxonomyHints(
    args.segment.taxonomyHints,
    args.taxonomyOptions,
    args.taxonomyAliases ?? []
  );
  const taxonomyMode =
    args.segment.taxonomyMode === "require" &&
    mappedTaxonomy.taxonomyL1.length === 0 &&
    mappedTaxonomy.taxonomyL2.length === 0
      ? "prefer"
      : args.segment.taxonomyMode;

  const plan: CampaignSearchSegmentPlan = {
    key: args.segment.key,
    label: args.segment.label,
    confidence: args.segment.confidence,
    taxonomyMode,
    taxonomyHints: args.segment.taxonomyHints,
    mappedTaxonomy,
    coreTerms,
    synonyms,
    joinedVariants,
    splitVariants,
    mustHave,
    niceToHave,
    negativeTerms,
    brandTerms,
    strictTerms,
    balancedTerms,
    broadTerms,
    rescueTerms,
    strictTsQuery: buildAndTsQuery(strictTerms),
    balancedTsQuery: buildOrTsQuery(balancedTerms),
    broadTsQuery: buildOrTsQuery(broadTerms),
    strictPhrases,
    balancedPhrases,
    semanticQueryText: "",
    debug: {
      looseTerms,
      queryLimits: CAMPAIGN_SEARCH_QUERY_LIMITS,
      mappedTaxonomyReasoning: mappedTaxonomy.reasoning,
    },
    sourceSegment: args.segment,
  };

  return {
    ...plan,
    semanticQueryText: buildSegmentSemanticQueryText(plan),
  };
}
