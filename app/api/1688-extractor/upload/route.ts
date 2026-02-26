import fs from "fs";
import path from "path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateQueueKeywordsForFile } from "@/lib/queue-keywords";
import { warmQueueImageCacheForFile } from "@/lib/queue-image-cache";
import {
  PARTNER_SUGGESTION_DIR,
  PARTNER_SUGGESTION_PROVIDER,
  createSuggestionId,
  fetchAndNormalizeImage,
  normalizeExternalDataForRecord,
  saveSuggestionRecord,
  type ProductSuggestionRecord,
} from "@/lib/product-suggestions";
import { enhance1688ItemsWithAi } from "@/shared/1688/ai-pipeline";
import { canonical1688OfferUrlText } from "@/shared/1688/core";

export const runtime = "nodejs";

const DEFAULT_BASE = "1688_product_extraction";
const UPLOAD_DIR =
  process.env.NODEXO_EXTRACTOR_UPLOAD_DIR || "/srv/node-files/1688-extractor";
const PRODUCT_SUGGESTION_PAYLOAD_TYPE = "product_suggestions_browser_v1";
const PRODUCT_SUGGESTION_IMPORT_MAX = 200;
const DEFAULT_PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || process.env.HUB_PUBLIC_URL || "https://hub.nordexo.se";
const BACKGROUND_SEARCH_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-supplier-search-worker.mjs";
const BACKGROUND_TAXONOMY_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-taxonomy-worker.mjs";
const BACKGROUND_SOURCE_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-source-worker.ts";
const TSX_BIN_PATH = "/srv/nordexo-hub/node_modules/.bin/tsx";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Nodexo-Token",
};

const asText = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

const toBool = (value: unknown, fallback = false) => {
  const raw = asText(value).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

const toInt = (value: unknown, fallback: number, options: { min?: number; max?: number } = {}) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.trunc(num);
  const withMin = Number.isFinite(Number(options.min))
    ? Math.max(Number(options.min), rounded)
    : rounded;
  return Number.isFinite(Number(options.max))
    ? Math.min(Number(options.max), withMin)
    : withMin;
};

const toStringList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asText(entry))
      .filter(Boolean);
  }
  const text = asText(value);
  if (!text) return [];
  return text
    .split(",")
    .map((entry) => asText(entry))
    .filter(Boolean);
};

const canonicalize1688Url = (value: unknown) => {
  const text = asText(value);
  if (!text) return "";
  return canonical1688OfferUrlText(text) || text;
};

const canonicalizeUploadedEntryUrls = (record: Record<string, unknown>) => {
  const out = { ...record };
  const directUrlKeys = [
    "url_1688",
    "detail_url",
    "detailUrl",
    "selected_detail_url",
    "supplier_selected_offer_detail_url",
    "draft_supplier_1688_url",
  ];
  directUrlKeys.forEach((key) => {
    if (typeof out[key] !== "string") return;
    out[key] = canonicalize1688Url(out[key]);
  });

  if (Array.isArray(out.url_1688_list)) {
    const nextList = out.url_1688_list
      .map((entry) => canonicalize1688Url(entry))
      .filter(Boolean);
    out.url_1688_list = Array.from(new Set(nextList));
  }

  if (out.selected_offer && typeof out.selected_offer === "object") {
    const offer = { ...(out.selected_offer as Record<string, unknown>) };
    if (typeof offer.detailUrl === "string") {
      offer.detailUrl = canonicalize1688Url(offer.detailUrl);
    }
    if (typeof offer.detail_url === "string") {
      offer.detail_url = canonicalize1688Url(offer.detail_url);
    }
    out.selected_offer = offer;
  }

  return out;
};

const toPrimitiveAiFlag = (value: unknown): string | number | boolean | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  return undefined;
};

const firstPrimitiveAiFlag = (
  ...values: unknown[]
): string | number | boolean | undefined => {
  for (const value of values) {
    const primitive = toPrimitiveAiFlag(value);
    if (primitive !== undefined) return primitive;
  }
  return undefined;
};

