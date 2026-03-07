import {
  CAMPAIGN_SEARCH_FINGERPRINT_VERSION,
  CAMPAIGN_SEARCH_MODEL,
  CAMPAIGN_SEARCH_SEMANTIC_MIN_SIMILARITY,
} from "@/lib/campaign-search/constants";
import { buildFallbackFingerprint } from "@/lib/campaign-search/fallback";
import { extractCampaignFingerprint } from "@/lib/campaign-search/openai";
import { buildSegmentPlan } from "@/lib/campaign-search/query-builder";
import {
  applyCampaignSearchEmbeddings,
  createCampaignSearchRun,
  createCampaignSearchSegment,
  ensureCampaignSearchIndexReady,
  fetchCampaignSearchSegmentCandidates,
  fetchCampaignSearchSemanticCandidates,
  loadCampaignSearchEmbeddingQueue,
  loadCampaignSearchLexicon,
  loadCampaignSearchProductPreviews,
  loadCampaignSearchRunView,
  loadCampaignSearchSynonyms,
  loadCampaignSearchTaxonomyAliases,
  loadCampaignSearchTaxonomyOptions,
  replaceCampaignSearchSegmentResults,
  updateCampaignSearchRun,
} from "@/lib/campaign-search/repository";
import { mergeSegmentCandidateSets, rankSegmentCandidates } from "@/lib/campaign-search/scoring";
import {
  embedTexts,
  getCampaignSearchSemanticConfig,
  toEmbeddingTextVector,
} from "@/lib/campaign-search/semantic";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type {
  CampaignFingerprint,
  CampaignSearchPreview,
  CampaignSearchResultRow,
  CampaignSearchSegmentPlan,
  CampaignSearchRunView,
} from "@/lib/campaign-search/types";

type AdminClient = ReturnType<typeof createAdminSupabase>;

type FingerprintResolution = {
  fingerprint: CampaignFingerprint;
  fingerprintModel: string | null;
  fallbackReason: string | null;
  llmDebug: Record<string, unknown> | null;
};

type CampaignSearchProgressUpdate = {
  phase: string;
  label: string;
  message: string;
  percent: number;
  segmentIndex?: number | null;
  segmentCount?: number | null;
};

type CampaignSearchProgressSnapshot = CampaignSearchProgressUpdate & {
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  estimatedTotalMs: number | null;
  estimatedRemainingMs: number | null;
  etaAt: string | null;
  currentStep: number;
  totalSteps: number;
};

type CampaignSearchRunState = {
  runId: string;
  startedAt: string;
  debug: Record<string, unknown>;
};

const ACTIVE_CAMPAIGN_SEARCH_RUNS = new Map<string, Promise<unknown>>();

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function getSegmentProgressPercent(segmentIndex: number, segmentCount: number, ratio: number) {
  const boundedCount = Math.max(segmentCount, 1);
  const boundedRatio = Math.max(0, Math.min(1, ratio));
  return 40 + ((segmentIndex + boundedRatio) / boundedCount) * 55;
}

function buildProgressSnapshot(
  startedAt: string,
  progress: CampaignSearchProgressUpdate
): CampaignSearchProgressSnapshot {
  const now = new Date();
  const startedAtDate = new Date(startedAt);
  const percent = clampPercent(progress.percent);
  const elapsedMs = Math.max(0, now.getTime() - startedAtDate.getTime());
  const estimatedTotalMs =
    percent >= 5 ? Math.max(elapsedMs, Math.round(elapsedMs / (percent / 100))) : null;
  const estimatedRemainingMs =
    estimatedTotalMs == null ? null : Math.max(0, estimatedTotalMs - elapsedMs);
  const etaAt =
    estimatedRemainingMs == null ? null : new Date(now.getTime() + estimatedRemainingMs).toISOString();

  return {
    ...progress,
    percent,
    segmentIndex: progress.segmentIndex ?? null,
    segmentCount: progress.segmentCount ?? null,
    startedAt,
    updatedAt: now.toISOString(),
    elapsedMs,
    estimatedTotalMs,
    estimatedRemainingMs,
    etaAt,
    currentStep: Math.max(0, Math.round(percent)),
    totalSteps: 100,
  };
}

