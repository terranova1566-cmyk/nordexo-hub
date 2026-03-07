import fs from "node:fs/promises";
import path from "node:path";

import { tokenizeSearchText } from "@/lib/campaign-search/normalization";
import type { CampaignSearchTuningAnalystOutput } from "@/lib/campaign-search/schema";
import type { CampaignFingerprint, CampaignSearchPreview } from "@/lib/campaign-search/types";

export type CampaignSearchFixtureMatcher = {
  label: string;
  segmentKey?: string;
  productIds?: string[];
  spus?: string[];
  titleContains?: string[];
  taxonomyIncludes?: string[];
  shouldAppearInTop?: number;
  shouldNotAppearInTop?: number;
};

export type CampaignSearchFixture = {
  key: string;
  description: string;
  inputText: string;
  expectedSegmentCount?: number;
  fingerprintOverride?: CampaignFingerprint;
  expectedRelevant: CampaignSearchFixtureMatcher[];
  knownIrrelevant: CampaignSearchFixtureMatcher[];
};

export type CampaignSearchFixtureMatch = {
  label: string;
  matched: boolean;
  segmentKey: string | null;
  rank: number | null;
  title: string | null;
  spu: string | null;
  retrievalSources: string[];
  finalScore: number | null;
};

export type CampaignSearchFixtureEvaluation = {
  fixture: CampaignSearchFixture;
  preview: CampaignSearchPreview;
  top10: Array<{
    segmentKey: string;
    segmentLabel: string;
    rank: number;
    title: string | null;
    spu: string | null;
    finalScore: number;
    retrievalSources: string[];
  }>;
  top50: Array<{
    segmentKey: string;
    segmentLabel: string;
    rank: number;
    title: string | null;
    spu: string | null;
    finalScore: number;
    retrievalSources: string[];
  }>;
  expectedMatches: CampaignSearchFixtureMatch[];
  irrelevantMatches: CampaignSearchFixtureMatch[];
  tuning: CampaignSearchTuningAnalystOutput;
};

const FIXTURE_DIR = "/srv/nordexo-hub/data/campaign-search/fixtures";

function emptyTuningReport(): CampaignSearchTuningAnalystOutput {
  return {
    synonymSuggestions: [],
    compoundSuggestions: [],
    taxonomySuggestions: [],
    negativeTerms: [],
    scoreAdjustments: [],
    segmentationAdvice: [],
    notes: [],
  };
}

function flattenPreviewResults(preview: CampaignSearchPreview) {
  return preview.segments.flatMap((entry) =>
    entry.results.map((result) => ({
      segmentKey: entry.plan.key,
      segmentLabel: entry.plan.label,
      segmentPlan: entry.plan,
      result,
    }))
  );
}

function findMatcherHit(
  preview: CampaignSearchPreview,
  matcher: CampaignSearchFixtureMatcher
): CampaignSearchFixtureMatch {
  const candidatePool = flattenPreviewResults(preview).filter((entry) =>
    matcher.segmentKey ? entry.segmentKey === matcher.segmentKey : true
  );

  const titleContains = (matcher.titleContains ?? []).map((value) => value.toLowerCase());
  const taxonomyContains = (matcher.taxonomyIncludes ?? []).map((value) => value.toLowerCase());
  const productIds = new Set((matcher.productIds ?? []).map((value) => value.trim()).filter(Boolean));
  const spus = new Set((matcher.spus ?? []).map((value) => value.trim()).filter(Boolean));

  const match = candidatePool.find(({ result }) => {
    const title = String(result.product?.title ?? "").toLowerCase();
    const taxonomy = [
      result.product?.googleTaxonomyL1,
      result.product?.googleTaxonomyL2,
      result.product?.googleTaxonomyL3,
    ]
      .filter(Boolean)
      .join(" > ")
      .toLowerCase();

    if (productIds.size > 0 && productIds.has(result.productId)) return true;
    if (spus.size > 0 && result.product?.spu && spus.has(result.product.spu)) return true;
    if (titleContains.length > 0 && titleContains.every((needle) => title.includes(needle))) return true;
    if (taxonomyContains.length > 0 && taxonomyContains.every((needle) => taxonomy.includes(needle))) return true;
    return false;
  });

  if (!match) {
    return {
      label: matcher.label,
      matched: false,
      segmentKey: null,
      rank: null,
      title: null,
      spu: null,
      retrievalSources: [],
      finalScore: null,
    };
  }

  return {
    label: matcher.label,
    matched: true,
    segmentKey: match.segmentKey,
    rank: match.result.rank,
    title: match.result.product?.title ?? null,
    spu: match.result.product?.spu ?? null,
    retrievalSources: match.result.retrievalSources,
    finalScore: match.result.finalScore,
  };
}

