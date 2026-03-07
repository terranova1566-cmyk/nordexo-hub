import {
  ProductSuggestionRecord,
  buildExternalDataForUrlSuggestion,
  crawlUrlForProduct,
  fetchAndNormalizeBestImageCandidate,
  loadSuggestionRecord,
  normalizeExternalDataForRecord,
  saveSuggestionRecord,
} from "@/lib/product-suggestions";

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const uniqueStrings = (items: unknown[], max = 50) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const value = asText(item);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
};

export const isHttpUrl = (value: unknown) => /^https?:\/\//i.test(asText(value));

export const resolveSuggestionSourceUrl = (record: ProductSuggestionRecord | null | undefined) => {
  if (!record || typeof record !== "object") return "";
  const external =
    record.externalData && typeof record.externalData === "object"
      ? record.externalData
      : null;
  return firstString(
    record.sourceUrl,
    external?.inputUrl,
    record.crawlFinalUrl,
    external?.finalUrl
  );
};

export const buildPendingExternalDataForSourceUrl = (
  sourceUrl: string,
  existing: ProductSuggestionRecord["externalData"] | null | undefined,
  now: string
) => ({
  jsonVersion: 1 as const,
  sourceType: "url" as const,
  inputUrl: sourceUrl,
  finalUrl: null,
  rawTitle: null,
  rawDescription: null,
  rawMainImageUrl: null,
  title: null,
  description: null,
  mainImageUrl: null,
  galleryImageUrls: [] as string[],
  imageCount: 0,
  status: {
    title: { ok: false, value: null },
    description: { ok: false, value: null },
    images: { ok: false, count: 0, mainImageUrl: null },
  },
  aiReview: null,
  errors: [],
  createdAt: asText(existing?.createdAt) || now,
  updatedAt: now,
});

export type SuggestionSourceCrawlJobResult = {
  ok: boolean;
  error: string | null;
  taxonomyQueued: boolean;
};