const maybeEnhanceItemsWithAi = async (
  items: unknown[],
  payloadRecord: Record<string, unknown> | null
) => {
  const enabled = toBool(
    payloadRecord?.aiEnhance ??
      payloadRecord?.ai_enhance ??
      process.env.NODEXO_1688_UPLOAD_AI_ENABLE ??
      "1",
    true
  );
  if (!enabled || items.length === 0) {
    return { items, usedAi: false, error: null as string | null };
  }

  const mode = asText(
    payloadRecord?.aiMode ?? payloadRecord?.ai_mode ?? process.env.NODEXO_1688_UPLOAD_AI_MODE
  );
  const enableWeightReview =
    firstPrimitiveAiFlag(
      payloadRecord?.aiWeightReview,
      payloadRecord?.ai_weight_review,
      process.env.NODEXO_1688_UPLOAD_AI_WEIGHT_REVIEW,
      process.env.NODEXO_1688_AI_WEIGHT_REVIEW
    ) ?? "1";
  const enableAttributeExtract =
    firstPrimitiveAiFlag(
      payloadRecord?.aiAttributeExtract,
      payloadRecord?.ai_attribute_extract,
      process.env.NODEXO_1688_UPLOAD_AI_ATTRIBUTE_EXTRACT
    ) ?? (items.length <= 3 ? "1" : "0");
  const modelCandidates = toStringList(
    payloadRecord?.aiModels ?? payloadRecord?.ai_models ?? process.env.NODEXO_1688_UPLOAD_AI_MODELS
  );
  const attributeTimeoutMs = toInt(
    payloadRecord?.aiAttributeTimeoutMs ??
      payloadRecord?.ai_attribute_timeout_ms ??
      process.env.NODEXO_1688_UPLOAD_AI_ATTRIBUTE_TIMEOUT_MS,
    12_000,
    { min: 4_000, max: 40_000 }
  );
  const concurrency = toInt(
    payloadRecord?.aiConcurrency ??
      payloadRecord?.ai_concurrency ??
      process.env.NODEXO_1688_UPLOAD_AI_CONCURRENCY,
    2,
    { min: 1, max: 6 }
  );

  try {
    const enhanced = await enhance1688ItemsWithAi(items, {
      source: "extractor_upload_route",
      mode: mode || "fast",
      enableWeightReview,
      enableAttributeExtract,
      modelCandidates,
      attributeTimeoutMs,
      concurrency,
    });
    return { items: enhanced as unknown[], usedAi: true, error: null as string | null };
  } catch (error) {
    return {
      items,
      usedAi: false,
      error: error instanceof Error ? error.message : "ai_enhancement_failed",
    };
  }
};

const hasExistingVariantFilter = (record: Record<string, unknown>) => {
  if (typeof record.variants_1688 === "string" && record.variants_1688.trim()) {
    return true;
  }
  if (!Array.isArray(record.variation_filter_tokens)) return false;
  return record.variation_filter_tokens.some((entry) => asText(entry));
};

const collectSelectedComboIndexes = (combos: unknown[]) => {
  const out: number[] = [];
  combos.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const quantity = Number((entry as Record<string, unknown>).quantity);
    if (Number.isFinite(quantity) && quantity > 0) out.push(index);
  });
  return out;
};

const buildVariantFilterTokens = (combos: unknown[], selectedIndexes: number[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  selectedIndexes.forEach((idx) => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= combos.length) return;
    const combo =
      combos[idx] && typeof combos[idx] === "object"
        ? (combos[idx] as Record<string, unknown>)
        : null;
    if (!combo) return;
    ["t1", "t2", "t3"].forEach((key) => {
      const token = asText(combo[key]);
      if (!token || seen.has(token)) return;
      seen.add(token);
      out.push(token);
    });
  });
  return out;
};

