import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createServerSupabase } from "@/lib/supabase/server";
import { PRODUCTION_SUPPLIER_PAYLOAD_DIR } from "@/lib/1688-extractor";
import {
  PARTNER_SUGGESTION_PROVIDER,
  ProductSuggestionRecord,
  buildExternalDataForImageSuggestion,
  buildExternalDataForUrlSuggestion,
  computeB2BPrices,
  crawlUrlForProduct,
  createSuggestionId,
  deriveVariantSelectionMetrics,
  deleteSuggestionRecord,
  extractImagesFromZipBuffer,
  fetchAndNormalizeBestImageCandidate,
  fetchAndNormalizeImage,
  loadSuggestionRecord,
  mapMarketConfigRows,
  mapShippingClassRows,
  normalizeExternalDataForRecord,
  normalizeImageBufferToPublicTemp,
  parseInputUrls,
  saveSuggestionRecord,
} from "@/lib/product-suggestions";

export const runtime = "nodejs";

const MAX_FILES_PER_REQUEST = 300;
const MAX_URLS_PER_REQUEST = 200;
const MAX_JSON_PRODUCTS_PER_FILE = 400;
const BACKGROUND_SEARCH_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-supplier-search-worker.mjs";
const BACKGROUND_TAXONOMY_WORKER_PATH =
  "/srv/nordexo-hub/scripts/product-suggestions-taxonomy-worker.mjs";
const DEFAULT_PUBLIC_BASE_URL = "https://hub.nordexo.se";
const URL_AI_CLEANUP_MAX_PER_REQUEST = 30;
const SEARCH_JOB_STALE_MS = 20 * 60 * 1000;
const SOURCE_JOB_STALE_MS = 20 * 60 * 1000;
const PAYLOAD_JOB_STALE_MS = 20 * 60 * 1000;
const TAXONOMY_JOB_STALE_MS = 3 * 60 * 1000;

type QueueRow = {
  user_id: string;
  provider: string;
  product_id: string;
  created_at: string;
};

type ProductionSpuRow = {
  product_id: string;
  spu: string | null;
  assigned_at: string | null;
};

type SuggestionReviewStatus = "new" | "unqualified";

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const hasCjk = (value: unknown) => /[\u3400-\u9fff]/.test(String(value || ""));

const parseIsoTimestampMs = (value: unknown) => {
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const isStatusStale = (value: unknown, staleMs: number) => {
  const when = parseIsoTimestampMs(value);
  if (when === null) return false;
  return Date.now() - when > staleMs;
};

const isImageFile = (file: File) => {
  const mime = asText(file.type).toLowerCase();
  const name = asText(file.name).toLowerCase();
  return mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|bmp|avif|heic|heif)$/i.test(name);
};

const isZipFile = (file: File) => {
  const mime = asText(file.type).toLowerCase();
  const name = asText(file.name).toLowerCase();
  return mime.includes("zip") || name.endsWith(".zip");
};

const isJsonFile = (file: File) => {
  const mime = asText(file.type).toLowerCase();
  const name = asText(file.name).toLowerCase();
  return (
    name.endsWith(".json") ||
    mime === "application/json" ||
    mime === "text/json" ||
    mime.endsWith("+json")
  );
};

const sanitizeFilePart = (value: string) =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "item";

const formatJsonStamp = (date: Date) => {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(date.getMilliseconds(), 3)}`;
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

const normalizeImageUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
  return normalizeHttpUrl(normalized);
};

const dedupeStringList = (values: string[], max = 120) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const next = asText(value);
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
    if (out.length >= max) break;
  }
  return out;
};

const pickJsonItems = (payload: unknown) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const rec = payload as Record<string, unknown>;
  const candidates = [rec.items, rec.data, rec.products, rec.results, rec.urls];
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }
  return [];
};

const canonical1688DetailUrl = (value: unknown) => {
  const raw = asText(value);
  if (!raw) return "";
  const matched = raw.match(/(?:detail\.1688\.com\/offer\/|\/offer\/)(\d{6,})\.html/i);
  if (matched?.[1]) return `https://detail.1688.com/offer/${matched[1]}.html`;
  return raw;
};

const pick1688DetailUrlFromItem = (entry: Record<string, unknown>) => {
  const direct = [
    entry.url_1688,
    entry.detail_url,
    entry.detailUrl,
    entry.selected_detail_url,
    entry.supplier_selected_offer_detail_url,
  ]
    .map((value) => canonical1688DetailUrl(value))
    .find(Boolean);
  if (direct) return direct;
  const list = Array.isArray(entry.url_1688_list) ? entry.url_1688_list : [];
  for (const value of list) {
    const normalized = canonical1688DetailUrl(value);
    if (normalized) return normalized;
  }
  return "";
};

const extract1688OfferId = (detailUrl: string) => {
  const matched = asText(detailUrl).match(/\/offer\/(\d{6,})\.html/i);
  if (matched?.[1]) return matched[1];
  return "";
};

const collectImportedImageUrls = (entry: Record<string, unknown>) => {
  const out: string[] = [];
  const push = (value: unknown) => {
    const normalized = normalizeImageUrl(value);
    if (normalized) out.push(normalized);
  };
  const pushList = (value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach((row) => {
      if (typeof row === "string") {
        push(row);
        return;
      }
      if (!row || typeof row !== "object") return;
      const rec = row as Record<string, unknown>;
      push(rec.url_full || rec.full_url || rec.url || rec.image_url || rec.imageUrl || rec.src);
      push(rec.thumb_url || rec.thumbnail || rec.thumb || rec.url || rec.image_url);
    });
  };

  push(entry.main_image_1688);
  push(entry.main_image_url);
  push(entry.mainImageUrl);
  pushList(entry.image_urls_1688);
  pushList(entry.supplementary_image_urls);
  pushList(entry.variant_images_1688);
  pushList(entry.variant_image_urls);
  pushList(entry.main_image_urls);
  pushList(entry.gallery_image_urls);
  pushList(entry.image_urls);

  return dedupeStringList(out, 120);
};

const looksLikePreloaded1688Item = (entry: Record<string, unknown>) => {
  const detailUrl = pick1688DetailUrlFromItem(entry);
  if (!detailUrl) return false;
  const variations = resolvePreloaded1688Variations(entry);
  const combos = Array.isArray(variations?.combos) ? variations?.combos : [];
  if (combos.length > 0) return true;
  if (entry.production_variant_selection && typeof entry.production_variant_selection === "object") {
    return true;
  }
  if (asText(entry.variants_1688)) return true;
  if (entry.weight_review_1688 && typeof entry.weight_review_1688 === "object") return true;
  return false;
};

const resolvePreloaded1688Scope = (entry: Record<string, unknown>) =>
  toObjectRecord(toObjectRecord(entry.platform_attributes)["1688"]);

const resolvePreloaded1688Variations = (entry: Record<string, unknown>) => {
  const attrs1688 = resolvePreloaded1688Scope(entry);
  const candidates = [
    entry.variations_enriched_1688,
    entry.variations,
    attrs1688.variations_enriched_1688,
    attrs1688.variations,
  ];
  for (const candidate of candidates) {
    const variation = toObjectRecord(candidate);
    if (Array.isArray(variation.combos) && variation.combos.length > 0) return variation;
  }
  for (const candidate of candidates) {
    const variation = toObjectRecord(candidate);
    if (Object.keys(variation).length > 0) return variation;
  }
  return {};
};