function buildTuningReport(evaluation: Omit<CampaignSearchFixtureEvaluation, "tuning">) {
  const tuning = emptyTuningReport();
  const topResults = flattenPreviewResults(evaluation.preview).slice(0, 20);

  evaluation.expectedMatches.forEach((match) => {
    if (!match.matched) return;
    const segment = evaluation.preview.segments.find((entry) => entry.plan.key === match.segmentKey);
    if (!segment) return;

    if (match.retrievalSources.includes("semantic") && !match.retrievalSources.some((source) => source !== "semantic")) {
      const titleTokens = tokenizeSearchText(match.title ?? "").filter(
        (token) =>
          token.length >= 4 &&
          !segment.plan.coreTerms.includes(token) &&
          !segment.plan.synonyms.includes(token)
      );

      titleTokens.slice(0, 2).forEach((token) => {
        tuning.synonymSuggestions.push({
          segmentKey: segment.plan.key,
          canonical: segment.plan.coreTerms[0] ?? token,
          alias: token,
          reason: `${match.label} surfaced via semantic-only retrieval, suggesting a lexical synonym gap.`,
          confidence: "medium",
        });
      });
    }

    if ((match.rank ?? 999) > 15 && segment.plan.mappedTaxonomy.taxonomyL2.length === 0) {
      const taxonomy = [
        segment.results.find((entry) => entry.product?.spu === match.spu)?.product?.googleTaxonomyL1,
        segment.results.find((entry) => entry.product?.spu === match.spu)?.product?.googleTaxonomyL2,
      ]
        .filter(Boolean)
        .join(" > ");

      if (taxonomy) {
        tuning.taxonomySuggestions.push({
          segmentKey: segment.plan.key,
          taxonomyHint: taxonomy,
          reason: `${match.label} ranked low without a mapped L2 taxonomy hint.`,
          confidence: "medium",
        });
      }
    }
  });

  evaluation.irrelevantMatches.forEach((match) => {
    if (!match.matched || (match.rank ?? 999) > (evaluation.fixture.knownIrrelevant.find((entry) => entry.label === match.label)?.shouldNotAppearInTop ?? 20)) {
      return;
    }

    const segment = evaluation.preview.segments.find((entry) => entry.plan.key === match.segmentKey);
    if (!segment) return;

    const titleTokens = tokenizeSearchText(match.title ?? "").filter(
      (token) =>
        token.length >= 4 &&
        !segment.plan.coreTerms.includes(token) &&
        !segment.plan.synonyms.includes(token) &&
        !segment.plan.negativeTerms.includes(token)
    );

    const candidateNegative = titleTokens[0];
    if (candidateNegative) {
      tuning.negativeTerms.push({
        segmentKey: segment.plan.key,
        term: candidateNegative,
        reason: `${match.label} appears too high and shares a likely noise term not currently excluded.`,
        confidence: "medium",
      });
    }
  });

  const relevantSemanticOnly = evaluation.expectedMatches.some(
    (match) => match.matched && (match.rank ?? 999) > 10 && match.retrievalSources.includes("semantic")
  );
  if (relevantSemanticOnly) {
    tuning.scoreAdjustments.push({
      component: "hybrid_rrf_semantic",
      direction: "increase",
      reason: "Relevant items are being rescued semantically but still rank low.",
      confidence: "medium",
    });
  }

  const noisyTaxonomyHeavy = topResults.some(({ result }) => {
    const breakdown = result.scoreBreakdown as Record<string, unknown>;
    return Number(breakdown.taxonomy_boost ?? 0) > 0 && Number(breakdown.title_exact_boost ?? 0) === 0;
  });
  if (noisyTaxonomyHeavy) {
    tuning.scoreAdjustments.push({
      component: "taxonomy_boost",
      direction: "decrease",
      reason: "Top results show taxonomy wins without strong title evidence.",
      confidence: "speculative",
    });
  }

  if (
    typeof evaluation.fixture.expectedSegmentCount === "number" &&
    evaluation.fixture.expectedSegmentCount !== evaluation.preview.segments.length
  ) {
    tuning.segmentationAdvice.push({
      segmentKey: evaluation.preview.segments[0]?.plan.key ?? "global",
      action:
        evaluation.fixture.expectedSegmentCount > evaluation.preview.segments.length ? "split" : "merge",
      reason: `Fixture expects ${evaluation.fixture.expectedSegmentCount} segment(s) but the planner produced ${evaluation.preview.segments.length}.`,
      confidence: "high",
    });
  }

  evaluation.preview.segments.forEach((segment) => {
    const joinedWithoutSplit = segment.plan.joinedVariants.find((joined) => {
      const split = joined.replace(/([a-z])([a-z]{4,})$/i, "$1 $2");
      return split.includes(" ") && !segment.plan.splitVariants.includes(split);
    });

    if (joinedWithoutSplit) {
      tuning.compoundSuggestions.push({
        segmentKey: segment.plan.key,
        joined: joinedWithoutSplit,
        split: joinedWithoutSplit.replace(/([a-z])([a-z]{4,})$/i, "$1 $2"),
        reason: "Compound rescue coverage would be clearer with an explicit split variant.",
        confidence: "speculative",
      });
    }
  });

  tuning.notes.push(
    `Expected hits matched: ${evaluation.expectedMatches.filter((entry) => entry.matched).length}/${evaluation.expectedMatches.length}`
  );
  tuning.notes.push(
    `Known irrelevant hits in top range: ${evaluation.irrelevantMatches.filter((entry) => entry.matched).length}/${evaluation.irrelevantMatches.length}`
  );

  return tuning;
}