const normalizeUploadedItems = (items: unknown[]) =>
  items.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const record = canonicalizeUploadedEntryUrls(
      entry as Record<string, unknown>
    );
    if (hasExistingVariantFilter(record)) return record;

    const variations =
      record.variations && typeof record.variations === "object"
        ? ({ ...(record.variations as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : null;
    const combos = variations && Array.isArray(variations.combos) ? variations.combos : [];
    if (combos.length === 0) return record;

    const selectedComboIndexes = collectSelectedComboIndexes(combos);
    if (selectedComboIndexes.length === 0) return record;

    const filterTokens = buildVariantFilterTokens(combos, selectedComboIndexes);
    if (filterTokens.length === 0) return record;

    record.variation_filter_tokens = filterTokens;
    record.variants_1688 = filterTokens.join("\n");
    const existingSelection =
      record.production_variant_selection &&
      typeof record.production_variant_selection === "object"
        ? {
            ...(record.production_variant_selection as Record<string, unknown>),
          }
        : {};
    record.production_variant_selection = {
      ...existingSelection,
      selected_combo_indexes: selectedComboIndexes,
      combo_overrides: Array.isArray(existingSelection.combo_overrides)
        ? existingSelection.combo_overrides
        : [],
      packs: Array.isArray(existingSelection.packs) ? existingSelection.packs : [],
      packs_text: asText(existingSelection.packs_text),
    };

    return record;
  });

function parseTokens() {
  const raw =
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKENS ||
    process.env.NODEXO_EXTRACTOR_UPLOAD_TOKEN ||
    "";
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function getAuthToken(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return request.headers.get("x-nodexo-token") || "";
}

function sanitizeBaseName(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const dashed = raw.replace(/\s+/g, "-");
  return dashed.replace(/[^a-zA-Z0-9._-]/g, "").replace(/^-+|-+$/g, "");
}

function buildTimestamp() {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(
    d.getMilliseconds(),
    3
  )}`;
  return { date, time };
}

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return null;

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    asText(value)
  );

const toObjectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const pickFirstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const normalizeHttpUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const normalizeImageUrlList = (values: unknown[], max = 120) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of values) {
    const normalized = normalizeHttpUrl(entry);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
};

const collectUploadedSuggestionImages = (entry: Record<string, unknown>) => {
  const attrs = toObjectRecord(entry.platform_attributes);
  const scopedLists: unknown[] = [];
  Object.values(attrs).forEach((scope) => {
    const scoped = toObjectRecord(scope);
    scopedLists.push(
      scoped.gallery_image_urls,
      scoped.main_image_urls,
      scoped.image_urls,
      scoped.description_image_urls,
      scoped.images
    );
  });

  return normalizeImageUrlList(
    [
      ...(Array.isArray(entry.main_image_urls) ? entry.main_image_urls : []),
      ...(Array.isArray(entry.gallery_image_urls) ? entry.gallery_image_urls : []),
      ...(Array.isArray(entry.image_urls) ? entry.image_urls : []),
      ...(Array.isArray(entry.supplementary_image_urls) ? entry.supplementary_image_urls : []),
      entry.main_image_url,
      ...scopedLists.flatMap((value) => (Array.isArray(value) ? value : [value])),
    ],
    120
  );
};

const isProductSuggestionPayload = (
  payloadRecord: Record<string, unknown> | null,
  items: unknown[]
) => {
  const payloadType = asText(
    payloadRecord?.payloadType || payloadRecord?.payload_type
  ).toLowerCase();
  if (payloadType === PRODUCT_SUGGESTION_PAYLOAD_TYPE) return true;
  return items.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return (
      asText(record.payload_type).toLowerCase() === PRODUCT_SUGGESTION_PAYLOAD_TYPE ||
      asText(record.record_type).toLowerCase() === "product_suggestion"
    );
  });
};

const resolveSuggestionQueueUserId = async (
  adminClient: ReturnType<typeof getAdminClient>,
  payloadRecord: Record<string, unknown> | null
) => {
  const envUserId = asText(process.env.NODEXO_PRODUCT_SUGGESTION_UPLOAD_USER_ID);
  if (isUuid(envUserId)) return envUserId;

  const payloadUserId = pickFirstText(
    payloadRecord?.queue_user_id,
    payloadRecord?.queueUserId,
    payloadRecord?.user_id,
    payloadRecord?.userId
  );
  if (isUuid(payloadUserId)) return payloadUserId;

  if (!adminClient) return "";

  const { data: existingRow } = await adminClient
    .from("discovery_production_items")
    .select("user_id")
    .eq("provider", PARTNER_SUGGESTION_PROVIDER)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingUserId = asText(existingRow?.user_id);
  if (isUuid(existingUserId)) return existingUserId;

  const { data: adminRow } = await adminClient
    .from("partner_user_settings")
    .select("user_id")
    .eq("is_admin", true)
    .limit(1)
    .maybeSingle();
  const adminUserId = asText(adminRow?.user_id);
  if (isUuid(adminUserId)) return adminUserId;

  try {
    const entries = fs
      .readdirSync(PARTNER_SUGGESTION_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => {
        const fullPath = path.join(PARTNER_SUGGESTION_DIR, entry.name);
        const mtimeMs = fs.statSync(fullPath).mtimeMs || 0;
        return { fullPath, mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 60);

    for (const entry of entries) {
      try {
        const parsed = JSON.parse(fs.readFileSync(entry.fullPath, "utf8")) as Record<
          string,
          unknown
        >;
        const createdBy = pickFirstText(parsed.createdBy, parsed.created_by);
        if (isUuid(createdBy)) return createdBy;
      } catch {
        // best effort
      }
    }
  } catch {
    // best effort
  }

  return "";
};

const spawnBackgroundSupplierSearchWorker = (suggestionIds: string[]) => {
  const ids = Array.from(
    new Set(suggestionIds.map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;

  try {
    const child = spawn(
      process.execPath,
      [
        BACKGROUND_SEARCH_WORKER_PATH,
        "--provider",
        PARTNER_SUGGESTION_PROVIDER,
        "--ids",
        ids.join(","),
      ],
      {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          PUBLIC_BASE_URL: DEFAULT_PUBLIC_BASE_URL,
        },
      }
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const spawnBackgroundTaxonomyWorker = (suggestionIds: string[]) => {
  const ids = Array.from(
    new Set(suggestionIds.map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;

  try {
    const child = spawn(process.execPath, [BACKGROUND_TAXONOMY_WORKER_PATH, "--ids", ids.join(",")], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
      },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const spawnBackgroundSourceWorker = (suggestionIds: string[]) => {
  const ids = Array.from(
    new Set(suggestionIds.map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;

  try {
    const child = spawn(TSX_BIN_PATH, [BACKGROUND_SOURCE_WORKER_PATH, "--ids", ids.join(",")], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
      },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

type SuggestionImportSummary = {
  enabled: boolean;
  attempted: number;
  imported: number;
  queued: number;
  sourceQueued: number;
  searchWorkerStarted: boolean;
  taxonomyWorkerStarted: boolean;
  sourceWorkerStarted: boolean;
  skippedReason: string | null;
  errors: string[];
};

const importSuggestionsToPartnerQueue = async (
  items: unknown[],
  payloadRecord: Record<string, unknown> | null
): Promise<SuggestionImportSummary> => {
  if (!isProductSuggestionPayload(payloadRecord, items)) {
    return {
      enabled: false,
      attempted: 0,
      imported: 0,
      queued: 0,
      sourceQueued: 0,
      searchWorkerStarted: false,
      taxonomyWorkerStarted: false,
      sourceWorkerStarted: false,
      skippedReason: "payload_not_product_suggestions",
      errors: [],
    };
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return {
      enabled: true,
      attempted: 0,
      imported: 0,
      queued: 0,
      sourceQueued: 0,
      searchWorkerStarted: false,
      taxonomyWorkerStarted: false,
      sourceWorkerStarted: false,
      skippedReason: "missing_supabase_service_credentials",
      errors: [],
    };
  }

  const queueUserId = await resolveSuggestionQueueUserId(adminClient, payloadRecord);
  if (!isUuid(queueUserId)) {
    return {
      enabled: true,
      attempted: 0,
      imported: 0,
      queued: 0,
      sourceQueued: 0,
      searchWorkerStarted: false,
      taxonomyWorkerStarted: false,
      sourceWorkerStarted: false,
      skippedReason: "missing_queue_user_id",
      errors: ["Unable to resolve a valid queue user ID for product suggestions."],
    };
  }

  const candidates = items
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, PRODUCT_SUGGESTION_IMPORT_MAX)
    .map((entry) => entry as Record<string, unknown>);

  const createdRecords: ProductSuggestionRecord[] = [];
  const errors: string[] = [];
  const importedAt = new Date().toISOString();

  for (const entry of candidates) {
    const sourcePlatform = asText(entry.source_platform || entry.sourcePlatform).toLowerCase();
    const title = pickFirstText(entry.product_title, entry.title, entry.name) || null;
    const sourceUrl =
      normalizeHttpUrl(
        pickFirstText(entry.product_url, entry.url, entry.source_url, entry.sourceUrl)
      ) || null;
    const hasExternalSourceUrl = Boolean(sourceUrl);
    const description = pickFirstText(entry.product_description, entry.description) || null;
    const imageUrls = collectUploadedSuggestionImages(entry);
    const remoteMainImageUrl = imageUrls[0] || null;
    const createdAt = importedAt;
    const scrapedAt = asText(entry.scraped_at) || null;
    const partnerName = pickFirstText(
      entry.partner_name,
      entry.partnerName,
      entry.user,
      entry.submitted_by,
      payloadRecord?.partnerName,
      payloadRecord?.partner_name,
      payloadRecord?.user,
      payloadRecord?.sourceUser
    );

    const recordErrors: string[] = [];
    let image: ProductSuggestionRecord["image"] = null;
    let mainImageUrl = remoteMainImageUrl;
    if (remoteMainImageUrl) {
      try {
        const fetched = await fetchAndNormalizeImage(remoteMainImageUrl);
        image = fetched.image;
        mainImageUrl = fetched.image.publicPath;
      } catch (error) {
        recordErrors.push(
          `Image download failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else {
      recordErrors.push("No product image URL found in uploaded suggestion.");
    }

    const record: ProductSuggestionRecord = {
      id: createSuggestionId(),
      provider: PARTNER_SUGGESTION_PROVIDER,
      createdAt,
      createdBy: queueUserId,
      sourceType: "url",
      sourceLabel: pickFirstText(entry.source_host, sourcePlatform, "browser_extension") || null,
      sourceUrl: sourceUrl || remoteMainImageUrl || null,
      crawlFinalUrl: sourceUrl || null,
      title,
      description,
      mainImageUrl: mainImageUrl || remoteMainImageUrl || null,
      galleryImageUrls: imageUrls,
      image,
      errors: recordErrors,
      searchJob: {
        status: "queued",
        queuedAt: importedAt,
        startedAt: null,
        finishedAt: null,
        error: null,
        lastRunAt: importedAt,
      },
      sourceJob: {
        status: hasExternalSourceUrl ? "queued" : "done",
        stage: hasExternalSourceUrl ? "queued" : "done",
        queuedAt: hasExternalSourceUrl ? importedAt : null,
        startedAt: hasExternalSourceUrl ? null : importedAt,
        finishedAt: hasExternalSourceUrl ? null : importedAt,
        updatedAt: importedAt,
        error: null,
      },
      reviewStatus: "new",
    };

    const mutableRecord = record as Record<string, unknown>;
    mutableRecord.partner_name = partnerName;
    mutableRecord.partnerName = partnerName;
    mutableRecord.user = partnerName;
    mutableRecord.submitted_by = partnerName;
    mutableRecord.source_platform = sourcePlatform;
    mutableRecord.payload_type = PRODUCT_SUGGESTION_PAYLOAD_TYPE;
    const sourceAttrs = toObjectRecord(entry.platform_attributes);
    const submissionAttrs = {
      ...toObjectRecord(sourceAttrs.submission),
      partner_name: partnerName,
      source: "nordexo_product_scraper_extension",
      tagged_at: importedAt,
      scraped_at: scrapedAt,
    };
    mutableRecord.platform_attributes = {
      ...sourceAttrs,
      submission: submissionAttrs,
    };

    try {
      const normalized = normalizeExternalDataForRecord(record);
      await saveSuggestionRecord(normalized);
      createdRecords.push(normalized);
    } catch (error) {
      errors.push(
        `Failed to save suggestion "${asText(title) || sourceUrl || "unknown"}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (createdRecords.length === 0) {
    return {
      enabled: true,
      attempted: candidates.length,
      imported: 0,
      queued: 0,
      sourceQueued: 0,
      searchWorkerStarted: false,
      taxonomyWorkerStarted: false,
      sourceWorkerStarted: false,
      skippedReason: "no_records_created",
      errors,
    };
  }

  const queueRows = createdRecords.map((record) => ({
    user_id: queueUserId,
    provider: PARTNER_SUGGESTION_PROVIDER,
    product_id: record.id,
    created_at: record.createdAt,
  }));
  const { error: queueError } = await adminClient
    .from("discovery_production_items")
    .upsert(queueRows, { onConflict: "user_id,provider,product_id" });
  if (queueError) {
    errors.push(`Failed to queue product suggestions: ${queueError.message}`);
  }

  const searchWorkerStarted = spawnBackgroundSupplierSearchWorker(
    createdRecords.map((record) => record.id)
  );
  if (!searchWorkerStarted) {
    errors.push("Background supplier search worker failed to start.");
  }

  const taxonomyWorkerStarted = spawnBackgroundTaxonomyWorker(
    createdRecords
      .filter((record) => Boolean(asText(record.title)))
      .map((record) => record.id)
  );
  if (!taxonomyWorkerStarted) {
    errors.push("Background taxonomy worker failed to start.");
  }

  const sourceWorkerIds = createdRecords
    .filter((record) => /^https?:\/\//i.test(asText(record.crawlFinalUrl)))
    .map((record) => record.id);
  const sourceQueued = sourceWorkerIds.length;
  const sourceWorkerStarted = spawnBackgroundSourceWorker(sourceWorkerIds);
  if (sourceQueued > 0 && !sourceWorkerStarted) {
    errors.push("Background source crawl worker failed to start.");
    const failedAt = new Date().toISOString();
    await Promise.all(
      createdRecords
        .filter((record) => sourceWorkerIds.includes(record.id))
        .map(async (record) => {
          const patched = normalizeExternalDataForRecord({
            ...record,
            sourceJob: {
              status: "error",
              stage: "done",
              queuedAt: record.sourceJob?.queuedAt || failedAt,
              startedAt: record.sourceJob?.startedAt || failedAt,
              finishedAt: failedAt,
              updatedAt: failedAt,
              error: "Background source crawl worker failed to start.",
            },
          });
          await saveSuggestionRecord(patched);
        })
    );
  }

  return {
    enabled: true,
    attempted: candidates.length,
    imported: createdRecords.length,
    queued: queueError ? 0 : queueRows.length,
    sourceQueued,
    searchWorkerStarted,
    taxonomyWorkerStarted,
    sourceWorkerStarted: sourceQueued > 0 ? sourceWorkerStarted : true,
    skippedReason: null,
    errors,
  };
};

export async function POST(request: Request) {
  const tokens = parseTokens();
  if (tokens.length) {
    const provided = getAuthToken(request);
    if (!provided || !tokens.includes(provided)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS }
      );
    }
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const payloadRecord =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const rawItems = Array.isArray(payload) ? payload : payloadRecord?.items;
  const items = Array.isArray(rawItems) ? normalizeUploadedItems(rawItems) : rawItems;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Missing items array." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const aiEnhanced = await maybeEnhanceItemsWithAi(items, payloadRecord);
  const finalItems = aiEnhanced.items;

  const baseRaw =
    (payloadRecord?.filenameBase || payloadRecord?.filename || payloadRecord?.name || "").toString();
  const base = sanitizeBaseName(baseRaw) || DEFAULT_BASE;
  const { date, time } = buildTimestamp();
  const filename = `${base}_${date}_${time}.json`;

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const safeName = path.basename(filename);
  const targetPath = path.join(UPLOAD_DIR, safeName);
  fs.writeFileSync(targetPath, JSON.stringify(finalItems, null, 2), "utf8");
  try {
    await generateQueueKeywordsForFile(safeName, { force: true, mode: "full" });
  } catch {
    // best effort for upload path
  }
  void warmQueueImageCacheForFile(safeName).catch(() => {
    // best effort for upload path
  });
  const productSuggestionsImport = await importSuggestionsToPartnerQueue(
    finalItems,
    payloadRecord
  );

  return NextResponse.json(
    {
      ok: true,
      filename: safeName,
      savedTo: UPLOAD_DIR,
      count: finalItems.length,
      ai_enhanced: aiEnhanced.usedAi,
      ai_error: aiEnhanced.error,
      product_suggestions_import: productSuggestionsImport,
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