async function persistRunProgress(
  adminClient: AdminClient,
  state: CampaignSearchRunState,
  progress: CampaignSearchProgressUpdate
) {
  const snapshot = buildProgressSnapshot(state.startedAt, progress);
  state.debug = {
    ...state.debug,
    progress: snapshot,
  };
  await updateCampaignSearchRun(adminClient, state.runId, {
    debugJson: state.debug,
  });
  return snapshot;
}

async function resolveCampaignFingerprint(input: {
  inputText: string;
  taxonomyOptions: Awaited<ReturnType<typeof loadCampaignSearchTaxonomyOptions>>;
  fingerprintOverride?: CampaignFingerprint;
}): Promise<FingerprintResolution> {
  if (input.fingerprintOverride) {
    return {
      fingerprint: input.fingerprintOverride,
      fingerprintModel: "override",
      fallbackReason: null,
      llmDebug: {
        overridden: true,
      },
    };
  }

  let fingerprint = null as Awaited<ReturnType<typeof extractCampaignFingerprint>> | null;
  let fallbackReason: string | null = null;

  try {
    fingerprint = await extractCampaignFingerprint({
      inputText: input.inputText,
      taxonomyOptions: input.taxonomyOptions,
    });
  } catch (error) {
    fallbackReason = error instanceof Error ? error.message : String(error);
  }

  return {
    fingerprint:
      fingerprint?.fingerprint ?? buildFallbackFingerprint(input.inputText, fallbackReason ?? undefined),
    fingerprintModel: fingerprint?.model ?? CAMPAIGN_SEARCH_MODEL,
    fallbackReason,
    llmDebug: fingerprint
      ? {
          model: fingerprint.model,
          usedStructuredSchema: fingerprint.usedStructuredSchema,
          rawResponse: fingerprint.rawResponse,
        }
      : null,
  };
}