const resolvePreloaded1688WeightReview = (entry: Record<string, unknown>) => {
  if (entry.weight_review_1688 && typeof entry.weight_review_1688 === "object") {
    return entry.weight_review_1688 as Record<string, unknown>;
  }
  const attrs1688 = resolvePreloaded1688Scope(entry);
  if (attrs1688.weight_review_1688 && typeof attrs1688.weight_review_1688 === "object") {
    return attrs1688.weight_review_1688 as Record<string, unknown>;
  }
  return null;
};

const normalizeVariantSelection = (
  value: unknown,
  comboCount: number
) => {
  const selection =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const selected_combo_indexes = Array.isArray(selection.selected_combo_indexes)
    ? (selection.selected_combo_indexes as unknown[])
        .map((entry) => Number(entry))
        .filter(
          (entry) =>
            Number.isInteger(entry) && entry >= 0 && (!comboCount || entry < comboCount)
        )
    : [];

  const packs = Array.isArray(selection.packs)
    ? (selection.packs as unknown[])
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
    : [];

  const combo_overrides = Array.isArray(selection.combo_overrides)
    ? (selection.combo_overrides as unknown[])
        .map((entry) => {
          const rec = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
          if (!rec) return null;
          const index = Number(rec.index);
          if (!Number.isInteger(index) || index < 0 || (comboCount && index >= comboCount)) {
            return null;
          }
          const price = Number(rec.price);
          const weight_grams = Number(rec.weight_grams ?? rec.weightGrams);
          return {
            index,
            price: Number.isFinite(price) && price > 0 ? price : null,
            weight_grams:
              Number.isFinite(weight_grams) && weight_grams > 0
                ? Math.round(weight_grams)
                : null,
          };
        })
        .filter((entry): entry is { index: number; price: number | null; weight_grams: number | null } => Boolean(entry))
    : [];

  return {
    selected_combo_indexes: Array.from(new Set(selected_combo_indexes)).sort((a, b) => a - b),
    packs: Array.from(new Set(packs)).sort((a, b) => a - b),
    packs_text: asText(selection.packs_text),
    combo_overrides,
  };
};

const extractSelectedVariantIndexesFromCombos = (combos: Array<Record<string, unknown>>) => {
  const selected: number[] = [];
  combos.forEach((combo, index) => {
    const quantity = Number(combo.quantity ?? combo.qty ?? combo.selected_qty);
    if (Number.isFinite(quantity) && quantity > 0) selected.push(index);
  });
  return selected;
};

const normalizeCombosForCache = (value: unknown) => {
  const combos = Array.isArray(value) ? value : [];
  return combos
    .map((entry) =>
      entry && typeof entry === "object" ? ({ ...(entry as Record<string, unknown>) } as Record<string, unknown>) : null
    )
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
};

const getPublicBaseUrl = (request: Request) => {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return null;
  return `${proto}://${host}`;
};

const makeAbsoluteIfRelative = (request: Request, value: string | null) => {
  const text = asText(value);
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (!text.startsWith("/")) return null;
  const base = getPublicBaseUrl(request);
  return base ? `${base}${text}` : text;
};

const toBool = (value: unknown, fallback = true) => {
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
};

const normalizeSuggestionReviewStatus = (
  value: unknown
): SuggestionReviewStatus => (asText(value).toLowerCase() === "unqualified" ? "unqualified" : "new");