export async function loadCampaignSearchFixtures(dir = FIXTURE_DIR) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const fixtures: CampaignSearchFixture[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(dir, entry.name);
    const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
    fixtures.push(payload as CampaignSearchFixture);
  }

  return fixtures.sort((left, right) => left.key.localeCompare(right.key));
}

export function evaluateCampaignSearchFixture(
  fixture: CampaignSearchFixture,
  preview: CampaignSearchPreview
): CampaignSearchFixtureEvaluation {
  const flat = flattenPreviewResults(preview);
  const top10 = flat.slice(0, 10).map(({ segmentKey, segmentLabel, result }) => ({
    segmentKey,
    segmentLabel,
    rank: result.rank,
    title: result.product?.title ?? null,
    spu: result.product?.spu ?? null,
    finalScore: result.finalScore,
    retrievalSources: result.retrievalSources,
  }));
  const top50 = flat.slice(0, 50).map(({ segmentKey, segmentLabel, result }) => ({
    segmentKey,
    segmentLabel,
    rank: result.rank,
    title: result.product?.title ?? null,
    spu: result.product?.spu ?? null,
    finalScore: result.finalScore,
    retrievalSources: result.retrievalSources,
  }));
  const expectedMatches = fixture.expectedRelevant.map((matcher) => findMatcherHit(preview, matcher));
  const irrelevantMatches = fixture.knownIrrelevant.map((matcher) => findMatcherHit(preview, matcher));

  const baseEvaluation = {
    fixture,
    preview,
    top10,
    top50,
    expectedMatches,
    irrelevantMatches,
  };

  return {
    ...baseEvaluation,
    tuning: buildTuningReport(baseEvaluation),
  };
}