async function executeSegmentPlan(
  adminClient: AdminClient,
  plan: CampaignSearchSegmentPlan,
  progress?: {
    segmentIndex: number;
    segmentCount: number;
    report?: (update: CampaignSearchProgressUpdate) => Promise<void>;
  }
) {
  const semanticConfig = getCampaignSearchSemanticConfig();
  const segmentIndex = progress?.segmentIndex ?? 0;
  const segmentCount = progress?.segmentCount ?? 1;

  await progress?.report?.({
    phase: "segment_lexical",
    label: `Segment ${segmentIndex + 1} of ${segmentCount}`,
    message: `Running lexical retrieval for ${plan.label}.`,
    percent: getSegmentProgressPercent(segmentIndex, segmentCount, 0.05),
    segmentIndex: segmentIndex + 1,
    segmentCount,
  });
  const lexicalCandidates = await fetchCampaignSearchSegmentCandidates(adminClient, plan);

  let semanticCandidates = [] as Awaited<ReturnType<typeof fetchCampaignSearchSemanticCandidates>>;
  let semanticDebug: Record<string, unknown> | null = null;

  if (semanticConfig.enabled && plan.semanticQueryText) {
    await progress?.report?.({
      phase: "segment_semantic",
      label: `Segment ${segmentIndex + 1} of ${segmentCount}`,
      message: `Running semantic recall for ${plan.label}.`,
      percent: getSegmentProgressPercent(segmentIndex, segmentCount, 0.38),
      segmentIndex: segmentIndex + 1,
      segmentCount,
    });
    try {
      const embeddingResult = await embedTexts({
        texts: [plan.semanticQueryText],
        model: semanticConfig.model,
        dimensions: semanticConfig.dimensions,
      });
      const queryEmbedding = embeddingResult.vectors[0];

      if (queryEmbedding) {
        semanticCandidates = await fetchCampaignSearchSemanticCandidates(adminClient, {
          plan,
          queryEmbedding: toEmbeddingTextVector(queryEmbedding),
          minSimilarity: CAMPAIGN_SEARCH_SEMANTIC_MIN_SIMILARITY,
        });
      }

      semanticDebug = {
        enabled: true,
        model: embeddingResult.model,
        queryText: plan.semanticQueryText,
        candidateCount: semanticCandidates.length,
      };
    } catch (error) {
      semanticDebug = {
        enabled: true,
        queryText: plan.semanticQueryText,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
      semanticDebug = {
        enabled: false,
      };
  }

  await progress?.report?.({
    phase: "segment_ranking",
    label: `Segment ${segmentIndex + 1} of ${segmentCount}`,
    message: `Scoring and ranking candidates for ${plan.label}.`,
    percent: getSegmentProgressPercent(segmentIndex, segmentCount, 0.72),
    segmentIndex: segmentIndex + 1,
    segmentCount,
  });
  const mergedCandidates = mergeSegmentCandidateSets({
    lexicalCandidates,
    semanticCandidates,
  });
  const ranked = rankSegmentCandidates(mergedCandidates, plan);
  await progress?.report?.({
    phase: "segment_previews",
    label: `Segment ${segmentIndex + 1} of ${segmentCount}`,
    message: `Loading product previews for ${plan.label}.`,
    percent: getSegmentProgressPercent(segmentIndex, segmentCount, 0.86),
    segmentIndex: segmentIndex + 1,
    segmentCount,
  });
  const previewsById = await loadCampaignSearchProductPreviews(
    adminClient,
    ranked.map((result) => result.productId)
  );

  return {
    results: ranked.map((result) => ({
      ...result,
      product: previewsById.get(result.productId) ?? null,
    })),
    debug: {
      lexicalCandidateCount: lexicalCandidates.length,
      semanticCandidateCount: semanticCandidates.length,
      mergedCandidateCount: mergedCandidates.length,
      topRetrievalSources: ranked.slice(0, 10).map((result) => ({
        productId: result.productId,
        retrievalSources: result.retrievalSources,
      })),
      semantic: semanticDebug,
    },
  };
}

async function buildCampaignSearchPreview(
  adminClient: AdminClient,
  input: {
    inputText: string;
    indexStatus?: Record<string, unknown>;
    fingerprintOverride?: CampaignFingerprint;
    reportProgress?: (update: CampaignSearchProgressUpdate) => Promise<void>;
  }
): Promise<CampaignSearchPreview> {
  const indexStatus = input.indexStatus ?? (await ensureCampaignSearchIndexReady(adminClient));
  await input.reportProgress?.({
    phase: "loading_metadata",
    label: "Loading search metadata",
    message: "Loading taxonomy options, synonyms, and lexicon.",
    percent: 20,
  });
  const [taxonomyOptions, synonyms, taxonomyAliases, lexiconTerms] = await Promise.all([
    loadCampaignSearchTaxonomyOptions(adminClient),
    loadCampaignSearchSynonyms(adminClient),
    loadCampaignSearchTaxonomyAliases(adminClient),
    loadCampaignSearchLexicon(adminClient),
  ]);

  await input.reportProgress?.({
    phase: "fingerprint",
    label: "Extracting AI search fingerprint",
    message: "Analyzing the campaign text and extracting search segments.",
    percent: 28,
  });
  const fingerprint = await resolveCampaignFingerprint({
    inputText: input.inputText,
    taxonomyOptions,
    fingerprintOverride: input.fingerprintOverride,
  });

  await input.reportProgress?.({
    phase: "fingerprint_resolved",
    label: "Fingerprint extracted",
    message: "The AI search plan has been extracted. Building deterministic query plans.",
    percent: 35,
  });

  const segmentPlans = fingerprint.fingerprint.segments.map((segment) =>
    buildSegmentPlan({
      fingerprint: fingerprint.fingerprint,
      segment,
      taxonomyOptions,
      taxonomyAliases,
      lexiconTerms,
      synonyms,
    })
  );

  await input.reportProgress?.({
    phase: "planning",
    label: "Planning retrieval",
    message:
      segmentPlans.length === 1
        ? "Built 1 segment plan. Starting retrieval."
        : `Built ${segmentPlans.length} segment plans. Starting retrieval.`,
    percent: 40,
    segmentCount: segmentPlans.length,
  });

  const segments = [];
  const segmentDebug: Array<Record<string, unknown>> = [];

  for (const [segmentIndex, plan] of segmentPlans.entries()) {
    const execution = await executeSegmentPlan(adminClient, plan, {
      segmentIndex,
      segmentCount: segmentPlans.length,
      report: input.reportProgress,
    });
    segments.push({
      plan,
      results: execution.results,
    });
    segmentDebug.push({
      key: plan.key,
      label: plan.label,
      mappedTaxonomy: plan.mappedTaxonomy,
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
      debug: plan.debug,
      execution: execution.debug,
    });
  }

  return {
    fingerprint: fingerprint.fingerprint,
    fingerprintModel: fingerprint.fingerprintModel,
    fallbackReason: fingerprint.fallbackReason,
    indexStatus,
    segmentPlans,
    segments,
    debug: {
      indexStatus,
      fallbackReason: fingerprint.fallbackReason,
      llm: fingerprint.llmDebug,
      semantic: getCampaignSearchSemanticConfig(),
      segmentPlans: segmentDebug,
    },
  };
}

export async function previewCampaignSearch(input: {
  inputText: string;
  fingerprintOverride?: CampaignFingerprint;
}) {
  const adminClient = createAdminSupabase();
  return buildCampaignSearchPreview(adminClient, input);
}

async function initializeCampaignSearchRun(input: {
  inputText: string;
  createdBy: string;
}) {
  const adminClient = createAdminSupabase();
  const run = await createCampaignSearchRun(adminClient, {
    createdBy: input.createdBy,
    inputText: input.inputText,
    fingerprintVersion: CAMPAIGN_SEARCH_FINGERPRINT_VERSION,
    fingerprintModel: CAMPAIGN_SEARCH_MODEL,
    debugJson: {
      semantic: getCampaignSearchSemanticConfig(),
    },
  });

  const state: CampaignSearchRunState = {
    runId: run.id,
    startedAt: run.startedAt ?? new Date().toISOString(),
    debug: {
      semantic: getCampaignSearchSemanticConfig(),
    },
  };

  await persistRunProgress(adminClient, state, {
    phase: "starting",
    label: "Starting Campaign Search",
    message: "Run created. Preparing the search pipeline.",
    percent: 1,
  });

  return {
    runId: run.id,
    state,
  };
}

async function processCampaignSearchRun(input: {
  runId: string;
  inputText: string;
  state: CampaignSearchRunState;
}): Promise<CampaignSearchRunView | null> {
  const adminClient = createAdminSupabase();

  try {
    await persistRunProgress(adminClient, input.state, {
      phase: "index",
      label: "Preparing search index",
      message: "Checking that the product search index is ready.",
      percent: 5,
    });
    const indexStatus = await ensureCampaignSearchIndexReady(adminClient);
    input.state.debug = {
      ...input.state.debug,
      indexStatus,
      semantic: getCampaignSearchSemanticConfig(),
    };
    await persistRunProgress(adminClient, input.state, {
      phase: "index_ready",
      label: "Search index ready",
      message: "Search index verified. Loading campaign search metadata.",
      percent: 10,
    });

    const preview = await buildCampaignSearchPreview(adminClient, {
      inputText: input.inputText,
      indexStatus,
      reportProgress: async (progress) => {
        await persistRunProgress(adminClient, input.state, progress);
      },
    });

    input.state.debug = {
      ...preview.debug,
      progress: input.state.debug.progress,
    };
    await updateCampaignSearchRun(adminClient, input.runId, {
      fingerprintModel: preview.fingerprintModel,
      fingerprintJson: preview.fingerprint,
      debugJson: input.state.debug,
    });

    for (const [index, entry] of preview.segments.entries()) {
      await persistRunProgress(adminClient, input.state, {
        phase: "persisting_segment",
        label: `Persisting segment ${index + 1} of ${preview.segments.length}`,
        message: `Saving ranked results for ${entry.plan.label}.`,
        percent: 97 + ((index + 1) / Math.max(preview.segments.length, 1)) * 2,
        segmentIndex: index + 1,
        segmentCount: preview.segments.length,
      });
      const segmentRecord = await createCampaignSearchSegment(adminClient, input.runId, entry.plan, index);
      await replaceCampaignSearchSegmentResults(
        adminClient,
        input.runId,
        segmentRecord.id,
        entry.results.map(({ product, ...result }) => result)
      );
    }

    const completedProgress = buildProgressSnapshot(input.state.startedAt, {
      phase: "completed",
      label: "Campaign Search complete",
      message: "All segments and ranked results have been stored.",
      percent: 100,
    });
    input.state.debug = {
      ...preview.debug,
      progress: completedProgress,
    };
    await updateCampaignSearchRun(adminClient, input.runId, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      debugJson: input.state.debug,
    });

    return await loadCampaignSearchRunView(adminClient, input.runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedProgress = buildProgressSnapshot(input.state.startedAt, {
      phase: "failed",
      label: "Campaign Search failed",
      message,
      percent: Number(
        (input.state.debug.progress as { percent?: number } | undefined)?.percent ?? 0
      ),
    });
    input.state.debug = {
      ...input.state.debug,
      progress: failedProgress,
    };
    await updateCampaignSearchRun(adminClient, input.runId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: message,
      debugJson: input.state.debug,
    });
    throw error;
  }
}

function launchCampaignSearchRun(input: {
  runId: string;
  inputText: string;
  state: CampaignSearchRunState;
}) {
  if (ACTIVE_CAMPAIGN_SEARCH_RUNS.has(input.runId)) {
    return ACTIVE_CAMPAIGN_SEARCH_RUNS.get(input.runId)!;
  }

  const promise = processCampaignSearchRun(input)
    .catch(() => undefined)
    .finally(() => {
      ACTIVE_CAMPAIGN_SEARCH_RUNS.delete(input.runId);
    });
  ACTIVE_CAMPAIGN_SEARCH_RUNS.set(input.runId, promise);
  return promise;
}

export async function startCampaignSearchRun(input: {
  inputText: string;
  createdBy: string;
}) {
  const adminClient = createAdminSupabase();
  const run = await initializeCampaignSearchRun(input);
  launchCampaignSearchRun({
    runId: run.runId,
    inputText: input.inputText,
    state: run.state,
  });
  return loadCampaignSearchRunView(adminClient, run.runId);
}

export async function executeCampaignSearch(input: {
  inputText: string;
  createdBy: string;
}) {
  const run = await initializeCampaignSearchRun(input);
  return processCampaignSearchRun({
    runId: run.runId,
    inputText: input.inputText,
    state: run.state,
  });
}

export async function getCampaignSearchRun(runId: string) {
  const adminClient = createAdminSupabase();
  return loadCampaignSearchRunView(adminClient, runId);
}

export async function rebuildCampaignSearchIndex() {
  const adminClient = createAdminSupabase();
  return ensureCampaignSearchIndexReady(adminClient);
}

export async function backfillCampaignSearchEmbeddings(input?: {
  limit?: number;
  productIds?: string[];
}) {
  const adminClient = createAdminSupabase();
  const semanticConfig = getCampaignSearchSemanticConfig();
  if (!semanticConfig.enabled) {
    throw new Error("Semantic recall is disabled. Set CAMPAIGN_SEARCH_SEMANTIC_ENABLED and OPENAI_API_KEY.");
  }

  const queue = await loadCampaignSearchEmbeddingQueue(adminClient, {
    model: semanticConfig.model,
    version: semanticConfig.version,
    limit: input?.limit ?? 100,
    productIds: input?.productIds,
  });

  if (queue.length === 0) {
    return {
      queued: 0,
      embedded: 0,
      model: semanticConfig.model,
      version: semanticConfig.version,
    };
  }

  const embeddingResult = await embedTexts({
    texts: queue.map((row) => row.sourceText),
    model: semanticConfig.model,
    dimensions: semanticConfig.dimensions,
  });

  const embedded = await applyCampaignSearchEmbeddings(adminClient, {
    model: embeddingResult.model,
    version: semanticConfig.version,
    rows: queue.map((row, index) => ({
      productId: row.productId,
      sourceHash: row.sourceHash,
      embeddingText: toEmbeddingTextVector(embeddingResult.vectors[index] ?? []),
    })),
  });

  return {
    queued: queue.length,
    embedded,
    model: embeddingResult.model,
    version: semanticConfig.version,
  };
}
