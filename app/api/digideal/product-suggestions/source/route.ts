import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  ProductSuggestionRecord,
  buildExternalDataForUrlSuggestion,
  crawlUrlForProduct,
  fetchAndNormalizeImage,
  loadSuggestionRecord,
  normalizeExternalDataForRecord,
  saveSuggestionRecord,
} from "@/lib/product-suggestions";

export const runtime = "nodejs";
const TAXONOMY_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-taxonomy-worker.mjs";

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const isHttpUrl = (value: string) => /^https?:\/\//i.test(asText(value));

const isAmazonProductHost = (value: string) => {
  const raw = asText(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return /(^|\.)amazon\.[a-z.]{2,}$/i.test(asText(parsed.hostname).toLowerCase());
  } catch {
    return false;
  }
};

const spawnTaxonomyWorker = (suggestionId: string) => {
  const id = asText(suggestionId);
  if (!id) return false;
  try {
    const child = spawn(
      process.execPath,
      [TAXONOMY_WORKER_PATH, "--ids", id],
      {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
        },
      }
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
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

const extractAmazonGalleryFromRecord = (record: ProductSuggestionRecord) => {
  const recordObject =
    record && typeof record === "object"
      ? (record as unknown as Record<string, unknown>)
      : {};
  const attrs =
    recordObject.platform_attributes &&
    typeof recordObject.platform_attributes === "object"
      ? (recordObject.platform_attributes as Record<string, unknown>)
      : {};
  const amazonAttrs =
    attrs.amazon && typeof attrs.amazon === "object"
      ? (attrs.amazon as Record<string, unknown>)
      : {};

  return uniqueStrings(
    [
      ...(Array.isArray(amazonAttrs.gallery_image_urls)
        ? amazonAttrs.gallery_image_urls
        : []),
      ...(Array.isArray(record.galleryImageUrls) ? record.galleryImageUrls : []),
    ].filter((entry) => isHttpUrl(asText(entry))),
    80
  );
};

const buildPendingExternalData = (
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

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: settingsError.message }, { status: 500 }),
    };
  }

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
}

const runSourceCrawlJob = async (suggestionId: string, sourceUrl: string) => {
  const startedAt = new Date().toISOString();
  let record = await loadSuggestionRecord(suggestionId);
  if (!record) return;

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
    const amazonGalleryFromRecord = extractAmazonGalleryFromRecord(record);
    const shouldPreferStoredAmazonGallery =
      amazonGalleryFromRecord.length > 0 &&
      isAmazonProductHost(asText(crawl.finalUrl) || sourceUrl);

    let preferredImageUrl =
      asText(crawl.mainImageUrl) ||
      (Array.isArray(crawl.imageUrls) && crawl.imageUrls.length > 0
        ? asText(crawl.imageUrls[0])
        : "");

    const sourceGalleryImageUrls = shouldPreferStoredAmazonGallery
      ? amazonGalleryFromRecord
      : Array.isArray(crawl.imageUrls)
        ? crawl.imageUrls
        : [];
    const sourceMainImageUrl = shouldPreferStoredAmazonGallery
      ? asText(amazonGalleryFromRecord[0]) || preferredImageUrl || asText(crawl.mainImageUrl)
      : preferredImageUrl || asText(crawl.mainImageUrl);
    preferredImageUrl = asText(sourceMainImageUrl) || preferredImageUrl;

    if (preferredImageUrl) {
      try {
        const fetched = await fetchAndNormalizeImage(preferredImageUrl);
        preferredImageUrl = asText(fetched.finalUrl) || preferredImageUrl;
      } catch (error) {
        crawlErrors.push(
          `Image download failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else {
      crawlErrors.push("No product image could be identified from URL.");
    }

    const beforeAi = new Date().toISOString();
    const interimExternalData = await buildExternalDataForUrlSuggestion({
      inputUrl: sourceUrl,
      finalUrl: crawl.finalUrl,
      title: asText(crawl.title),
      description: asText(crawl.description),
      readablePageText: asText(crawl.readableText),
      mainImageUrl: sourceMainImageUrl || null,
      galleryImageUrls: sourceGalleryImageUrls,
      errors: crawlErrors,
      createdAt: asText(record.externalData?.createdAt) || beforeAi,
      runAiCleanup: false,
    });

    record = normalizeExternalDataForRecord({
      ...record,
      sourceUrl,
      sourceLabel: record.sourceLabel || sourceUrl,
      crawlFinalUrl: asText(crawl.finalUrl) || null,
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
      mainImageUrl: sourceMainImageUrl || null,
      galleryImageUrls: sourceGalleryImageUrls,
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

    const taxonomyTitle = asText(record.title) || asText(record.externalData?.title) || asText(record.externalData?.rawTitle);
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
      spawnTaxonomyWorker(suggestionId);
    }
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Source crawl failed unexpectedly.";
    const current = await loadSuggestionRecord(suggestionId);
    if (!current) return;

    const mergedExternalData = current.externalData
      ? {
          ...current.externalData,
          errors: uniqueStrings([...(current.externalData.errors || []), message], 50),
          updatedAt: failedAt,
        }
      : buildPendingExternalData(sourceUrl, null, failedAt);

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
  }
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: { product_id?: unknown; source_url?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const suggestionId = asText(payload.product_id);
  const sourceUrl = asText(payload.source_url);
  if (!suggestionId) {
    return NextResponse.json({ error: "Missing product_id." }, { status: 400 });
  }
  if (!isHttpUrl(sourceUrl)) {
    return NextResponse.json(
      { error: "Source URL must start with http:// or https://." },
      { status: 400 }
    );
  }

  const record = await loadSuggestionRecord(suggestionId);
  if (!record) {
    return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
  }

  const queuedAt = new Date().toISOString();
  const queuedRecord = normalizeExternalDataForRecord({
    ...record,
    sourceUrl,
    sourceLabel: record.sourceLabel || sourceUrl,
    crawlFinalUrl: null,
    externalData: buildPendingExternalData(sourceUrl, record.externalData, queuedAt),
    sourceJob: {
      status: "queued",
      stage: "queued",
      queuedAt,
      startedAt: null,
      finishedAt: null,
      updatedAt: queuedAt,
      error: null,
    },
  });
  await saveSuggestionRecord(queuedRecord);

  setTimeout(() => {
    void runSourceCrawlJob(suggestionId, sourceUrl);
  }, 0);

  return NextResponse.json({
    ok: true,
    product_id: suggestionId,
    source_url: sourceUrl,
    queued: true,
  });
}