export const runSuggestionSourceCrawlJob = async (params: {
  suggestionId: string;
  sourceUrl: string;
}): Promise<SuggestionSourceCrawlJobResult> => {
  const suggestionId = asText(params.suggestionId);
  const sourceUrl = asText(params.sourceUrl);
  if (!suggestionId || !isHttpUrl(sourceUrl)) {
    return {
      ok: false,
      error: "Source URL must start with http:// or https://.",
      taxonomyQueued: false,
    };
  }

  const startedAt = new Date().toISOString();
  let record = await loadSuggestionRecord(suggestionId);
  if (!record) {
    return {
      ok: false,
      error: "Suggestion not found.",
      taxonomyQueued: false,
    };
  }

  const baseQueuedAt = asText(record.sourceJob?.queuedAt) || startedAt;

  record = normalizeExternalDataForRecord({
    ...record,
    sourceUrl,
    sourceLabel: record.sourceLabel || sourceUrl,
    sourceJob: {
      status: "running",
      stage: "crawl",
      queuedAt: baseQueuedAt,
      startedAt,
      finishedAt: null,
      updatedAt: startedAt,
      error: null,
    },
  });
  await saveSuggestionRecord(record);

  try {
    const crawl = await crawlUrlForProduct(sourceUrl);
    const crawlErrors = [...(Array.isArray(crawl.errors) ? crawl.errors : [])];

    const preferredImageUrl =
      asText(crawl.mainImageUrl) ||
      (Array.isArray(crawl.imageUrls) && crawl.imageUrls.length > 0
        ? asText(crawl.imageUrls[0])
        : "");

    const beforeAi = new Date().toISOString();
    const interimExternalData = await buildExternalDataForUrlSuggestion({
      inputUrl: sourceUrl,
      finalUrl: crawl.finalUrl,
      title: asText(crawl.title),
      description: asText(crawl.description),
      readablePageText: asText(crawl.readableText),
      mainImageUrl: preferredImageUrl || null,
      galleryImageUrls: Array.isArray(crawl.imageUrls) ? crawl.imageUrls : [],
      errors: crawlErrors,
      createdAt: asText(record.externalData?.createdAt) || beforeAi,
      runAiCleanup: false,
    });

    const normalizedImageResult = await fetchAndNormalizeBestImageCandidate(
      [
        interimExternalData.mainImageUrl,
        ...(Array.isArray(interimExternalData.galleryImageUrls)
          ? interimExternalData.galleryImageUrls
          : []),
        preferredImageUrl,
        ...(Array.isArray(crawl.imageUrls) ? crawl.imageUrls : []),
      ],
      {
        preferredUrl: interimExternalData.mainImageUrl || preferredImageUrl || null,
        maxAttempts: 10,
      }
    );
    const normalizedImage = normalizedImageResult.image || null;
    const normalizedMainImageUrl = normalizedImage?.publicPath || null;
    if (!normalizedImage) {
      if (normalizedImageResult.errors.length > 0) {
        crawlErrors.push(...normalizedImageResult.errors.slice(0, 3));
      } else if (
        preferredImageUrl ||
        asText(interimExternalData.mainImageUrl) ||
        interimExternalData.galleryImageUrls.length > 0
      ) {
        crawlErrors.push("No usable product image could be normalized from URL.");
      } else {
        crawlErrors.push("No product image could be identified from URL.");
      }
    }

    record = normalizeExternalDataForRecord({
      ...record,
      sourceUrl,
      sourceLabel: record.sourceLabel || sourceUrl,
      crawlFinalUrl: asText(crawl.finalUrl) || null,
      mainImageUrl:
        normalizedMainImageUrl ||
        asText(record.mainImageUrl) ||
        asText(interimExternalData.mainImageUrl) ||
        null,
      image: normalizedImage || record.image || null,
      externalData: interimExternalData,
      sourceJob: {
        status: "running",
        stage: "ai_cleanup",
        queuedAt: baseQueuedAt,
        startedAt,
        finishedAt: null,
        updatedAt: beforeAi,
        error: null,
      },
    });
    await saveSuggestionRecord(record);

    const finishedAt = new Date().toISOString();
    const finalExternalDataRaw = await buildExternalDataForUrlSuggestion({
      inputUrl: sourceUrl,
      finalUrl: crawl.finalUrl,
      title: asText(crawl.title),
      description: asText(crawl.description),
      readablePageText: asText(crawl.readableText),
      mainImageUrl: interimExternalData.mainImageUrl,
      galleryImageUrls: Array.isArray(crawl.imageUrls) ? crawl.imageUrls : [],
      errors: crawlErrors,
      createdAt: asText(record.externalData?.createdAt) || finishedAt,
      runAiCleanup: true,
    });

    const finalExternalData = {
      ...finalExternalDataRaw,
      errors: uniqueStrings(
        [
          ...finalExternalDataRaw.errors,
          ...(finalExternalDataRaw.aiReview
            ? []
            : ["AI cleanup unavailable for this source."]),
        ],
        50
      ),
      updatedAt: finishedAt,
    };

    record = normalizeExternalDataForRecord({
      ...record,
      sourceUrl,
      sourceLabel: record.sourceLabel || sourceUrl,
      crawlFinalUrl: asText(crawl.finalUrl) || null,
      mainImageUrl:
        normalizedMainImageUrl ||
        asText(record.mainImageUrl) ||
        asText(finalExternalData.mainImageUrl) ||
        null,
      image: normalizedImage || record.image || null,
      externalData: finalExternalData,
      sourceJob: {
        status: "done",
        stage: "done",
        queuedAt: baseQueuedAt,
        startedAt,
        finishedAt,
        updatedAt: finishedAt,
        error: null,
      },
    });
    await saveSuggestionRecord(record);

    const taxonomyTitle =
      asText(record.title) ||
      asText(record.externalData?.title) ||
      asText(record.externalData?.rawTitle);
    const taxonomyStatus = asText(record.googleTaxonomy?.status).toLowerCase();
    const taxonomySourceTitle = asText(record.googleTaxonomy?.sourceTitle);
    const taxonomyPath = asText(record.googleTaxonomy?.path);
    const taxonomyNeedsQueue =
      Boolean(taxonomyTitle) &&
      taxonomyStatus !== "running" &&
      (taxonomyStatus === "idle" ||
        taxonomyStatus === "error" ||
        !taxonomyPath ||
        (taxonomyStatus === "done" && taxonomySourceTitle !== taxonomyTitle));

    if (taxonomyNeedsQueue) {
      const queuedAt = new Date().toISOString();
      record = normalizeExternalDataForRecord({
        ...record,
        googleTaxonomy: {
          ...(record.googleTaxonomy || {}),
          status: "queued",
          sourceTitle: taxonomyTitle,
          queuedAt,
          startedAt: null,
          finishedAt: null,
          updatedAt: queuedAt,
          error: null,
        },
      });
      await saveSuggestionRecord(record);
    }

    return { ok: true, error: null, taxonomyQueued: taxonomyNeedsQueue };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Source crawl failed unexpectedly.";
    const current = await loadSuggestionRecord(suggestionId);
    if (!current) {
      return { ok: false, error: message, taxonomyQueued: false };
    }

    const mergedExternalData = current.externalData
      ? {
          ...current.externalData,
          errors: uniqueStrings([...(current.externalData.errors || []), message], 50),
          updatedAt: failedAt,
        }
      : buildPendingExternalDataForSourceUrl(sourceUrl, null, failedAt);

    const failedRecord = normalizeExternalDataForRecord({
      ...current,
      sourceUrl,
      sourceLabel: current.sourceLabel || sourceUrl,
      externalData: mergedExternalData,
      sourceJob: {
        status: "error",
        stage: "done",
        queuedAt: asText(current.sourceJob?.queuedAt) || startedAt,
        startedAt: asText(current.sourceJob?.startedAt) || startedAt,
        finishedAt: failedAt,
        updatedAt: failedAt,
        error: message,
      },
    });
    await saveSuggestionRecord(failedRecord);
    return { ok: false, error: message, taxonomyQueued: false };
  }
};