const spawnBackgroundSupplierSearchWorker = (
  request: Request,
  suggestionIds: string[]
) => {
  const ids = Array.from(
    new Set(suggestionIds.map((entry) => asText(entry)).filter(Boolean))
  );
  if (ids.length === 0) return false;

  const requestBaseUrl = getPublicBaseUrl(request);
  const publicBaseUrl =
    requestBaseUrl || process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL;

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
          PUBLIC_BASE_URL: publicBaseUrl,
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
    const child = spawn(
      process.execPath,
      [BACKGROUND_TAXONOMY_WORKER_PATH, "--ids", ids.join(",")],
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

async function requireSignedIn() {
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

  return { ok: true as const, user, supabase };
}

async function requireAdmin() {
  const auth = await requireSignedIn();
  if (!auth.ok) {
    return auth;
  }

  const { supabase, user } = auth;

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

  return { ok: true as const, user, supabase };
}

const buildFallbackRecord = (
  id: string,
  createdAt: string,
  userId: string
): ProductSuggestionRecord => ({
  id,
  provider: PARTNER_SUGGESTION_PROVIDER,
  createdAt,
  createdBy: userId,
  sourceType: "image",
  sourceLabel: null,
  sourceUrl: null,
  crawlFinalUrl: null,
  title: null,
  description: null,
  mainImageUrl: null,
  galleryImageUrls: [],
  image: null,
  errors: ["Suggestion metadata file is missing."],
  searchJob: {
    status: "error",
    error: "Suggestion metadata file is missing.",
    finishedAt: createdAt,
    lastRunAt: createdAt,
  },
  sourceJob: {
    status: "error",
    stage: "done",
    queuedAt: null,
    startedAt: createdAt,
    finishedAt: createdAt,
    updatedAt: createdAt,
    error: "Suggestion metadata file is missing.",
  },
  googleTaxonomy: {
    status: "error",
    id: null,
    path: null,
    l1: null,
    l2: null,
    l3: null,
    confidence: null,
    sourceTitle: null,
    queuedAt: null,
    startedAt: createdAt,
    finishedAt: createdAt,
    updatedAt: createdAt,
    error: "Suggestion metadata file is missing.",
  },
  reviewStatus: "new",
});

const createImageSuggestion = async (
  params: {
    userId: string;
    sourceLabel: string | null;
    sourceUrl: string | null;
    title: string | null;
    description: string | null;
    galleryImageUrls?: string[];
    crawlFinalUrl?: string | null;
    buffer: Buffer;
  }
): Promise<ProductSuggestionRecord> => {
  const createdAt = new Date().toISOString();
  const id = createSuggestionId();
  const image = await normalizeImageBufferToPublicTemp(params.buffer, {
    maxWidth: 750,
    maxHeight: 750,
    quality: 90,
  });
  const hasSourceUrl = Boolean(asText(params.sourceUrl));
  const sourceUrl = hasSourceUrl ? asText(params.sourceUrl) : image.publicPath;

  const record: ProductSuggestionRecord = {
    id,
    provider: PARTNER_SUGGESTION_PROVIDER,
    createdAt,
    createdBy: params.userId,
    sourceType: hasSourceUrl ? "url" : "image",
    sourceLabel: params.sourceLabel,
    sourceUrl: sourceUrl || null,
    crawlFinalUrl: params.crawlFinalUrl || null,
    title: asText(params.title) || null,
    description: asText(params.description) || null,
    mainImageUrl: image.publicPath,
    galleryImageUrls: Array.isArray(params.galleryImageUrls)
      ? params.galleryImageUrls.map((entry) => asText(entry)).filter(Boolean)
      : [],
    image,
    externalData: buildExternalDataForImageSuggestion({
      createdAt,
      imageUrl: image.publicPath,
      errors: [],
    }),
    errors: [],
    searchJob: {
      status: "idle",
      error: null,
      lastRunAt: createdAt,
    },
    sourceJob: {
      status: "idle",
      stage: "done",
      queuedAt: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: createdAt,
      error: null,
    },
    reviewStatus: "new",
  };

  const normalized = normalizeExternalDataForRecord(record);
  await saveSuggestionRecord(normalized);
  return normalized;
};

const importPreloaded1688JsonFile = async (params: {
  file: File;
  userId: string;
  adminClient: NonNullable<ReturnType<typeof getAdminClient>>;
}) => {
  const { file, userId, adminClient } = params;
  const errors: string[] = [];
  const records: ProductSuggestionRecord[] = [];
  const preloadedIds: string[] = [];

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return {
      records,
      preloadedIds,
      errors: [`Invalid JSON file skipped: ${file.name}`],
    };
  }

  const rawItems = pickJsonItems(parsed).slice(0, MAX_JSON_PRODUCTS_PER_FILE);
  if (rawItems.length === 0) {
    return {
      records,
      preloadedIds,
      errors: [`JSON file skipped (no items array): ${file.name}`],
    };
  }

  const candidateItems = rawItems
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => entry as Record<string, unknown>);
  const compatibleItems = candidateItems.filter(looksLikePreloaded1688Item);

  if (compatibleItems.length === 0) {
    return {
      records,
      preloadedIds,
      errors: [
        `JSON file skipped (unsupported format): ${file.name}. Expected Nordexo 1688 extracted item format.`,
      ],
    };
  }

  if (compatibleItems.length < candidateItems.length) {
    errors.push(
      `${file.name}: imported ${compatibleItems.length}/${candidateItems.length} compatible item(s).`
    );
  }

  await fs.mkdir(PRODUCTION_SUPPLIER_PAYLOAD_DIR, { recursive: true });
  const baseName = sanitizeFilePart(path.basename(file.name, path.extname(file.name)));
  const importAt = new Date().toISOString();
  const importStamp = formatJsonStamp(new Date());

  for (let index = 0; index < compatibleItems.length; index += 1) {
    const item = compatibleItems[index];
    const detailUrl = pick1688DetailUrlFromItem(item);
    if (!detailUrl) {
      errors.push(`${file.name}: item ${index + 1} skipped (missing 1688 detail URL).`);
      continue;
    }

    const suggestionId = createSuggestionId();
    const sourceUrl =
      normalizeHttpUrl(
        firstString(
          item.url_amz,
          item.product_url,
          item.url,
          item.source_url,
          item.sourceUrl
        )
      ) || null;

    const title =
      firstString(item.product_title, item.title, item.name, item.sku, item.spu) || null;
    const description =
      firstString(item.product_description, item.description, item.readable_1688) || null;

    const remoteImages = collectImportedImageUrls(item);
    const remoteMainImageUrl = remoteImages[0] || null;
    let normalizedImage: ProductSuggestionRecord["image"] = null;
    let mainImageUrl = remoteMainImageUrl;
    if (remoteMainImageUrl) {
      try {
        const fetched = await fetchAndNormalizeImage(remoteMainImageUrl);
        normalizedImage = fetched.image;
        mainImageUrl = fetched.image.publicPath;
      } catch (error) {
        errors.push(
          `${file.name}: image normalization failed for item ${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const payloadItem = {
      ...(item as Record<string, unknown>),
      production_provider: PARTNER_SUGGESTION_PROVIDER,
      production_product_id: suggestionId,
      url_1688: detailUrl,
      url_1688_list: [detailUrl],
    };
    const payloadFileName = `production_supplier_${sanitizeFilePart(
      PARTNER_SUGGESTION_PROVIDER
    )}_${sanitizeFilePart(suggestionId)}_${importStamp}_${String(index + 1).padStart(3, "0")}.json`;
    const payloadFilePath = path.join(PRODUCTION_SUPPLIER_PAYLOAD_DIR, payloadFileName);

    try {
      await fs.writeFile(payloadFilePath, JSON.stringify(payloadItem, null, 2), "utf8");
    } catch (error) {
      errors.push(
        `${file.name}: failed to save payload JSON for item ${index + 1}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      continue;
    }

    const sourceAttrs = toObjectRecord(item.platform_attributes);
    const sourceAttrs1688 = toObjectRecord(sourceAttrs["1688"]);
    const resolvedVariations = resolvePreloaded1688Variations(item);
    const resolvedWeightReview = resolvePreloaded1688WeightReview(item);
    const resolvedVariantSelection =
      (item.production_variant_selection &&
      typeof item.production_variant_selection === "object"
        ? (item.production_variant_selection as Record<string, unknown>)
        : null) ||
      (sourceAttrs1688.production_variant_selection &&
      typeof sourceAttrs1688.production_variant_selection === "object"
        ? (sourceAttrs1688.production_variant_selection as Record<string, unknown>)
        : null);
    const resolvedImageUrls1688 = Array.isArray(item.image_urls_1688)
      ? item.image_urls_1688
      : Array.isArray(sourceAttrs1688.gallery_image_urls)
        ? sourceAttrs1688.gallery_image_urls
        : Array.isArray(sourceAttrs1688.image_urls)
          ? sourceAttrs1688.image_urls
          : [];

    const variations = toObjectRecord(resolvedVariations);
    const combos = normalizeCombosForCache(variations.combos);
    const selectionBase = normalizeVariantSelection(
      resolvedVariantSelection || item.production_variant_selection,
      combos.length
    );
    const fallbackSelectedIndexes =
      selectionBase.selected_combo_indexes.length > 0
        ? selectionBase.selected_combo_indexes
        : extractSelectedVariantIndexesFromCombos(combos);
    const selected_combo_indexes =
      fallbackSelectedIndexes.length > 0
        ? fallbackSelectedIndexes
        : combos.map((_, comboIndex) => comboIndex);
    const variantSelection = {
      ...selectionBase,
      selected_combo_indexes: Array.from(new Set(selected_combo_indexes)).sort((a, b) => a - b),
    };

    const offerId =
      asText(item.selected_supplier_offer_id) || extract1688OfferId(detailUrl) || null;

    const selectedOffer = {
      offerId,
      detailUrl,
      imageUrl: remoteMainImageUrl,
      subject: title,
      subject_en: title,
      _production_payload_status: "ready",
      _production_payload_source: "extension_json",
      _production_payload_error: null,
      _production_payload_file_name: payloadFileName,
      _production_payload_file_path: payloadFilePath,
      _production_payload_updated_at: importAt,
      _production_payload_saved_at: importAt,
      _production_variant_selection: variantSelection,
      _production_variant_cache: {
        cached_at: importAt,
        payload_file_path: payloadFilePath,
        available_count: combos.length,
        type1_label: asText(variations.type1_label || variations.type1Label),
        type2_label: asText(variations.type2_label || variations.type2Label),
        type3_label: asText(variations.type3_label || variations.type3Label),
        combos,
        gallery_images: resolvedImageUrls1688,
        weight_review: resolvedWeightReview,
      },
    };

    const suggestionRecord: ProductSuggestionRecord = normalizeExternalDataForRecord({
      id: suggestionId,
      provider: PARTNER_SUGGESTION_PROVIDER,
      createdAt: importAt,
      createdBy: userId,
      sourceType: sourceUrl ? "url" : "image",
      sourceLabel: firstString(item.source_host, item.source_platform, "1688_json") || null,
      sourceUrl: sourceUrl || mainImageUrl || remoteMainImageUrl || detailUrl,
      crawlFinalUrl: sourceUrl,
      title,
      description,
      mainImageUrl: mainImageUrl || remoteMainImageUrl || null,
      galleryImageUrls: remoteImages,
      image: normalizedImage,
      errors: Array.isArray(item.errors)
        ? item.errors.map((entry) => asText(entry)).filter(Boolean)
        : [],
      searchJob: {
        status: "done",
        startedAt: importAt,
        finishedAt: importAt,
        error: null,
        lastRunAt: importAt,
      },
      sourceJob: {
        status: "done",
        stage: "done",
        queuedAt: null,
        startedAt: importAt,
        finishedAt: importAt,
        updatedAt: importAt,
        error: null,
      },
      googleTaxonomy: {
        status: title ? "queued" : "idle",
        sourceTitle: title,
        queuedAt: title ? importAt : null,
        startedAt: null,
        finishedAt: null,
        updatedAt: importAt,
        error: null,
      },
      reviewStatus: "new",
    });

    const mutableRecord = suggestionRecord as Record<string, unknown>;
    const partnerName = firstString(item.partner_name, item.partnerName, item.user, item.submitted_by);
    mutableRecord.partner_name = partnerName || null;
    mutableRecord.partnerName = partnerName || null;
    mutableRecord.user = partnerName || null;
    mutableRecord.submitted_by = partnerName || null;
    mutableRecord.payload_type = "product_suggestions_1688_json_v1";
    mutableRecord.source_platform = asText(item.source_platform || "1688_extension");
    mutableRecord.imported_from_json_file = file.name;
    mutableRecord.imported_from_json_base = baseName;
    mutableRecord.platform_attributes = {
      ...sourceAttrs,
      import: {
        source: "product_suggestions_add_products",
        imported_at: importAt,
        imported_file: file.name,
      },
    };
    // Keep the full extension item for traceability; production payload still uses per-item JSON.
    mutableRecord.extension_payload_1688 = {
      ...payloadItem,
      variations: resolvedVariations,
      production_variant_selection:
        resolvedVariantSelection || item.production_variant_selection || null,
      weight_review_1688: resolvedWeightReview || item.weight_review_1688 || null,
    };

    try {
      await saveSuggestionRecord(suggestionRecord);
    } catch (error) {
      errors.push(
        `${file.name}: failed to save suggestion for item ${index + 1}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      continue;
    }

    const [searchUpsert, selectionUpsert] = await Promise.all([
      adminClient
        .from("discovery_production_supplier_searches")
        .upsert(
          {
            provider: PARTNER_SUGGESTION_PROVIDER,
            product_id: suggestionId,
            fetched_at: importAt,
            offers: [
              {
                rank: 1,
                offerId,
                detailUrl,
                imageUrl: remoteMainImageUrl,
                subject: title,
                subject_en: title,
              },
            ],
            input: {
              source: "json_upload",
              file_name: file.name,
              mode: "preloaded_1688",
            },
            meta: {
              source: "json_upload",
              preloaded: true,
              payload_file_name: payloadFileName,
            },
          },
          { onConflict: "provider,product_id" }
        ),
      adminClient
        .from("discovery_production_supplier_selection")
        .upsert(
          {
            provider: PARTNER_SUGGESTION_PROVIDER,
            product_id: suggestionId,
            selected_offer_id: offerId,
            selected_detail_url: detailUrl,
            selected_offer: selectedOffer,
            selected_at: importAt,
            selected_by: userId,
            updated_at: importAt,
          },
          { onConflict: "provider,product_id" }
        ),
    ]);

    if (searchUpsert.error || selectionUpsert.error) {
      errors.push(
        `${file.name}: supplier preload failed for item ${index + 1}: ${
          searchUpsert.error?.message || selectionUpsert.error?.message || "unknown error"
        }`
      );
      // Keep the suggestion as a fallback row; the normal search queue can still process it.
      records.push(suggestionRecord);
      continue;
    }

    records.push(suggestionRecord);
    preloadedIds.push(suggestionId);
  }

  return { records, preloadedIds, errors };
};

export async function GET(request: Request) {
  const auth = await requireSignedIn();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const { data: queueRows, error: queueError } = await adminClient
    .from("discovery_production_items")
    .select("user_id, provider, product_id, created_at")
    .eq("provider", PARTNER_SUGGESTION_PROVIDER)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 });
  }

  const rows = (queueRows ?? []) as QueueRow[];
  if (rows.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const ids = rows.map((row) => asText(row.product_id)).filter(Boolean);

  const [
    { data: searchRows, error: searchError },
    { data: selectionRows, error: selectionError },
    { data: productionStatusRows, error: productionStatusError },
    { data: productionSpuRows, error: productionSpuError },
  ] = await Promise.all([
    adminClient
      .from("discovery_production_supplier_searches")
      .select("product_id, fetched_at, offers, input, meta")
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_supplier_selection")
      .select("product_id, selected_offer_id, selected_detail_url, selected_offer, selected_at, updated_at")
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_status")
      .select(
        "product_id, status, updated_at, spu_assigned_at, production_started_at, production_done_at, last_file_name, last_job_id"
      )
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_item_spus")
      .select("product_id, spu, assigned_at")
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
  ]);

  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }
  if (selectionError) {
    return NextResponse.json({ error: selectionError.message }, { status: 500 });
  }
  if (productionStatusError) {
    return NextResponse.json({ error: productionStatusError.message }, { status: 500 });
  }
  if (productionSpuError) {
    return NextResponse.json({ error: productionSpuError.message }, { status: 500 });
  }

  const [{ data: marketRows }, { data: classRows }] = await Promise.all([
    adminClient
      .from("b2b_pricing_markets")
      .select("market, currency, fx_rate_cny, weight_threshold_g, packing_fee, markup_percent, markup_fixed"),
    adminClient
      .from("b2b_pricing_shipping_classes")
      .select("market, shipping_class, rate_low, rate_high, base_low, base_high, mult_low, mult_high"),
  ]);

  const markets = mapMarketConfigRows(marketRows ?? []);
  const shippingClasses = mapShippingClassRows(classRows ?? []);

  const searchById = new Map<string, Record<string, unknown>>();
  (searchRows ?? []).forEach((row) => {
    const rowRecord =
      row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const id = asText(rowRecord?.product_id);
    if (!id) return;
    searchById.set(id, rowRecord || {});
  });

  const selectionById = new Map<string, Record<string, unknown>>();
  (selectionRows ?? []).forEach((row) => {
    const rowRecord =
      row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const id = asText(rowRecord?.product_id);
    if (!id) return;
    selectionById.set(id, rowRecord || {});
  });

  const productionStatusById = new Map<string, Record<string, unknown>>();
  (productionStatusRows ?? []).forEach((row) => {
    const rowRecord =
      row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const id = asText(rowRecord?.product_id);
    if (!id) return;
    productionStatusById.set(id, rowRecord || {});
  });

  const productionSpuById = new Map<string, ProductionSpuRow>();
  (productionSpuRows as ProductionSpuRow[] | null | undefined)?.forEach((row) => {
    const id = asText(row?.product_id);
    const spu = asText(row?.spu);
    if (!id || !spu) return;
    const existing = productionSpuById.get(id);
    const existingAt = Date.parse(asText(existing?.assigned_at || "")) || 0;
    const nextAt = Date.parse(asText(row?.assigned_at || "")) || 0;
    if (!existing || nextAt >= existingAt) {
      productionSpuById.set(id, {
        product_id: id,
        spu,
        assigned_at: asText(row?.assigned_at) || null,
      });
    }
  });

  const taxonomyQueueIds = new Set<string>();
  const items = await Promise.all(
    rows.map(async (row) => {
      const id = asText(row.product_id);
      const createdAt = asText(row.created_at) || new Date().toISOString();
      const loadedSuggestion =
        (await loadSuggestionRecord(id)) || buildFallbackRecord(id, createdAt, asText(row.user_id));
      let suggestion = normalizeExternalDataForRecord(loadedSuggestion);
      let shouldSaveSuggestion =
        JSON.stringify(loadedSuggestion) !== JSON.stringify(suggestion);
      const normalizedReviewStatus = normalizeSuggestionReviewStatus(
        suggestion.reviewStatus
      );
      if (suggestion.reviewStatus !== normalizedReviewStatus) {
        suggestion = {
          ...suggestion,
          reviewStatus: normalizedReviewStatus,
        };
        shouldSaveSuggestion = true;
      }

      const nowIso = new Date().toISOString();
      const searchJobStatus = asText(suggestion.searchJob?.status).toLowerCase();
      if (searchJobStatus === "queued" || searchJobStatus === "running") {
        const searchStartedAt = firstString(
          suggestion.searchJob?.startedAt,
          suggestion.searchJob?.queuedAt,
          suggestion.searchJob?.lastRunAt,
          suggestion.createdAt,
          createdAt
        );
        if (isStatusStale(searchStartedAt, SEARCH_JOB_STALE_MS)) {
          suggestion = {
            ...suggestion,
            searchJob: {
              ...(suggestion.searchJob || {}),
              status: "error",
              startedAt:
                firstString(
                  suggestion.searchJob?.startedAt,
                  suggestion.searchJob?.queuedAt
                ) || searchStartedAt || nowIso,
              finishedAt: nowIso,
              lastRunAt: nowIso,
              error:
                asText(suggestion.searchJob?.error) ||
                "Supplier search timed out. Please retry.",
            },
          };
          shouldSaveSuggestion = true;
        }
      }

      const sourceJobStatus = asText(suggestion.sourceJob?.status).toLowerCase();
      if (sourceJobStatus === "queued" || sourceJobStatus === "running") {
        const sourceStartedAt = firstString(
          suggestion.sourceJob?.startedAt,
          suggestion.sourceJob?.queuedAt,
          suggestion.sourceJob?.updatedAt,
          suggestion.createdAt,
          createdAt
        );
        if (isStatusStale(sourceStartedAt, SOURCE_JOB_STALE_MS)) {
          suggestion = {
            ...suggestion,
            sourceJob: {
              ...(suggestion.sourceJob || {}),
              status: "error",
              stage: "done",
              startedAt:
                firstString(
                  suggestion.sourceJob?.startedAt,
                  suggestion.sourceJob?.queuedAt
                ) || sourceStartedAt || nowIso,
              finishedAt: nowIso,
              updatedAt: nowIso,
              error:
                asText(suggestion.sourceJob?.error) ||
                "Source crawl timed out. Please retry.",
            },
          };
          shouldSaveSuggestion = true;
        }
      }

      const taxonomyJobStatus = asText(suggestion.googleTaxonomy?.status).toLowerCase();
      if (taxonomyJobStatus === "queued" || taxonomyJobStatus === "running") {
        const taxonomyStartedAt = firstString(
          suggestion.googleTaxonomy?.startedAt,
          suggestion.googleTaxonomy?.queuedAt,
          suggestion.googleTaxonomy?.updatedAt,
          suggestion.createdAt,
          createdAt
        );
        if (isStatusStale(taxonomyStartedAt, TAXONOMY_JOB_STALE_MS)) {
          suggestion = {
            ...suggestion,
            googleTaxonomy: {
              ...(suggestion.googleTaxonomy || {}),
              status: "error",
              startedAt:
                firstString(
                  suggestion.googleTaxonomy?.startedAt,
                  suggestion.googleTaxonomy?.queuedAt
                ) || taxonomyStartedAt || nowIso,
              finishedAt: nowIso,
              updatedAt: nowIso,
              error:
                asText(suggestion.googleTaxonomy?.error) ||
                "Google taxonomy fetch timed out. Please retry.",
            },
          };
          shouldSaveSuggestion = true;
        }
      }

      if (shouldSaveSuggestion) {
        suggestion = normalizeExternalDataForRecord(suggestion);
        try {
          await saveSuggestionRecord(suggestion);
        } catch {
          // keep response flowing even if local metadata write fails
        }
      }
      const search = searchById.get(id);
      const selection = selectionById.get(id);
      const productionStatus = productionStatusById.get(id);
      const productionSpu = productionSpuById.get(id);
      const offers = Array.isArray(search?.offers) ? (search?.offers as unknown[]) : [];
      let normalizedSelection = selection;
      let selectedOffer =
        selection?.selected_offer && typeof selection.selected_offer === "object"
          ? (selection.selected_offer as Record<string, unknown>)
          : null;
      const payloadStatus = asText(selectedOffer?._production_payload_status).toLowerCase();
      if (
        normalizedSelection &&
        (payloadStatus === "queued" || payloadStatus === "fetching")
      ) {
        const payloadUpdatedAt = firstString(
          selectedOffer?._production_payload_updated_at,
          normalizedSelection.updated_at,
          normalizedSelection.selected_at
        );
        if (isStatusStale(payloadUpdatedAt, PAYLOAD_JOB_STALE_MS)) {
          const timedOutAt = new Date().toISOString();
          const timedOutError =
            asText(selectedOffer?._production_payload_error) ||
            "1688 payload fetch timed out. Please retry.";
          const patchedOffer: Record<string, unknown> = {
            ...(selectedOffer || {}),
            _production_payload_status: "failed",
            _production_payload_error: timedOutError,
            _production_payload_updated_at: timedOutAt,
          };

          selectedOffer = patchedOffer;
          normalizedSelection = {
            ...(normalizedSelection as Record<string, unknown>),
            selected_offer: patchedOffer,
            updated_at: timedOutAt,
          };

          try {
            await adminClient
              .from("discovery_production_supplier_selection")
              .update({
                selected_offer: patchedOffer,
                updated_at: timedOutAt,
              })
              .eq("provider", PARTNER_SUGGESTION_PROVIDER)
              .eq("product_id", id);
          } catch {
            // keep response flowing even if DB status patch fails
          }
        }
      }
      const firstOfferEnglish = offers
        .map((offer) =>
          offer && typeof offer === "object"
            ? asText((offer as Record<string, unknown>).subject_en)
            : ""
        )
        .find(Boolean);
      const titleFallbackFromSupplier = firstString(
        selectedOffer?.subject_en,
        firstOfferEnglish
      );
      if ((!suggestion.title || hasCjk(suggestion.title)) && titleFallbackFromSupplier) {
        suggestion = normalizeExternalDataForRecord({
          ...suggestion,
          title: titleFallbackFromSupplier,
        });
        try {
          await saveSuggestionRecord(suggestion);
        } catch {
          // keep response flowing even if local metadata write fails
        }
      }

      const taxonomyTitleCandidate = firstString(
        suggestion.title,
        suggestion.externalData?.title,
        suggestion.externalData?.rawTitle
      );
      const taxonomyStatus = asText(suggestion.googleTaxonomy?.status).toLowerCase();
      const taxonomySourceTitle = asText(suggestion.googleTaxonomy?.sourceTitle);
      const taxonomyPath = asText(suggestion.googleTaxonomy?.path);
      const taxonomyNeedsQueue =
        Boolean(taxonomyTitleCandidate) &&
        taxonomyStatus !== "running" &&
        (taxonomyStatus === "idle" ||
          !taxonomyPath ||
          (taxonomyStatus === "done" && taxonomySourceTitle !== taxonomyTitleCandidate));
      if (taxonomyNeedsQueue) {
        suggestion = normalizeExternalDataForRecord({
          ...suggestion,
          googleTaxonomy: {
            ...(suggestion.googleTaxonomy || {}),
            status: "queued",
            sourceTitle: taxonomyTitleCandidate,
            queuedAt: nowIso,
            startedAt: null,
            finishedAt: null,
            updatedAt: nowIso,
            error: null,
          },
        });
        try {
          await saveSuggestionRecord(suggestion);
        } catch {
          // keep response flowing even if local metadata write fails
        }
      }
      if (
        asText(suggestion.googleTaxonomy?.status).toLowerCase() === "queued" &&
        Boolean(
          firstString(
            suggestion.googleTaxonomy?.sourceTitle,
            suggestion.title,
            suggestion.externalData?.title,
            suggestion.externalData?.rawTitle
          )
        )
      ) {
        taxonomyQueueIds.add(id);
      }

      const variantMetrics = await deriveVariantSelectionMetrics(selectedOffer);
      const pricingBase =
        variantMetrics && markets.length > 0 && shippingClasses.length > 0
          ? computeB2BPrices(
              variantMetrics.purchasePriceCny,
              variantMetrics.weightGrams,
              variantMetrics.shippingClass,
              markets,
              shippingClasses
            )
          : [];
      let pricing: Array<{
        market: string;
        currency: string;
        b2bPrice: number;
        shippingCost: number;
        stockCost: number;
        totalCost: number;
        b2bPriceMin?: number;
        b2bPriceMax?: number;
      }> = pricingBase.map((entry) => ({ ...entry }));

      if (variantMetrics && markets.length > 0 && shippingClasses.length > 0) {
        const metricPairs =
          Array.isArray(variantMetrics.selectedMetrics) && variantMetrics.selectedMetrics.length > 0
            ? variantMetrics.selectedMetrics
            : [
                {
                  priceCny: variantMetrics.priceMinCny,
                  weightGrams: variantMetrics.weightMinGrams,
                },
                {
                  priceCny: variantMetrics.priceMaxCny,
                  weightGrams: variantMetrics.weightMaxGrams,
                },
              ];

        const spanByCurrency = new Map<
          string,
          { market: string; currency: string; min: number; max: number }
        >();

        for (const pair of metricPairs) {
          const pairPrice = Number(pair?.priceCny);
          const pairWeight = Number(pair?.weightGrams);
          if (!Number.isFinite(pairPrice) || !Number.isFinite(pairWeight)) continue;
          if (pairPrice <= 0 || pairWeight <= 0) continue;

          const pairPricing = computeB2BPrices(
            pairPrice,
            pairWeight,
            variantMetrics.shippingClass,
            markets,
            shippingClasses
          );

          for (const entry of pairPricing) {
            const currency = asText(entry.currency || entry.market).toUpperCase();
            const market = asText(entry.market).toUpperCase() || currency;
            const key = currency || market;
            if (!key) continue;
            const amount = Number(entry.b2bPrice);
            if (!Number.isFinite(amount)) continue;

            const existing = spanByCurrency.get(key);
            if (!existing) {
              spanByCurrency.set(key, {
                market,
                currency: currency || market,
                min: amount,
                max: amount,
              });
            } else {
              existing.min = Math.min(existing.min, amount);
              existing.max = Math.max(existing.max, amount);
            }
          }
        }

        if (spanByCurrency.size > 0) {
          const baseByCurrency = new Map(
            pricingBase.map((entry) => [
              asText(entry.currency || entry.market).toUpperCase(),
              entry,
            ])
          );

          pricing = Array.from(spanByCurrency.values()).map((span) => {
            const key = asText(span.currency || span.market).toUpperCase();
            const base = baseByCurrency.get(key);
            const basePrice = Number(base?.b2bPrice);
            const fallback = Number.isFinite(basePrice) ? basePrice : span.min;
            const shippingCost = Number(base?.shippingCost);
            const stockCost = Number(base?.stockCost);
            const totalCost = Number(base?.totalCost);

            return {
              market: span.market || asText(base?.market) || key,
              currency: span.currency || asText(base?.currency) || key || "SEK",
              b2bPrice: fallback,
              shippingCost: Number.isFinite(shippingCost) ? shippingCost : 0,
              stockCost: Number.isFinite(stockCost) ? stockCost : 0,
              totalCost: Number.isFinite(totalCost) ? totalCost : 0,
              b2bPriceMin: span.min,
              b2bPriceMax: span.max,
            };
          });
        }
      }
      const normalizedMainImageUrl =
        makeAbsoluteIfRelative(request, suggestion.mainImageUrl) || suggestion.mainImageUrl;
      const normalizedSourceUrl =
        makeAbsoluteIfRelative(request, suggestion.sourceUrl) ||
        suggestion.sourceUrl ||
        normalizedMainImageUrl ||
        null;
      const normalizedExternalData = suggestion.externalData
        ? {
            ...suggestion.externalData,
            inputUrl:
              makeAbsoluteIfRelative(request, suggestion.externalData.inputUrl) ||
              suggestion.externalData.inputUrl,
            finalUrl:
              makeAbsoluteIfRelative(request, suggestion.externalData.finalUrl) ||
              suggestion.externalData.finalUrl,
            rawMainImageUrl:
              makeAbsoluteIfRelative(request, suggestion.externalData.rawMainImageUrl) ||
              suggestion.externalData.rawMainImageUrl,
            mainImageUrl:
              makeAbsoluteIfRelative(request, suggestion.externalData.mainImageUrl) ||
              suggestion.externalData.mainImageUrl,
            galleryImageUrls: Array.isArray(suggestion.externalData.galleryImageUrls)
              ? suggestion.externalData.galleryImageUrls.map(
                  (entry) => makeAbsoluteIfRelative(request, entry) || entry
                )
              : [],
            status: suggestion.externalData.status
              ? {
                  ...suggestion.externalData.status,
                  images: {
                    ...suggestion.externalData.status.images,
                    mainImageUrl:
                      makeAbsoluteIfRelative(
                        request,
                        suggestion.externalData.status.images?.mainImageUrl || null
                      ) || suggestion.externalData.status.images?.mainImageUrl || null,
                  },
                }
              : suggestion.externalData.status,
          }
        : null;

      return {
        ...suggestion,
        reviewStatus: normalizedReviewStatus,
        createdAt,
        sourceUrl: normalizedSourceUrl,
        mainImageUrl: normalizedMainImageUrl,
        externalData: normalizedExternalData,
        search: {
          fetchedAt: asText(search?.fetched_at) || null,
          offerCount: offers.length,
          offers,
          input: search?.input ?? null,
          meta: search?.meta ?? null,
        },
        selection: normalizedSelection
          ? {
              selected_offer_id: firstString(normalizedSelection.selected_offer_id) || null,
              selected_detail_url:
                firstString(normalizedSelection.selected_detail_url) ||
                firstString(selectedOffer?.detailUrl, selectedOffer?.detail_url) ||
                null,
              selected_at: firstString(normalizedSelection.selected_at) || null,
              updated_at: firstString(normalizedSelection.updated_at) || null,
              selected_offer: selectedOffer,
              payload_status: firstString(selectedOffer?._production_payload_status) || null,
              payload_error: firstString(selectedOffer?._production_payload_error) || null,
              payload_file_name: firstString(selectedOffer?._production_payload_file_name) || null,
              payload_file_path: firstString(selectedOffer?._production_payload_file_path) || null,
            }
          : null,
        variantMetrics,
        pricing,
        productionStatus: productionStatus
          ? {
              status: firstString(productionStatus.status) || null,
              updated_at: firstString(productionStatus.updated_at) || null,
              spu_assigned_at: firstString(productionStatus.spu_assigned_at) || null,
              production_started_at:
                firstString(productionStatus.production_started_at) || null,
              production_done_at:
                firstString(productionStatus.production_done_at) || null,
              last_file_name: firstString(productionStatus.last_file_name) || null,
              last_job_id: firstString(productionStatus.last_job_id) || null,
            }
          : null,
        production_assigned_spu: productionSpu?.spu || null,
      };
    })
  );

  if (taxonomyQueueIds.size > 0) {
    spawnBackgroundTaxonomyWorker(Array.from(taxonomyQueueIds));
  }

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form payload." }, { status: 400 });
  }

  const rawUrls = asText(formData.get("urls"));
  const queueSearch = toBool(formData.get("queue_search"), true);
  const parsedUrls = parseInputUrls(rawUrls).slice(0, MAX_URLS_PER_REQUEST);

  const fileInputs = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File)
    .slice(0, MAX_FILES_PER_REQUEST);

  if (fileInputs.length === 0 && parsedUrls.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one image, zip, or URL." },
      { status: 400 }
    );
  }

  const created: ProductSuggestionRecord[] = [];
  const errors: string[] = [];
  const preloadedSuggestionIds = new Set<string>();

  for (const file of fileInputs) {
    if (file.size <= 0) continue;

    try {
      if (isJsonFile(file)) {
        const imported = await importPreloaded1688JsonFile({
          file,
          userId: auth.user.id,
          adminClient,
        });
        imported.records.forEach((record) => {
          created.push(record);
        });
        imported.preloadedIds.forEach((id) => {
          preloadedSuggestionIds.add(id);
        });
        errors.push(...imported.errors);
        continue;
      }

      if (isZipFile(file)) {
        const zipBuffer = Buffer.from(await file.arrayBuffer());
        const extracted = await extractImagesFromZipBuffer(zipBuffer);
        for (const entry of extracted.slice(0, MAX_FILES_PER_REQUEST)) {
          try {
            const record = await createImageSuggestion({
              userId: auth.user.id,
              sourceLabel: `${file.name}:${entry.fileName}`,
              sourceUrl: null,
              title: null,
              description: null,
              buffer: entry.buffer,
            });
            created.push(record);
          } catch (error) {
            errors.push(
              `Failed to process ${entry.fileName}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
        if (extracted.length === 0) {
          errors.push(`Zip ${file.name} did not contain any readable image files.`);
        }
        continue;
      }

      if (!isImageFile(file)) {
        errors.push(`Unsupported file skipped: ${file.name}`);
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const record = await createImageSuggestion({
        userId: auth.user.id,
        sourceLabel: file.name,
        sourceUrl: null,
        title: null,
        description: null,
        buffer,
      });
      created.push(record);
    } catch (error) {
      errors.push(
        `Failed to process ${file.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  for (let urlIndex = 0; urlIndex < parsedUrls.length; urlIndex += 1) {
    const url = parsedUrls[urlIndex];
    const crawl = await crawlUrlForProduct(url);
    const crawlErrors = [...crawl.errors];

    let mainImagePath: string | null = null;
    let normalizedImage: ProductSuggestionRecord["image"] = null;
    const preferredImageUrl =
      crawl.mainImageUrl || (crawl.imageUrls.length > 0 ? crawl.imageUrls[0] : null);

    const runAiCleanup = urlIndex < URL_AI_CLEANUP_MAX_PER_REQUEST;
    if (!runAiCleanup) {
      crawlErrors.push(
        "AI cleanup skipped for this URL because the request batch is large."
      );
    }

    const createdAt = new Date().toISOString();
    const externalData = await buildExternalDataForUrlSuggestion({
      inputUrl: url,
      finalUrl: crawl.finalUrl,
      title: asText(crawl.title),
      description: asText(crawl.description),
      readablePageText: asText(crawl.readableText),
      mainImageUrl: preferredImageUrl || crawl.mainImageUrl || null,
      galleryImageUrls: crawl.imageUrls,
      errors: crawlErrors,
      createdAt,
      runAiCleanup,
    });

    const normalizedImageResult = await fetchAndNormalizeBestImageCandidate(
      [
        externalData.mainImageUrl,
        ...(Array.isArray(externalData.galleryImageUrls) ? externalData.galleryImageUrls : []),
        preferredImageUrl,
        ...crawl.imageUrls,
      ],
      {
        preferredUrl: externalData.mainImageUrl || preferredImageUrl || null,
        maxAttempts: 10,
      }
    );
    if (normalizedImageResult.image) {
      normalizedImage = normalizedImageResult.image;
      mainImagePath = normalizedImageResult.image.publicPath;
    } else {
      if (
        preferredImageUrl ||
        asText(externalData.mainImageUrl) ||
        externalData.galleryImageUrls.length > 0
      ) {
        crawlErrors.push("No usable product image could be normalized from the URL.");
      } else {
        crawlErrors.push("No product image could be identified from URL.");
      }
      crawlErrors.push(...normalizedImageResult.errors.slice(0, 3));
    }

    const record: ProductSuggestionRecord = normalizeExternalDataForRecord({
      id: createSuggestionId(),
      provider: PARTNER_SUGGESTION_PROVIDER,
      createdAt,
      createdBy: auth.user.id,
      sourceType: "url",
      sourceLabel: url,
      sourceUrl: url,
      crawlFinalUrl: crawl.finalUrl,
      title: externalData.title || asText(crawl.title) || null,
      description: externalData.description || asText(crawl.description) || null,
      mainImageUrl: mainImagePath || preferredImageUrl || crawl.mainImageUrl || null,
      galleryImageUrls:
        externalData.galleryImageUrls.length > 0
          ? externalData.galleryImageUrls
          : crawl.imageUrls,
      image: normalizedImage,
      externalData,
      errors: Array.from(new Set([...crawlErrors, ...(externalData.errors || [])])),
      searchJob: {
        status: "idle",
        error: null,
        lastRunAt: createdAt,
      },
      sourceJob: {
        status: "done",
        stage: "done",
        queuedAt: null,
        startedAt: createdAt,
        finishedAt: createdAt,
        updatedAt: createdAt,
        error: null,
      },
      reviewStatus: "new",
    });

    try {
      await saveSuggestionRecord(record);
      created.push(record);
    } catch (error) {
      errors.push(
        `Failed to save URL suggestion ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (created.length === 0) {
    return NextResponse.json({ error: "No suggestions were created.", details: errors }, { status: 400 });
  }

  const queueRows = created.map((record) => ({
    user_id: auth.user.id,
    provider: PARTNER_SUGGESTION_PROVIDER,
    product_id: record.id,
    created_at: record.createdAt,
  }));

  const { error: queueError } = await adminClient
    .from("discovery_production_items")
    .upsert(queueRows, { onConflict: "user_id,provider,product_id" });

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 });
  }

  let queuedRecords = created;
  let queueWorkerStarted = false;
  let queuedSearchCount = 0;
  if (queueSearch) {
    const queuedAt = new Date().toISOString();
    const queuedSearchRecords = created.filter((record) => !preloadedSuggestionIds.has(record.id));
    queuedSearchCount = queuedSearchRecords.length;
    queuedRecords = created.map((record) =>
      preloadedSuggestionIds.has(record.id)
        ? record
        : {
            ...record,
            searchJob: {
              status: "queued" as const,
              queuedAt,
              startedAt: null,
              finishedAt: null,
              error: null,
              lastRunAt: queuedAt,
            },
          }
    );

    await Promise.all(
      queuedRecords.map((record) => saveSuggestionRecord(record))
    );

    queueWorkerStarted =
      queuedSearchCount === 0
        ? true
        : spawnBackgroundSupplierSearchWorker(
            request,
            queuedSearchRecords.map((record) => record.id)
          );

    if (queuedSearchCount > 0 && !queueWorkerStarted) {
      errors.push("Background supplier search worker failed to start.");
      const failedAt = new Date().toISOString();
      queuedRecords = queuedRecords.map((record) => ({
        ...record,
        searchJob: preloadedSuggestionIds.has(record.id)
          ? record.searchJob
          : {
              status: "error" as const,
              queuedAt: record.searchJob?.queuedAt || failedAt,
              startedAt: failedAt,
              finishedAt: failedAt,
              error: "Background supplier search worker failed to start.",
              lastRunAt: failedAt,
            },
      }));
      await Promise.all(
        queuedRecords.map((record) => saveSuggestionRecord(record))
      );
    }
  }

  const taxonomyQueueIds = queuedRecords
    .filter((record) => {
      const status = asText(record.googleTaxonomy?.status).toLowerCase();
      const title = firstString(
        record.googleTaxonomy?.sourceTitle,
        record.title,
        record.externalData?.title,
        record.externalData?.rawTitle
      );
      return status === "queued" && Boolean(title);
    })
    .map((record) => asText(record.id))
    .filter(Boolean);
  let taxonomyWorkerStarted = false;
  if (taxonomyQueueIds.length > 0) {
    taxonomyWorkerStarted = spawnBackgroundTaxonomyWorker(taxonomyQueueIds);
    if (!taxonomyWorkerStarted) {
      errors.push("Background Google taxonomy worker failed to start.");
    }
  }

  const responseItems = queuedRecords.map((record) => {
    const normalized = normalizeExternalDataForRecord(record);
    const normalizedMainImageUrl =
      makeAbsoluteIfRelative(request, normalized.mainImageUrl) || normalized.mainImageUrl;
    const normalizedSourceUrl =
      makeAbsoluteIfRelative(request, normalized.sourceUrl) ||
      normalized.sourceUrl ||
      normalizedMainImageUrl;

    const normalizedExternalData = normalized.externalData
      ? {
          ...normalized.externalData,
          inputUrl:
            makeAbsoluteIfRelative(request, normalized.externalData.inputUrl) ||
            normalized.externalData.inputUrl,
          finalUrl:
            makeAbsoluteIfRelative(request, normalized.externalData.finalUrl) ||
            normalized.externalData.finalUrl,
          rawMainImageUrl:
            makeAbsoluteIfRelative(request, normalized.externalData.rawMainImageUrl) ||
            normalized.externalData.rawMainImageUrl,
          mainImageUrl:
            makeAbsoluteIfRelative(request, normalized.externalData.mainImageUrl) ||
            normalized.externalData.mainImageUrl,
          galleryImageUrls: Array.isArray(normalized.externalData.galleryImageUrls)
            ? normalized.externalData.galleryImageUrls.map(
                (entry) => makeAbsoluteIfRelative(request, entry) || entry
              )
            : [],
          status: normalized.externalData.status
            ? {
                ...normalized.externalData.status,
                images: {
                  ...normalized.externalData.status.images,
                  mainImageUrl:
                    makeAbsoluteIfRelative(
                      request,
                      normalized.externalData.status.images?.mainImageUrl || null
                    ) || normalized.externalData.status.images?.mainImageUrl || null,
                },
              }
            : normalized.externalData.status,
        }
      : null;

    return {
      ...normalized,
      mainImageUrl: normalizedMainImageUrl,
      sourceUrl: normalizedSourceUrl,
      externalData: normalizedExternalData,
    };
  });

  return NextResponse.json({
    ok: true,
    provider: PARTNER_SUGGESTION_PROVIDER,
    createdCount: created.length,
    items: responseItems,
    preloadedCount: preloadedSuggestionIds.size,
    queuedSearchCount,
    queueSearch,
    queueWorkerStarted,
    taxonomyWorkerStarted,
    errors,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const payload = await request.json().catch(() => null);
  const ids: string[] = Array.from(
    new Set(
      (Array.isArray(payload?.ids) ? payload.ids : [])
        .map((entry: unknown) => asText(entry))
        .filter((entry: string) => /^[a-z0-9][a-z0-9_-]{5,80}$/i.test(entry))
    )
  );

  if (ids.length === 0) {
    return NextResponse.json({ error: "No valid suggestion IDs provided." }, { status: 400 });
  }

  const statusRaw = asText(payload?.status).toLowerCase();
  if (statusRaw !== "new" && statusRaw !== "unqualified") {
    return NextResponse.json(
      { error: "Status must be either 'new' or 'unqualified'." },
      { status: 400 }
    );
  }
  const nextStatus = statusRaw as SuggestionReviewStatus;

  let updateResults: Array<{ id: string; updated: boolean }>;
  try {
    updateResults = await Promise.all(
      ids.map(async (id) => {
        const current = await loadSuggestionRecord(id);
        if (!current) {
          return { id, updated: false as const };
        }
        const nextRecord = normalizeExternalDataForRecord({
          ...current,
          reviewStatus: nextStatus,
        });
        await saveSuggestionRecord(nextRecord);
        return { id, updated: true as const };
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && asText(error.message)
            ? error.message
            : "Failed to update suggestion status.",
      },
      { status: 500 }
    );
  }

  const updatedIds = updateResults.filter((entry) => entry.updated).map((entry) => entry.id);
  const missingIds = updateResults.filter((entry) => !entry.updated).map((entry) => entry.id);

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    updatedCount: updatedIds.length,
    updatedIds,
    missingIds,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const payload = await request.json().catch(() => null);
  const ids: string[] = Array.from(
    new Set(
      (Array.isArray(payload?.ids) ? payload.ids : [])
        .map((entry: unknown) => asText(entry))
        .filter((entry: string) => /^[a-z0-9][a-z0-9_-]{5,80}$/i.test(entry))
    )
  );

  if (ids.length === 0) {
    return NextResponse.json({ error: "No valid suggestion IDs provided." }, { status: 400 });
  }

  const [
    queueDeleteResult,
    searchDeleteResult,
    selectionDeleteResult,
  ] = await Promise.all([
    adminClient
      .from("discovery_production_items")
      .delete()
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_supplier_searches")
      .delete()
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
    adminClient
      .from("discovery_production_supplier_selection")
      .delete()
      .eq("provider", PARTNER_SUGGESTION_PROVIDER)
      .in("product_id", ids),
  ]);

  const dbError =
    queueDeleteResult.error ||
    searchDeleteResult.error ||
    selectionDeleteResult.error;
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await Promise.all(ids.map((id) => deleteSuggestionRecord(id)));

  return NextResponse.json({
    ok: true,
    deletedCount: ids.length,
    ids,
  });
}
